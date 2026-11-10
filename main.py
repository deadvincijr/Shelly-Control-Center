import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from gpiozero import DigitalOutputDevice

app = FastAPI(title="Shelly Control Center")

# Mount static directory for HTML/CSS/JS files
app.mount("/static", StaticFiles(directory="static"), name="static")

# =====================================================================
# 1. GPIOZERO PIN DEFINITIONS (Raspberry Pi 5 RP1 Hardware Mapping)
# =====================================================================
# Left Motor: IN1 -> GPIO 17, IN2 -> GPIO 27
in1 = DigitalOutputDevice(17, initial_value=False)
in2 = DigitalOutputDevice(27, initial_value=False)

# Right Motor: IN3 -> GPIO 5, IN4 -> GPIO 6
in3 = DigitalOutputDevice(5, initial_value=False)
in4 = DigitalOutputDevice(6, initial_value=False)


# --- Individual Motor Functions ---
def leftmotorforward():
    in1.on()   # GPIO 17 HIGH (dh)
    in2.off()  # GPIO 27 LOW  (dl)

def leftmotorback():
    in1.off()  # GPIO 17 LOW  (dl)
    in2.on()   # GPIO 27 HIGH (dh)

def leftmotoroff():
    in1.off()  # GPIO 17 LOW  (dl)
    in2.off()  # GPIO 27 LOW  (dl)

def rightmotorforward():
    in3.on()   # GPIO 5 HIGH  (dh)
    in4.off()  # GPIO 6 LOW   (dl)

def rightmotorback():
    in3.off()  # GPIO 5 LOW   (dl)
    in4.on()   # GPIO 6 HIGH  (dh)

def rightmotoroff():
    in3.off()  # GPIO 5 LOW   (dl)
    in4.off()  # GPIO 6 LOW   (dl)


# --- Combined Movement Functions ---
def forward():
    leftmotorforward()
    rightmotorforward()

def backward():
    leftmotorback()
    rightmotorback()

def turn_left():
    # Pivot tank turn left: Left motor back, Right motor forward
    leftmotorback()
    rightmotorforward()

def turn_right():
    # Pivot tank turn right: Left motor forward, Right motor back
    leftmotorforward()
    rightmotorback()

def stop():
    leftmotoroff()
    rightmotoroff()


# Command Lookup Table
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
# 2. ZERO-LATENCY CAMERA STREAMER (rpicam-vid MJPEG Broadcast)
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
            # Spawn rpicam-vid writing raw MJPEG directly to stdout pipe
            self.process = await asyncio.create_subprocess_exec(
                "rpicam-vid",
                "-t", "0",
                "-n",
                "--inline",
                "--width", "1280",
                "--height", "720",
                "--framerate", "30",
                "--codec", "mjpeg",
                "--flush",
                "-o", "-",
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

                # Extract complete JPEG frames (SOI: \xff\xd8 to EOI: \xff\xd9)
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

                    # Broadcast frame to all open web views (Main Panel + RC Page)
                    dead_clients = set()
                    for queue in self.clients:
                        try:
                            if queue.full():
                                queue.get_nowait()  # Drop stale frame for zero latency
                            queue.put_nowait(frame)
                        except Exception:
                            dead_clients.add(queue)
                    self.clients -= dead_clients
        except Exception:
            pass

    async def frame_generator(self):
        await self.start_stream()
        queue = asyncio.Queue(maxsize=2)
        self.clients.add(queue)
        try:
            while True:
                frame = await queue.get()
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(frame)).encode() + b"\r\n\r\n"
                    + frame + b"\r\n"
                )
        finally:
            self.clients.discard(queue)


camera = CameraStream()


# =====================================================================
# 3. ROUTES & WEBSOCKET ENDPOINTS
# =====================================================================
@app.get("/")
async def serve_panel():
    return FileResponse("static/index.html")


@app.get("/rc")
async def serve_rc():
    return FileResponse("static/rc.html")


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
        # Failsafe: Immediately cut motor power if client disconnects or closes tab
        stop()
    except Exception:
        stop()
