console.log("System Dashboard initialized on Ragnarok framework loop.");
console.log("Telemetry backend checking pipelines for Creality K1C diagnostics...");

document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll(".ptz-btn");

    buttons.forEach(button => {
        button.addEventListener("click", () => {
            // Use .dataset for cleaner access to data-* attributes
            const targetUrl = button.dataset.url;
            if (!targetUrl) return;

            console.log(`Sending command to camera node: ${targetUrl}`);
            try {
                // Use the "image ping" trick to send an authenticated GET request
                // without worrying about CORS issues that come with fetch().
                const img = new Image();
                img.src = targetUrl;
            } catch (error) {
                console.error(`Error sending command to ${targetUrl}:`, error);
            }
        });
    });

    // Initialize the K1C printer stream
    initializeK1CStream();
});

/**
 * Initializes the WebRTC connection to the Creality K1C printer.
 */
async function initializeK1CStream() {
    const videoElement = document.getElementById('k1c-video');
    if (!videoElement) {
        console.error("K1C video element not found on the page.");
        return;
    }

    // 1. Initialize the WebRTC Peer Connection
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // 2. When the printer sends the video feed, attach it to our HTML video tag
    pc.ontrack = function (event) {
        console.log("Video stream received from K1C!");
        if (videoElement.srcObject !== event.streams[0]) {
            videoElement.srcObject = event.streams[0];
        }
    };

    pc.oniceconnectionstatechange = () => console.log("K1C WebRTC State: ", pc.iceConnectionState);

    // 3. Negotiate the connection via the printer's API
    async function sendOfferToCall(sdp) {
        const offerPayload = btoa(JSON.stringify({ 'type': 'offer', 'sdp': sdp }));
        try {
            const response = await fetch('http://10.0.6.166:8000/call/webrtc_local', {
                method: 'POST',
                headers: { 'Content-Type': 'plain/text' },
                body: offerPayload,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const responseText = await response.text();
            const res = JSON.parse(atob(responseText));
            console.log("Printer accepted offer:", res);

            if (res.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(res));
            }
        } catch (e) {
            console.error("Error during WebRTC negotiation:", e);
        }
    }

    pc.onicecandidate = event => {
        if (event.candidate === null) {
            console.log("ICE gathering complete. Sending offer.");
            sendOfferToCall(pc.localDescription.sdp).catch(e => console.error("Failed to send offer:", e));
        }
    };

    // 4. Kick off the WebRTC request process
    try {
        pc.addTransceiver('video', { 'direction': 'sendrecv' });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
    } catch (err) {
        console.error("Error creating WebRTC offer:", err);
    }
}


async function checkK1CStatus() {
    const statusElement = document.getElementById('Crealitycheck');
    if (!statusElement) return;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4-second timeout

        const response = await fetch('http://10.0.6.166:8000/server/info', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            statusElement.innerHTML = `3D Printer: <strong>Online 🟢</strong>`;
        } else {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        console.error("Error checking K1C status:", error);
        if (statusElement) statusElement.innerHTML = `3D Printer: <strong>Offline 🔴</strong>`;
    }
}

checkK1CStatus();
setInterval(checkK1CStatus, 5000); // Check every 5 seconds


function checkDlinkStatus() {
    const statusElement = document.getElementById('Dlinkcheck');
    if (!statusElement) return;

    const img = new Image();
    let timeout = null;

    const setStatus = (online) => {
        // Clean up to prevent race conditions and memory leaks
        clearTimeout(timeout);
        img.onload = null;
        img.onerror = null;
        statusElement.innerHTML = `Dlink Camera: <strong>${online ? 'Online 🟢' : 'Offline 🔴'}</strong>`;
    };

    // For a continuous MJPEG stream, 'onload' may never fire. If we don't get an
    // 'onerror' event after 4 seconds, we assume the stream is connecting.
    timeout = setTimeout(() => setStatus(true), 4000);

    img.onload = () => setStatus(true);
    img.onerror = () => setStatus(false);

    // Use a cache-busting parameter to ensure a fresh check every time.
    img.src = `http://10.0.7.65:8081/?c=${Date.now()}`;
}
checkDlinkStatus();
setInterval(checkDlinkStatus, 5000); // Check every 5 seconds