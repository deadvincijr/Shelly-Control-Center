import asyncio
<<<<<<< HEAD
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, FileResponse

BASE_DIR = Path(__file__).resolve().parent

# =====================================================================
# 1. GPIOZERO MOTOR CONTROL (Pi 5 RP1 Hardware Mapping with Safe Fallback)
# =====================================================================
class _DummyPin:
    def on(self):
        pass

    def off(self):
        pass

    def close(self):
        pass

try:
    from gpiozero import DigitalOutputDevice
    # Left Motor: IN1 -> GPIO 17, IN2 -> GPIO 27
    in1 = DigitalOutputDevice(17, initial_value=False)
    in2 = DigitalOutputDevice(27, initial_value=False)

    # Right Motor: IN3 -> GPIO 5, IN4 -> GPIO 6
    in3 = DigitalOutputDevice(5, initial_value=False)
    in4 = DigitalOutputDevice(6, initial_value=False)
    GPIO_AVAILABLE = True
except Exception as exc:
    print(f"[WARN] GPIO initialization skipped or unavailable ({exc}). Using mock pins.")
    in1 = _DummyPin()
    in2 = _DummyPin()
    in3 = _DummyPin()
    in4 = _DummyPin()
    GPIO_AVAILABLE = False
=======
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, FileResponse
from gpiozero import DigitalOutputDevice

app = FastAPI(title="Shelly Control Panel & RC Rover")
BASE_DIR = Path(__file__).resolve().parent

# =====================================================================
# 1. GPIOZERO MOTOR CONTROL (Pi 5 RP1 Hardware Mapping)
# =====================================================================
# Left Motor: IN1 -> GPIO 17, IN2 -> GPIO 27
in1 = DigitalOutputDevice(17, initial_value=False)
in2 = DigitalOutputDevice(27, initial_value=False)

# Right Motor: IN3 -> GPIO 5, IN4 -> GPIO 6
in3 = DigitalOutputDevice(5, initial_value=False)
in4 = DigitalOutputDevice(6, initial_value=False)
>>>>>>> 07ebbf490fbd608ff356776252f0f540e46845ee

def leftmotorforward():
    in1.on()
    in2.off()

def leftmotorback():
    in1.off()
    in2.on()

def leftmotoroff():
    in1.off()
    in2.off()

def rightmotorforward():
    in3.on()
    in4.off()

def rightmotorback():
    in3.off()
    in4.on()

def rightmotoroff():
    in3.off()
    in4.off()

def forward():
    leftmotorforward()
    rightmotorforward()

def backward():
    leftmotorback()
    rightmotorback()

def turn_left():
    leftmotorback()
    rightmotorforward()

def turn_right():
    leftmotorforward()
    rightmotorback()

def stop():
    leftmotoroff()
    rightmotoroff()

COMMANDS = {
    "forward": forward,
    "backward": backward,
    "left": turn_left,
    "right": turn_right,
    "stop": stop,
    "leftmotorforward": leftmotorforward,
    "leftmotorback": leftmotorback,
    "leftmotoroff": leftmotoroff,
    "rightmotorforward": rightmotorforward,
    "rightmotorback": rightmotorback,
    "rightmotoroff": rightmotoroff,
}

# =====================================================================
<<<<<<< HEAD
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
=======
# 2. LIVE MJPEG STREAMER (Shared Between Main Panel & RC Page)
# =====================================================================
class CameraStream:
    def __init__(self):
        self.process = None
        self.clients = set()
        self.lock = asyncio.Lock()

    async def start_stream(self):
        async with self.lock:
            if self.process is not None and self.process.returncode is None:
                return
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

    async def _read_frames(self):
        buffer = bytearray()
        try:
            while self.process and self.process.returncode is None:
                chunk = await self.process.stdout.read(16384)
>>>>>>> 07ebbf490fbd608ff356776252f0f540e46845ee
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
<<<<<<< HEAD
                    for q in list(self.clients):
=======
                    for q in self.clients:
>>>>>>> 07ebbf490fbd608ff356776252f0f540e46845ee
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
<<<<<<< HEAD
            if not self.clients:
                if self._idle_task and not self._idle_task.done():
                    self._idle_task.cancel()
                self._idle_task = asyncio.create_task(self._schedule_idle_stop())

camera = CameraStream()

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    stop()
    await camera.stop_stream()
    for pin in (in1, in2, in3, in4):
        try:
            pin.close()
        except Exception:
            pass

app = FastAPI(title="Shelly Control Panel & RC Rover", lifespan=lifespan)

=======

camera = CameraStream()

>>>>>>> 07ebbf490fbd608ff356776252f0f540e46845ee
# =====================================================================
# 3. ROUTES & WEBSOCKETS
# =====================================================================
@app.get("/")
async def serve_index():
    return FileResponse(BASE_DIR / "index.html")

@app.get("/rc")
async def serve_rc():
    return FileResponse(BASE_DIR / "rc.html")

@app.get("/style.css")
async def serve_css():
    return FileResponse(BASE_DIR / "style.css")

@app.get("/script.js")
async def serve_js():
    return FileResponse(BASE_DIR / "script.js")

<<<<<<< HEAD
@app.get("/config.json")
async def serve_config():
    return FileResponse(BASE_DIR / "config.json")

=======
>>>>>>> 07ebbf490fbd608ff356776252f0f540e46845ee
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
<<<<<<< HEAD

=======
>>>>>>> 07ebbf490fbd608ff356776252f0f540e46845ee
