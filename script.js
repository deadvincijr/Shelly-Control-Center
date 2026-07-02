console.log("System Dashboard initialized on Ragnarok framework loop.");
console.log("Telemetry backend checking pipelines for Creality K1C diagnostics...");

document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll(".ptz-btn");

    buttons.forEach(button => {
        button.addEventListener("click", async () => {
            // Use .dataset for cleaner access to data-* attributes
            const targetUrl = button.dataset.url;
            if (!targetUrl) return;

            console.log(`Sending command to camera node: ${targetUrl}`);
            try {
                // Use fetch to send a "fire-and-forget" request.
                // 'no-cors' is used for simple requests to endpoints that don't return CORS headers.
                await fetch(targetUrl, { mode: 'no-cors' });
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