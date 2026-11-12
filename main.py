import asyncio
import shutil
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, FileResponse

BASE_DIR = Path(__file__).resolve().parent

# =====================================================================
# 1. MOTOR CONTROL (Simultaneous multi-pin pinctrl op dh/dl)
# =====================================================================
HAS_PINCTRL = shutil.which("pinctrl") is not None


def _set_pins(pins: str, level: str):
    """
    Sets one or more comma-separated GPIO pins (e.g. '17,5') to output mode ('op')
    and drives them HIGH ('dh') or LOW ('dl') in a single atomic pinctrl call
    so both motors receive their signal at the exact same microsecond.
    """
    if HAS_PINCTRL:
        subprocess.run(
            ["pinctrl", "set", str(pins), "op", level],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        print(f"[MOCK PINCTRL] pinctrl set {pins} op {level}")


# Individual Motor Functions (matching pseudocode)
def leftmotorforward():
    _set_pins("27", "dl")  # LOW
    _set_pins("17", "dh")  # HIGH


def leftmotorback():
    _set_pins("17", "dl")  # LOW
    _set_pins("27", "dh")  # HIGH


def leftmotoroff():
    _set_pins("17,27", "dl")  # BOTH LOW


leftmotorstop = leftmotoroff


def rightmotorforward():
    _set_pins("6", "dl")   # LOW
    _set_pins("5", "dh")   # HIGH


def rightmotorback():
    _set_pins("5", "dl")   # LOW
    _set_pins("6", "dh")   # HIGH


def rightmotoroff():
    _set_pins("5,6", "dl")   # BOTH LOW


rightmotorstop = rightmotoroff


# Combined Dual-Motor Actions (Fires both motors simultaneously in one pinctrl call)
def forward():
    # Left (17=dh, 27=dl) + Right (5=dh, 6=dl) simultaneously
    _set_pins("27,6", "dl")
    _set_pins("17,5", "dh")


def backward():
    # Left (17=dl, 27=dh) + Right (5=dl, 6=dh) simultaneously
    _set_pins("17,5", "dl")
    _set_pins("27,6", "dh")


def turn_left():
    # Left back (17=dl, 27=dh) + Right forward (5=dh, 6=dl) simultaneously
    _set_pins("17,6", "dl")
    _set_pins("27,5", "dh")


def turn_right():
    # Left forward (17=dh, 27=dl) + Right back (5=dl, 6=dh) simultaneously
    _set_pins("27,5", "dl")
    _set_pins("17,6", "dh")


def stop():
    # All 4 motor pins LOW simultaneously
    _set_pins("17,27,5,6", "dl")


# Ensure all motors start in the OFF state when server boots
stop()

COMMANDS = {
    "forward": forward,
    "backward": backward,
    "left": turn_left,
    "right": turn_right,
    "stop": stop,
    "leftmotorforward": leftmotorforward,
    "leftmotorback": leftmotorback,
    "leftmotoroff": leftmotoroff,
    "leftmotorstop": leftmotorstop,
    "rightmotorforward": rightmotorforward,
    "rightmotorback": rightmotorback,
    "rightmotoroff": rightmotoroff,
    "rightmotorstop": rightmotorstop,
}


# =====================================================================
# 2. LIVE MJPEG STREAMER (Shared + Auto-Sleep When Idle to Save CPU)
# =====================================================================
class CameraStream:
    def __init__(self, idle_timeout: float = 5.0):
        self.process = None
        self.clients = set()
        self.lock = asyncio.Lock()
        self.idle_timeout = idle_timeout
        self._idle_task = None

    async def start_stream(self):
        async with self.lock:
            if self._idle_task and not self._idle_task.done():
                self._idle_task.cancel()
                self._idle_task = None

            if self.process is not None and self.process.returncode is None:
                return

            try:
                self.process = await asyncio.create_subprocess_exec(
                    "rpicam-vid",
                    "-t", "0", "-n", "--inline",
                    "--width", "1280", "--height", "720",
                    "--framerate", "30", "--codec", "mjpeg",
                    "--flush", "-o", "-",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL
                )
                asyncio.create_task(self._read_frames())
            except FileNotFoundError:
                print("[WARN] 'rpicam-vid' not found. Camera stream requires a Raspberry Pi with rpicam-apps.")
                self.process = None

    async def stop_stream(self):
        async with self.lock:
            if self.process is not None and self.process.returncode is None:
                try:
                    self.process.terminate()
                    await asyncio.wait_for(self.process.wait(), timeout=2.0)
                except Exception:
                    try:
                        self.process.kill()
                    except Exception:
                        pass
            self.process = None

    async def _schedule_idle_stop(self):
        try:
            await asyncio.sleep(self.idle_timeout)
            if not self.clients:
                await self.stop_stream()
        except asyncio.CancelledError:
            pass

    async def _read_frames(self):
        buffer = bytearray()
        proc = self.process
        try:
            while proc and proc.returncode is None and proc.stdout:
                chunk = await proc.stdout.read(16384)
                if not chunk:
                    break
                buffer.extend(chunk)
                while True:
                    start = buffer.find(b"\xff\xd8")
                    if start == -1:
                        buffer.clear()
                        break
                    end = buffer.find(b"\xff\xd9", start)
                    if end == -1:
                        if start > 0:
                            del buffer[:start]
                        break
                    frame = bytes(buffer[start : end + 2])
                    del buffer[: end + 2]
                    dead = set()
                    for q in list(self.clients):
                        try:
                            if q.full():
                                q.get_nowait()
                            q.put_nowait(frame)
                        except Exception:
                            dead.add(q)
                    self.clients -= dead
        except Exception:
            pass

    async def frame_generator(self):
        await self.start_stream()
        q = asyncio.Queue(maxsize=2)
        self.clients.add(q)
        try:
            while True:
                frame = await q.get()
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(frame)).encode() + b"\r\n\r\n"
                    + frame + b"\r\n"
                )
        finally:
            self.clients.discard(q)
            if not self.clients:
                if self._idle_task and not self._idle_task.done():
                    self._idle_task.cancel()
                self._idle_task = asyncio.create_task(self._schedule_idle_stop())


camera = CameraStream()


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop()
    yield
    stop()
    await camera.stop_stream()


app = FastAPI(title="Shelly Control Panel & RC Rover", lifespan=lifespan)


# =====================================================================
# 3. ROUTES & WEBSOCKETS
# =====================================================================
@app.get("/")
async def serve_index():
    return FileResponse(BASE_DIR / "index.html")


@app.get("/rc")
@app.get("/rc.html")
async def serve_rc():
    return FileResponse(BASE_DIR / "rc.html")


@app.get("/style.css")
async def serve_css():
    return FileResponse(BASE_DIR / "style.css")


@app.get("/script.js")
async def serve_js():
    return FileResponse(BASE_DIR / "script.js")


@app.get("/config.json")
async def serve_config():
    return FileResponse(BASE_DIR / "config.json")


@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(
        camera.frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.websocket("/ws/control")
async def websocket_control(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            cmd = (await websocket.receive_text()).strip().lower()
            action = COMMANDS.get(cmd)
            if action:
                action()
                await websocket.send_text(f"state:{cmd}")
    except WebSocketDisconnect:
        stop()
    except Exception:
        stop()
