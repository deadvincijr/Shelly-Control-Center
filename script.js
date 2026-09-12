console.log("System Dashboard initialized on Ragnarok framework loop.");
console.log("Telemetry backend checking pipelines for Creality K1C diagnostics...");

// Card metadata definitions for visibility management
const CARD_METADATA = [
    { id: "card-live-camera", label: "Live Camera Feed", icon: "📹" },
    { id: "card-system-status", label: "System Status", icon: "ℹ️" },
    { id: "card-k1c-video-feed", label: "Creality K1C Feed", icon: "🎥" },
    { id: "card-k1c", label: "3D Printer Status", icon: "🖨️" },
    { id: "card-dlink", label: "Dlink Camera Status", icon: "📷" },
    { id: "card-raspberry", label: "Raspberry Pi Status", icon: "🍓" },
    { id: "card-jellyfin", label: "Jellyfin Status", icon: "🎬" },
    { id: "card-immich", label: "Immich Status", icon: "🖼️" },
    { id: "card-audiobookshelf", label: "Audio Bookshelf", icon: "📚" },
    { id: "card-nextcloud", label: "Nextcloud Status", icon: "☁️" },
    { id: "card-pihole", label: "Pi-hole Status", icon: "🛡️" },
    { id: "card-spyview", label: "Spy View Status", icon: "👁️" }
];

// Default base configuration matching config.json
const DEFAULT_CONFIG = {
    theme: "modern",
    cardVisibility: {
        "card-live-camera": true,
        "card-system-status": true,
        "card-k1c-video-feed": true,
        "card-k1c": true,
        "card-dlink": true,
        "card-raspberry": true,
        "card-jellyfin": true,
        "card-immich": true,
        "card-audiobookshelf": true,
        "card-nextcloud": true,
        "card-pihole": true,
        "card-spyview": true
    },
    devices: {
        raspberryPi: {
            name: "Raspberry Pi",
            status: "Online",
            ip: "10.0.4.55",
            tailscaleIp: "100.121.5.41"
        },
        k1c: {
            name: "Creality K1C 3D Printer",
            status: "Offline",
            ip: "10.0.6.166",
            port: "8000"
        },
        dlink: {
            name: "D-Link Camera",
            status: "Online",
            ip: "10.0.7.65",
            port: "8081",
            ptzIp: "10.0.4.55"
        }
    },
    services: {
        jellyfin: {
            name: "Jellyfin",
            status: "Operational",
            ip: "100.121.5.41",
            port: "8096"
        },
        immich: {
            name: "Immich",
            status: "Operational",
            ip: "100.121.5.41",
            port: "2283"
        },
        audiobookshelf: {
            name: "Audio Bookshelf",
            status: "Operational",
            ip: "100.121.5.41",
            port: "13378"
        },
        nextcloud: {
            name: "Nextcloud",
            status: "Operational",
            ip: "100.121.5.41",
            port: "8080"
        },
        pihole: {
            name: "Pi-hole",
            status: "Operational",
            ip: "100.121.5.41",
            port: "8088"
        },
        spyview: {
            name: "Spy View",
            status: "Operational",
            ip: "100.121.5.41",
            port: "4173"
        }
    }
};

const STORAGE_KEY = 'shelly_control_config';
let currentConfig = loadInitialConfig();

/**
 * Loads configuration from localStorage or falls back to default.
 */
function loadInitialConfig() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                theme: parsed.theme || DEFAULT_CONFIG.theme,
                cardVisibility: { ...DEFAULT_CONFIG.cardVisibility, ...(parsed.cardVisibility || {}) },
                devices: { ...DEFAULT_CONFIG.devices, ...(parsed.devices || {}) },
                services: { ...DEFAULT_CONFIG.services, ...(parsed.services || {}) }
            };
        }
    } catch (e) {
        console.warn("Error reading localStorage configuration:", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

/**
 * Saves configuration to localStorage.
 */
function saveConfigToStorage(config) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error("Failed to save to localStorage:", e);
    }
}

/**
 * Asynchronously try to fetch config.json on initial load if localStorage is empty.
 */
