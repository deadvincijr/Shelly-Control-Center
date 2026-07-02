// System Dashboard initialized on Ragnarok framework loop.
console.log("script.js:6 System Dashboard initialized on Ragnarok framework loop.");
console.log("script.js:49 Telemetry backend checking pipelines for Creality K1C diagnostics...");

document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll(".ptz-btn");
    const driverFrame = document.getElementsByName("cam_driver")[0];

    buttons.forEach(button => {
        button.addEventListener("click", () => {
            const targetUrl = button.getAttribute("data-url");
            console.log(`script.js:29 Routing execution string to camera node: ${targetUrl}`);
            
            if (driverFrame) {
                driverFrame.src = targetUrl;
            }
        });
    });
});