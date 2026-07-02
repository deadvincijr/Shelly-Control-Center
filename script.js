console.log("System Dashboard initialized on Ragnarok framework loop.");
console.log("Telemetry backend checking pipelines for Creality K1C diagnostics...");

document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll(".ptz-btn");
    const driverFrame = document.getElementsByName("cam_driver")[0];

    buttons.forEach(button => {
        button.addEventListener("click", () => {
            const targetUrl = button.getAttribute("data-url");
            console.log(`Routing execution string to camera node: ${targetUrl}`);
            
            if (driverFrame) {
                driverFrame.src = targetUrl;
            }
        });
    });

    // Initialize the K1C printer stream
    initializeK1CStream();
});

/**
 * Initializes the WebRTC connection to the Creality K1C printer.
 */
function initializeK1CStream() {
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
    function sendOfferToCall(sdp) {
        const xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                try {
                    let res = JSON.parse(atob(this.responseText));
                    console.log("Printer accepted offer:", res);
                    if (res.type == 'answer') {
                        pc.setRemoteDescription(new RTCSessionDescription(res));
                    }
                } catch (e) {
                    console.error("Error parsing printer response:", e);
                }
            }
        };
        
        xhttp.open('POST', 'http://10.0.6.166:8000/call/webrtc_local');
        xhttp.setRequestHeader('Content-Type', 'plain/text');
        xhttp.send(btoa(JSON.stringify({ 'type': 'offer', 'sdp': sdp })));
    }

    pc.onicecandidate = event => {
        if (event.candidate === null) {
            sendOfferToCall(pc.localDescription.sdp);
        }
    };

    // 4. Kick off the WebRTC request process
    pc.addTransceiver('video', { 'direction': 'sendrecv' });
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch(err => console.error("Error creating WebRTC offer:", err));
}