async function syncWithConfigFileIfEmpty() {
    if (!localStorage.getItem(STORAGE_KEY)) {
        try {
            const response = await fetch('./config.json');
            if (response.ok) {
                const json = await response.json();
                currentConfig = {
                    theme: json.theme || DEFAULT_CONFIG.theme,
                    cardVisibility: { ...DEFAULT_CONFIG.cardVisibility, ...(json.cardVisibility || {}) },
                    devices: { ...DEFAULT_CONFIG.devices, ...(json.devices || {}) },
                    services: { ...DEFAULT_CONFIG.services, ...(json.services || {}) }
                };
                saveConfigToStorage(currentConfig);
                applyConfigToDOM(currentConfig);
                applyTheme(currentConfig.theme);
            }
        } catch (e) {
            console.log("Using default inline configuration (could not fetch config.json directly).");
        }
    }
}

// -------------------------------------------------------------
// THEME MANAGEMENT (MODERN vs CLASSIC)
// -------------------------------------------------------------

function applyTheme(themeName) {
    const isClassic = themeName === 'classic';
    if (isClassic) {
        document.body.classList.add('theme-classic');
    } else {
        document.body.classList.remove('theme-classic');
    }

    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.innerHTML = isClassic ? '✨ Modern Mode' : '🎨 Classic Mode';
        themeBtn.title = isClassic ? 'Switch to Modern UI' : 'Revert to Classic UI';
    }

    const classicToggle = document.getElementById('classic-mode-toggle');
    const themeLabel = document.getElementById('theme-mode-label');
    if (classicToggle) {
        classicToggle.checked = isClassic;
    }
    if (themeLabel) {
        themeLabel.textContent = isClassic ? 'Classic 🏛️' : 'Modern ✨';
        themeLabel.className = `switch-label ${isClassic ? 'status-offline' : 'status-theme'}`;
    }
}

function toggleThemeMode() {
    const nextTheme = currentConfig.theme === 'classic' ? 'modern' : 'classic';
    currentConfig.theme = nextTheme;
    saveConfigToStorage(currentConfig);
    applyTheme(nextTheme);
    showToast(`Switched to ${nextTheme === 'classic' ? 'Classic' : 'Modern'} theme!`);
}

// -------------------------------------------------------------
// CARD VISIBILITY
// -------------------------------------------------------------

function applyCardVisibility(vis) {
    if (!vis) return;
    CARD_METADATA.forEach(card => {
        const el = document.getElementById(card.id);
        if (el) {
            const isVisible = vis[card.id] !== false;
            if (isVisible) {
                el.classList.remove('card-hidden');
            } else {
                el.classList.add('card-hidden');
            }
        }
    });
}

// -------------------------------------------------------------
// DOM UPDATES & APPLICATION
// -------------------------------------------------------------

