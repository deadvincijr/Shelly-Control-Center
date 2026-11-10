import asyncio
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
                    for q in self.clients:
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

camera = CameraStream()

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