function applyConfigToDOM(cfg) {
    if (!cfg) return;

    // 1. Apply theme
    applyTheme(cfg.theme || 'modern');

    // 2. Apply card visibility
    applyCardVisibility(cfg.cardVisibility || DEFAULT_CONFIG.cardVisibility);

    // Map of exact DOM IDs for each service
    const serviceElementMap = {
        jellyfin: { check: 'Jellyfincheck', port: 'Jellyfinport', button: 'jellyfinbutton' },
        immich: { check: 'Immichcheck', port: 'Immichport', button: 'immichbutton' },
        audiobookshelf: { check: 'AudioBookshelfcheck', port: 'AudioBookshelfport', button: 'audiobookshelfbutton' },
        nextcloud: { check: 'Nextcloudcheck', port: 'Nextcloudport', button: 'nextcloudbutton' },
        pihole: { check: 'Piholecheck', port: 'Piholeport', button: 'piholebutton' },
        spyview: { check: 'Spyviewcheck', port: 'Spyviewport', button: 'spyviewbutton' }
    };

    // 3. Application Services
    const serviceKeys = Object.keys(cfg.services || {});
    serviceKeys.forEach(key => {
        const item = cfg.services[key];
        const isOperational = (item.status || '').toLowerCase() === 'operational';
        const mapping = serviceElementMap[key] || {
            check: capitalize(key) + 'check',
            port: capitalize(key) + 'port',
            button: `${key}button`
        };

        // Update status text
        const checkEl = document.getElementById(mapping.check);
        if (checkEl) {
            checkEl.innerHTML = `${item.name}: <strong>${isOperational ? 'Operational 🟢' : 'Offline 🔴'}</strong>`;
        }

        // Update port text
        const portEl = document.getElementById(mapping.port);
        if (portEl) {
            portEl.innerHTML = `${item.name} Port: <strong>${item.port}</strong>`;
        }

        // Update action button URL
        const btnEl = document.getElementById(mapping.button);
        if (btnEl) {
            btnEl.onclick = () => {
                const target = `http://${item.ip}:${item.port}`;
                window.open(target, '_blank');
            };
        }
    });

    // 4. Hardware / Devices
    // Raspberry Pi
    if (cfg.devices?.raspberryPi) {
        const rpi = cfg.devices.raspberryPi;
        const isOnline = (rpi.status || '').toLowerCase() === 'online';
        const checkEl = document.getElementById('Raspberrycheck');
        if (checkEl) checkEl.innerHTML = `Raspberry Pi: <strong>${isOnline ? 'Online 🟢' : 'Offline 🔴'}</strong>`;
        const ipEl = document.getElementById('Raspberryip');
        if (ipEl) ipEl.textContent = rpi.ip;
        const tailscaleEl = document.getElementById('Raspberrytailscale');
        if (tailscaleEl) tailscaleEl.textContent = rpi.tailscaleIp;
    }

    // Creality K1C
    if (cfg.devices?.k1c) {
        const k1c = cfg.devices.k1c;
        const ipEl = document.getElementById('Crealityip');
        if (ipEl) ipEl.textContent = k1c.ip;
        const checkEl = document.getElementById('Crealitycheck');
        if (checkEl && !window._k1cTelemetryActive) {
            const isOnline = (k1c.status || '').toLowerCase() === 'online';
            checkEl.innerHTML = `3D Printer: <strong>${isOnline ? 'Online 🟢' : 'Offline 🔴'}</strong>`;
        }
    }

    // D-Link Camera
    if (cfg.devices?.dlink) {
        const dlink = cfg.devices.dlink;
        const isOnline = (dlink.status || '').toLowerCase() === 'online';
        const checkEl = document.getElementById('Dlinkcheck');
        if (checkEl) checkEl.innerHTML = `Dlink Camera: <strong>${isOnline ? 'Online 🟢' : 'Offline 🔴'}</strong>`;
        const ipEl = document.getElementById('Dlinkip');
        if (ipEl) ipEl.textContent = dlink.ip;

        // Update Video Feed Image URL
        const feedImg = document.getElementById('dlink-feed');
        if (feedImg) {
            feedImg.src = `http://${dlink.ip}:${dlink.port}`;
        }

        // Update PTZ URLs and Unlock link
        const ptzHost = dlink.ptzIp || dlink.ip;
        const unlockLink = document.getElementById('unlock-motors-link');
        if (unlockLink) {
            unlockLink.href = `http://${ptzHost}`;
        }

        // Update directional PTZ button data-url attributes
        const ptzButtons = document.querySelectorAll('.ptz-btn');
        ptzButtons.forEach(btn => {
            const dir = btn.dataset.ptzDir;
            if (dir === 'up') {
                btn.dataset.url = `http://${ptzHost}/cgi/ptdc.cgi?command=set_relative_pos&posX=0&posY=10`;
            } else if (dir === 'down') {
                btn.dataset.url = `http://${ptzHost}/cgi/ptdc.cgi?command=set_relative_pos&posX=0&posY=-10`;
            } else if (dir === 'left') {
                btn.dataset.url = `http://${ptzHost}/cgi/ptdc.cgi?command=set_relative_pos&posX=-10&posY=0`;
            } else if (dir === 'right') {
                btn.dataset.url = `http://${ptzHost}/cgi/ptdc.cgi?command=set_relative_pos&posX=10&posY=0`;
            } else if (dir === 'home') {
                btn.dataset.url = `http://${ptzHost}/cgi/ptdc.cgi?command=go_home`;
            }
        });
    }
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// -------------------------------------------------------------
// ADMIN MODAL & SETTINGS UI
// -------------------------------------------------------------

function renderAdminSettingsForm() {
    // 1. Theme toggle in modal
    const isClassic = currentConfig.theme === 'classic';
    const classicToggle = document.getElementById('classic-mode-toggle');
    const themeLabel = document.getElementById('theme-mode-label');
    if (classicToggle) {
        classicToggle.checked = isClassic;
    }
    if (themeLabel) {
        themeLabel.textContent = isClassic ? 'Classic 🏛️' : 'Modern ✨';
        themeLabel.className = `switch-label ${isClassic ? 'status-offline' : 'status-theme'}`;
    }

    // 2. Card Visibility Toggles
    const visContainer = document.getElementById('visibility-settings-container');
    if (visContainer) {
        visContainer.innerHTML = '';
        const currentVis = currentConfig.cardVisibility || DEFAULT_CONFIG.cardVisibility;
        CARD_METADATA.forEach(card => {
            const isVisible = currentVis[card.id] !== false;
            const div = document.createElement('div');
            div.className = 'visibility-item';
            div.innerHTML = `
                <span class="visibility-item-title">${card.icon} ${card.label}</span>
                <div class="switch-container">
                    <span class="switch-label ${isVisible ? 'status-operational' : 'status-offline'}">
                        ${isVisible ? 'Visible 👁️' : 'Hidden 🚫'}
                    </span>
                    <label class="switch">
                        <input type="checkbox" class="card-vis-checkbox" data-card-id="${card.id}" ${isVisible ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            `;
            visContainer.appendChild(div);
        });
    }

    // 3. Render Services
    const servicesContainer = document.getElementById('services-settings-container');
    const devicesContainer = document.getElementById('devices-settings-container');

    if (servicesContainer) {
        servicesContainer.innerHTML = '';
        Object.keys(currentConfig.services).forEach(key => {
            const item = currentConfig.services[key];
            const isOperational = (item.status || '').toLowerCase() === 'operational';

            const itemCard = document.createElement('div');
            itemCard.className = 'setting-item';
            itemCard.dataset.serviceKey = key;
            itemCard.innerHTML = `
                <div class="setting-item-header">
                    <span class="setting-item-name">${item.name}</span>
                    <div class="switch-container">
                        <span class="switch-label ${isOperational ? 'status-operational' : 'status-offline'}">
                            ${isOperational ? 'Operational 🟢' : 'Offline 🔴'}
                        </span>
                        <label class="switch">
                            <input type="checkbox" class="service-status-toggle" data-key="${key}" ${isOperational ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <div class="setting-item-fields">
                    <div class="field-group">
                        <label>IP Address / Host</label>
                        <input type="text" class="service-ip-input" data-key="${key}" value="${escapeHtml(item.ip || '')}" placeholder="100.121.5.41">
                    </div>
                    <div class="field-group">
                        <label>Port</label>
                        <input type="text" class="service-port-input" data-key="${key}" value="${escapeHtml(item.port || '')}" placeholder="8080">
                    </div>
                </div>
            `;
            servicesContainer.appendChild(itemCard);
        });
    }

    // 4. Render Devices
    if (devicesContainer) {
        devicesContainer.innerHTML = '';
        
        // Raspberry Pi
        if (currentConfig.devices.raspberryPi) {
            const rpi = currentConfig.devices.raspberryPi;
            const isOnline = (rpi.status || '').toLowerCase() === 'online';
            const div = document.createElement('div');
            div.className = 'setting-item';
            div.innerHTML = `
                <div class="setting-item-header">
                    <span class="setting-item-name">${rpi.name}</span>
                    <div class="switch-container">
                        <span class="switch-label ${isOnline ? 'status-operational' : 'status-offline'}">
                            ${isOnline ? 'Online 🟢' : 'Offline 🔴'}
                        </span>
                        <label class="switch">
                            <input type="checkbox" id="device-rpi-status" ${isOnline ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <div class="setting-item-fields">
                    <div class="field-group">
                        <label>Local IP Address</label>
                        <input type="text" id="device-rpi-ip" value="${escapeHtml(rpi.ip || '')}" placeholder="10.0.4.55">
                    </div>
                    <div class="field-group">
                        <label>Tailscale IP Address</label>
                        <input type="text" id="device-rpi-tailscale" value="${escapeHtml(rpi.tailscaleIp || '')}" placeholder="100.121.5.41">
                    </div>
                </div>
            `;
            devicesContainer.appendChild(div);
        }

        // Creality K1C
        if (currentConfig.devices.k1c) {
            const k1c = currentConfig.devices.k1c;
            const isOnline = (k1c.status || '').toLowerCase() === 'online';
            const div = document.createElement('div');
            div.className = 'setting-item';
            div.innerHTML = `
                <div class="setting-item-header">
                    <span class="setting-item-name">${k1c.name}</span>
                    <div class="switch-container">
                        <span class="switch-label ${isOnline ? 'status-operational' : 'status-offline'}">
                            ${isOnline ? 'Online 🟢' : 'Offline 🔴'}
                        </span>
                        <label class="switch">
                            <input type="checkbox" id="device-k1c-status" ${isOnline ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <div class="setting-item-fields">
                    <div class="field-group">
                        <label>Printer IP Address</label>
                        <input type="text" id="device-k1c-ip" value="${escapeHtml(k1c.ip || '')}" placeholder="10.0.6.166">
                    </div>
                    <div class="field-group">
                        <label>Port</label>
                        <input type="text" id="device-k1c-port" value="${escapeHtml(k1c.port || '')}" placeholder="8000">
                    </div>
                </div>
            `;
            devicesContainer.appendChild(div);
        }

        // D-Link Camera
        if (currentConfig.devices.dlink) {
            const dlink = currentConfig.devices.dlink;
            const isOnline = (dlink.status || '').toLowerCase() === 'online';
            const div = document.createElement('div');
            div.className = 'setting-item';
            div.innerHTML = `
                <div class="setting-item-header">
                    <span class="setting-item-name">${dlink.name}</span>
                    <div class="switch-container">
                        <span class="switch-label ${isOnline ? 'status-operational' : 'status-offline'}">
                            ${isOnline ? 'Online 🟢' : 'Offline 🔴'}
                        </span>
                        <label class="switch">
                            <input type="checkbox" id="device-dlink-status" ${isOnline ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <div class="setting-item-fields">
                    <div class="field-group">
                        <label>Camera Feed IP</label>
                        <input type="text" id="device-dlink-ip" value="${escapeHtml(dlink.ip || '')}" placeholder="10.0.7.65">
                    </div>
                    <div class="field-group">
                        <label>Stream Port</label>
                        <input type="text" id="device-dlink-port" value="${escapeHtml(dlink.port || '')}" placeholder="8081">
                    </div>
                    <div class="field-group">
                        <label>PTZ Motor Host IP</label>
                        <input type="text" id="device-dlink-ptzip" value="${escapeHtml(dlink.ptzIp || '')}" placeholder="10.0.4.55">
                    </div>
                </div>
            `;
            devicesContainer.appendChild(div);
        }
    }

    attachSwitchListeners();
}

function attachSwitchListeners() {
    // Theme toggle switch listener
    const classicToggle = document.getElementById('classic-mode-toggle');
    if (classicToggle) {
        classicToggle.onchange = (e) => {
            const isClassic = e.target.checked;
            const themeLabel = document.getElementById('theme-mode-label');
            if (themeLabel) {
                themeLabel.textContent = isClassic ? 'Classic 🏛️' : 'Modern ✨';
                themeLabel.className = `switch-label ${isClassic ? 'status-offline' : 'status-theme'}`;
            }
        };
    }

    // Card Visibility switches listener
    const visChecks = document.querySelectorAll('.card-vis-checkbox');
    visChecks.forEach(cb => {
        cb.addEventListener('change', (e) => {
            const container = e.target.closest('.switch-container');
            if (container) {
                const label = container.querySelector('.switch-label');
                if (label) {
                    if (e.target.checked) {
                        label.className = 'switch-label status-operational';
                        label.textContent = 'Visible 👁️';
                    } else {
                        label.className = 'switch-label status-offline';
                        label.textContent = 'Hidden 🚫';
                    }
                }
            }
        });
    });

    // Service & Device status switches listener
    const toggles = document.querySelectorAll('.modal-content input[type="checkbox"].service-status-toggle, #device-rpi-status, #device-k1c-status, #device-dlink-status');
    toggles.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const container = e.target.closest('.switch-container');
            if (container) {
                const label = container.querySelector('.switch-label');
                const isService = e.target.classList.contains('service-status-toggle');
                if (label) {
                    if (e.target.checked) {
                        label.className = 'switch-label status-operational';
                        label.textContent = isService ? 'Operational 🟢' : 'Online 🟢';
                    } else {
                        label.className = 'switch-label status-offline';
                        label.textContent = 'Offline 🔴';
                    }
                }
            }
        });
    });
}

function saveSettingsFromModal() {
    const updated = JSON.parse(JSON.stringify(currentConfig));

    // Save Theme Choice
    const classicToggle = document.getElementById('classic-mode-toggle');
    if (classicToggle) {
        updated.theme = classicToggle.checked ? 'classic' : 'modern';
    }

    // Save Card Visibility
    const visChecks = document.querySelectorAll('.card-vis-checkbox');
    if (visChecks.length > 0) {
        updated.cardVisibility = {};
        visChecks.forEach(cb => {
            const cardId = cb.dataset.cardId;
            if (cardId) {
                updated.cardVisibility[cardId] = cb.checked;
            }
        });
    }

    // Save Services
    Object.keys(updated.services).forEach(key => {
        const toggle = document.querySelector(`.service-status-toggle[data-key="${key}"]`);
        const ipInput = document.querySelector(`.service-ip-input[data-key="${key}"]`);
        const portInput = document.querySelector(`.service-port-input[data-key="${key}"]`);

        if (toggle) {
            updated.services[key].status = toggle.checked ? 'Operational' : 'Offline';
        }
        if (ipInput) {
            updated.services[key].ip = ipInput.value.trim();
        }
        if (portInput) {
            updated.services[key].port = portInput.value.trim();
        }
    });

    // Save Devices
    // Raspberry Pi
    if (updated.devices.raspberryPi) {
        const rpiStatus = document.getElementById('device-rpi-status');
        const rpiIp = document.getElementById('device-rpi-ip');
        const rpiTailscale = document.getElementById('device-rpi-tailscale');
        if (rpiStatus) updated.devices.raspberryPi.status = rpiStatus.checked ? 'Online' : 'Offline';
        if (rpiIp) updated.devices.raspberryPi.ip = rpiIp.value.trim();
        if (rpiTailscale) updated.devices.raspberryPi.tailscaleIp = rpiTailscale.value.trim();
    }

    // Creality K1C
    if (updated.devices.k1c) {
        const k1cStatus = document.getElementById('device-k1c-status');
        const k1cIp = document.getElementById('device-k1c-ip');
        const k1cPort = document.getElementById('device-k1c-port');
        if (k1cStatus) updated.devices.k1c.status = k1cStatus.checked ? 'Online' : 'Offline';
        if (k1cIp) updated.devices.k1c.ip = k1cIp.value.trim();
        if (k1cPort) updated.devices.k1c.port = k1cPort.value.trim();
    }

    // D-Link
    if (updated.devices.dlink) {
        const dlinkStatus = document.getElementById('device-dlink-status');
        const dlinkIp = document.getElementById('device-dlink-ip');
        const dlinkPort = document.getElementById('device-dlink-port');
        const dlinkPtzIp = document.getElementById('device-dlink-ptzip');
        if (dlinkStatus) updated.devices.dlink.status = dlinkStatus.checked ? 'Online' : 'Offline';
        if (dlinkIp) updated.devices.dlink.ip = dlinkIp.value.trim();
        if (dlinkPort) updated.devices.dlink.port = dlinkPort.value.trim();
        if (dlinkPtzIp) updated.devices.dlink.ptzIp = dlinkPtzIp.value.trim();
    }

    currentConfig = updated;
    saveConfigToStorage(currentConfig);
    applyConfigToDOM(currentConfig);
    closeAdminModal();
    showToast('✓ Settings saved and persisted!');
}

function openAdminModal() {
    renderAdminSettingsForm();
    const modal = document.getElementById('admin-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    }
}

function closeAdminModal() {
    const modal = document.getElementById('admin-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
}

function exportConfigFile() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentConfig, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "config.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('📥 Exported config.json');
}

function importConfigFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported && (imported.services || imported.devices)) {
                currentConfig = {
                    theme: imported.theme || DEFAULT_CONFIG.theme,
                    cardVisibility: { ...DEFAULT_CONFIG.cardVisibility, ...(imported.cardVisibility || {}) },
                    devices: { ...DEFAULT_CONFIG.devices, ...(imported.devices || {}) },
                    services: { ...DEFAULT_CONFIG.services, ...(imported.services || {}) }
                };
                saveConfigToStorage(currentConfig);
                applyConfigToDOM(currentConfig);
                renderAdminSettingsForm();
                showToast('📂 config.json imported successfully!');
            } else {
                alert('Invalid configuration file structure.');
            }
        } catch (err) {
            console.error('Error importing JSON:', err);
            alert('Could not parse JSON file.');
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function resetToDefaults() {
    if (confirm("Reset all settings to default configuration?")) {
        currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        saveConfigToStorage(currentConfig);
        applyConfigToDOM(currentConfig);
        renderAdminSettingsForm();
        showToast('↺ Settings reset to default values.');
    }
}

let toastTimer = null;
function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// -------------------------------------------------------------
// EVENT LISTENERS & INITIALIZATION
// -------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    // Initial DOM and Theme update from stored/default config
    applyConfigToDOM(currentConfig);
    syncWithConfigFileIfEmpty();

    // PTZ buttons handler
    const buttons = document.querySelectorAll(".ptz-btn");
    buttons.forEach(button => {
        button.addEventListener("click", () => {
            const targetUrl = button.dataset.url;
            if (!targetUrl) return;

            console.log(`Sending command to camera node: ${targetUrl}`);
            try {
                const img = new Image();
                img.src = targetUrl;
            } catch (error) {
                console.error(`Error sending command to ${targetUrl}:`, error);
            }
        });
    });

    // Theme Toggle Button in Header
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleThemeMode);

    // Admin Modal Event Listeners
    const adminBtn = document.getElementById('admin-settings-btn');
    if (adminBtn) adminBtn.addEventListener('click', openAdminModal);

    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeAdminModal);

    const cancelBtn = document.getElementById('cancel-settings-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeAdminModal);

    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveSettingsFromModal);

    const exportBtn = document.getElementById('export-config-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportConfigFile);

    const importInput = document.getElementById('import-config-input');
    if (importInput) importInput.addEventListener('change', importConfigFile);

    const resetBtn = document.getElementById('reset-defaults-btn');
    if (resetBtn) resetBtn.addEventListener('click', resetToDefaults);

    const modal = document.getElementById('admin-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAdminModal();
            }
        });
    }

    // Keyboard support: ESC to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAdminModal();
        }
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

    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.ontrack = function (event) {
        console.log("Video stream received from K1C!");
        if (videoElement.srcObject !== event.streams[0]) {
            videoElement.srcObject = event.streams[0];
        }
    };

    pc.oniceconnectionstatechange = () => console.log("K1C WebRTC State: ", pc.iceConnectionState);

    async function sendOfferToCall(sdp) {
        const offerPayload = btoa(JSON.stringify({ 'type': 'offer', 'sdp': sdp }));
        const k1cIp = currentConfig.devices?.k1c?.ip || '10.0.6.166';
        const k1cPort = currentConfig.devices?.k1c?.port || '8000';
        try {
            const response = await fetch(`http://${k1cIp}:${k1cPort}/call/webrtc_local`, {
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

    const k1cIp = currentConfig.devices?.k1c?.ip || '10.0.6.166';
    const k1cPort = currentConfig.devices?.k1c?.port || '8000';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(`http://${k1cIp}:${k1cPort}/server/info`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            window._k1cTelemetryActive = true;
            statusElement.innerHTML = `3D Printer: <strong>Online 🟢</strong>`;
        } else {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        window._k1cTelemetryActive = false;
        if (error.name !== 'AbortError') {
            console.error("Error checking K1C status:", error);
        }
        if (statusElement) {
            const manualStatus = currentConfig.devices?.k1c?.status || 'Offline';
            const isOnline = manualStatus.toLowerCase() === 'online';
            statusElement.innerHTML = `3D Printer: <strong>${isOnline ? 'Online 🟢' : 'Offline 🔴'}</strong>`;
        }
    }
}

checkK1CStatus();
setInterval(checkK1CStatus, 5000);

// Global console helper functions preserved for backwards-compatibility
let jellyfinPort = 8096;
function setJellyfinStatus(status) {
    if (currentConfig.services?.jellyfin) {
        currentConfig.services.jellyfin.status = status.toLowerCase() === 'on' ? 'Operational' : 'Offline';
        saveConfigToStorage(currentConfig);
        applyConfigToDOM(currentConfig);
    }
}

function setJellyfinPort(port) {
    if (typeof port === 'number' && port > 0 && port < 65536) {
        if (currentConfig.services?.jellyfin) {
            currentConfig.services.jellyfin.port = String(port);
            saveConfigToStorage(currentConfig);
            applyConfigToDOM(currentConfig);
        }
    }
}