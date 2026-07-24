/* --- WarehouseFlow Javascript Controller --- */

// Audio Sound effects
let audioCtx = null;
function playSound(type) {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    if (type === 'scan') {
        // High beep
        osc.frequency.setValueAtTime(880, now); // A5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'success') {
        // Double notification beep
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.08); // A5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
    } else if (type === 'delete') {
        // Low double beep
        osc.frequency.setValueAtTime(220, now); // A3
        osc.frequency.setValueAtTime(147.14, now + 0.1); // D3
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'tap') {
        // Quiet click
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.02, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    }
}

// Global state variables
let state = {
    setupComplete: false,
    companyName: 'WarehouseFlow',
    warehouseName: 'Hovedlager',
    currency: 'DKK',
    language: 'da',
    scannerType: 'usb',
    logo: null,
    theme: 'dark'
};

let products = [];
let logs = [];

// DOM Elements
const modalSetup = document.getElementById("setup-wizard");
const viewDashboard = document.getElementById("view-dashboard");
const viewProducts = document.getElementById("view-products");
const viewActivityLog = document.getElementById("view-activity-log");
const viewStatistics = document.getElementById("view-statistics");
const viewSettings = document.getElementById("view-settings");

const views = {
    dashboard: viewDashboard,
    products: viewProducts,
    'activity-log': viewActivityLog,
    statistics: viewStatistics,
    settings: viewSettings
};

// Toast notification helper
function showToast(message, type = 'success') {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type === 'error' ? 'error' : type === 'warning' ? 'warning' : ''}`;
    toast.innerHTML = `
        <span>${type === 'error' ? '⚠️' : type === 'warning' ? '🔔' : '✅'}</span>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(15px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Log new activity to logs history
function logActivity(action, user = 'System') {
    const newLog = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        timestamp: new Date().toISOString(),
        user: user,
        action: action
    };
    logs.unshift(newLog);
    // Keep max 500 logs for localStorage capacity
    if (logs.length > 500) logs.pop();
    localStorage.setItem('wf_logs', JSON.stringify(logs));
}

// --- SETUP WIZARD CONTROLLERS ---
let setupCurrentStep = 1;
const setupSteps = [
    document.getElementById("setup-step-1"),
    document.getElementById("setup-step-2")
];

const btnSetupPrev = document.getElementById("btn-setup-prev");
const btnSetupNext = document.getElementById("btn-setup-next");

function updateSetupUI() {
    setupSteps.forEach((step, idx) => {
        step.classList.toggle("active", idx === (setupCurrentStep - 1));
    });
    
    if (setupCurrentStep === 1) {
        btnSetupPrev.style.visibility = "hidden";
        btnSetupNext.innerText = "Næste step";
    } else {
        btnSetupPrev.style.visibility = "visible";
        btnSetupNext.innerText = "Afslut opsætning";
    }
}

btnSetupNext.addEventListener("click", () => {
    playSound("tap");
    if (setupCurrentStep === 1) {
        const companyName = document.getElementById("setup-company-name").value.trim();
        if (!companyName) {
            showToast("Indtast venligst virksomhedsnavn!", "error");
            return;
        }
        state.companyName = companyName;
        state.warehouseName = document.getElementById("setup-warehouse-name").value.trim() || 'Hovedlager';
        state.currency = document.getElementById("setup-currency").value;
        state.language = document.getElementById("setup-language").value;
        
        setupCurrentStep = 2;
        updateSetupUI();
    } else {
        // Complete Setup
        state.setupComplete = true;
        localStorage.setItem('wf_state', JSON.stringify(state));
        modalSetup.style.display = "none";
        
        // Save initial default logs
        logActivity(`Lageret "${state.warehouseName}" blev oprettet successfully.`);
        
        // Render system Dashboard
        initDashboard();
        renderInventoryTable();
        initSettingsView();
        showToast("Velkommen til WarehouseFlow!");
        playSound("success");
    }
});

btnSetupPrev.addEventListener("click", () => {
    playSound("tap");
    if (setupCurrentStep > 1) {
        setupCurrentStep = 1;
        updateSetupUI();
    }
});

// Logo file uploads handling inside setup wizard
const logoInput = document.getElementById("setup-logo-input");
logoInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        state.logo = evt.target.result;
        document.getElementById("upload-status-text").innerText = `Logo indlæst: ${file.name}`;
        
        const logoImg = document.getElementById("app-company-logo");
        logoImg.src = state.logo;
    };
    reader.readAsDataURL(file);
});

// Primary scanner selector logic cards click toggle
const scannerCards = document.querySelectorAll(".scanner-option-card");
scannerCards.forEach(card => {
    card.addEventListener("click", () => {
        playSound("tap");
        scannerCards.forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        state.scannerType = card.getAttribute("data-scanner");
    });
});

// --- STATE LOADER ---
function loadState() {
    const savedState = localStorage.getItem('wf_state');
    if (savedState) {
        state = JSON.parse(savedState);
        if (state.setupComplete) {
            modalSetup.style.display = "none";
        }
        
        // Set logo
        if (state.logo) {
            document.getElementById("app-company-logo").src = state.logo;
        }
        document.getElementById("app-company-name-text").innerText = state.companyName;
    } else {
        modalSetup.style.display = "flex";
    }
    
    // Set theme
    document.documentElement.setAttribute("data-theme", state.theme || 'dark');
    
    const savedProducts = localStorage.getItem('wf_products');
    if (savedProducts) {
        products = JSON.parse(savedProducts);
    }
    
    const savedLogs = localStorage.getItem('wf_logs');
    if (savedLogs) {
        logs = JSON.parse(savedLogs);
    }
}

// Save products to local storage
function saveProducts() {
    localStorage.setItem('wf_products', JSON.stringify(products));
    initDashboard();
    renderInventoryTable();
}

// --- MODAL UTILITIES ---
function openModal(modalEl) {
    modalEl.classList.add("active");
}

function closeModal(modalEl) {
    modalEl.classList.remove("active");
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode = null;
            document.getElementById("interactive-camera-feed").innerHTML = "";
        }).catch(err => console.error(err));
    }
}

// Close buttons binding listeners
document.querySelectorAll(".modal-close-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        playSound("tap");
        const modal = e.target.closest(".modal") || e.target.closest(".detail-sheet-overlay");
        closeModal(modal);
    });
});

// --- NAVIGATION ROUTING ---
const navItems = document.querySelectorAll(".nav-item");
navItems.forEach(item => {
    item.addEventListener("click", () => {
        playSound("tap");
        navItems.forEach(nav => nav.classList.remove("active"));
        item.classList.add("active");
        
        const targetView = item.getAttribute("data-view");
        
        // Hide all views, display selected
        Object.keys(views).forEach(key => {
            views[key].classList.toggle("active", key === targetView);
        });
        
        // Update Title text
        document.getElementById("app-view-title").innerText = item.querySelector("span").innerText;
        
        // Reload layouts
        if (targetView === 'dashboard') {
            initDashboard();
        } else if (targetView === 'products') {
            renderInventoryTable();
        } else if (targetView === 'activity-log') {
            renderLogsTable();
        } else if (targetView === 'statistics') {
            initStatistics();
        }
        
        // Close sidebar on mobile
        document.querySelector(".app-sidebar").classList.remove("active");
    });
});

// Toggle Sidebar on mobile viewports
document.getElementById("btn-hamburger").addEventListener("click", () => {
    playSound("tap");
    document.querySelector(".app-sidebar").classList.toggle("active");
});

// Dark/Light Mode switch
document.getElementById("btn-theme-toggle").addEventListener("click", () => {
    playSound("tap");
    const currentTheme = document.documentElement.getAttribute("data-theme") || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute("data-theme", newTheme);
    state.theme = newTheme;
    localStorage.setItem('wf_state', JSON.stringify(state));
    initDashboard(); // Re-render stats chart colors
});

// --- DASHBOARD LAYOUT FUNCTIONS ---
function initDashboard() {
    // Totals calculations
    const totalProducts = products.length;
    let totalStock = 0;
    let lowStockCount = 0;
    let outStockCount = 0;
    
    products.forEach(p => {
        const qty = parseInt(p.quantity) || 0;
        totalStock += qty;
        if (qty === 0) {
            outStockCount++;
        } else if (qty <= (parseInt(p.minStock) || 5)) {
            lowStockCount++;
        }
    });
    
    document.getElementById("metric-total-products").innerText = totalProducts;
    document.getElementById("metric-total-stock").innerText = totalStock;
    document.getElementById("metric-low-stock").innerText = lowStockCount;
    document.getElementById("metric-out-stock").innerText = outStockCount;
    
    // Render Recent events feed (Max 5)
    const eventsList = document.getElementById("dashboard-recent-events");
    eventsList.innerHTML = "";
    if (logs.length === 0) {
        eventsList.innerHTML = `<div class="table-empty-state">Ingen hændelser logget.</div>`;
    } else {
        logs.slice(0, 5).forEach(log => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
            const item = document.createElement("div");
            item.className = "list-item";
            item.innerHTML = `
                <div class="list-item-info">
                    <div class="list-item-name">${log.action}</div>
                    <div class="list-item-sub">Af ${log.user} • Kl. ${timeStr}</div>
                </div>
            `;
            eventsList.appendChild(item);
        });
    }
    
    // Render Recent Scanned items list
    const recentScannedContainer = document.getElementById("dashboard-recent-scanned");
    recentScannedContainer.innerHTML = "";
    
    // Filter scanned activities in logs containing 'scannede' or 'oprettede'
    const scannedLogBarcodes = logs
        .filter(l => l.action.includes("scannede") || l.action.includes("oprettede"))
        .map(l => {
            const matches = l.action.match(/\((.*?)\)/);
            return matches ? matches[1] : null;
        })
        .filter(b => b); // Remove empty values
        
    // Unique list of barcodes scanned recently
    const uniqueBarcodes = [...new Set(scannedLogBarcodes)].slice(0, 3);
    const recentProducts = uniqueBarcodes
        .map(b => products.find(p => p.barcode === b))
        .filter(p => p); // Remove null values
        
    if (recentProducts.length === 0) {
        recentScannedContainer.innerHTML = `<div class="table-empty-state">Ingen nyligt scannede varer.</div>`;
    } else {
        recentProducts.forEach(p => {
            const statusClass = p.quantity === 0 ? 'badge-out-stock' : p.quantity <= p.minStock ? 'badge-low-stock' : 'badge-instock';
            const statusText = p.quantity === 0 ? 'Udsolgt' : p.quantity <= p.minStock ? 'Lav beholdning' : 'Lager OK';
            const item = document.createElement("div");
            item.className = "list-item";
            item.style.cursor = "pointer";
            item.innerHTML = `
                <div class="list-item-img-wrapper">
                    <img class="list-item-img" src="${p.image || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394a3b8\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><circle cx=\'12\' cy=\'12\' r=\'10\'></circle><line x1=\'12\' y1=\'8\' x2=\'12\' y2=\'16\'></line><line x1=\'8\' y1=\'12\' x2=\'16\' y2=\'12\'></line></svg>'}" alt="${p.name}">
                </div>
                <div class="list-item-info">
                    <div class="list-item-name">${p.name}</div>
                    <div class="list-item-sub">Barcode: ${p.barcode} • Reol: ${p.location || '-'}</div>
                </div>
                <span class="list-item-badge ${statusClass}">${p.quantity} stk</span>
            `;
            item.addEventListener("click", () => {
                showProductSheet(p.id);
            });
            recentScannedContainer.appendChild(item);
        });
    }
    
    // Draw SVG Lagerværdi Chart
    drawStockChart();
}

function drawStockChart() {
    const chart = document.getElementById("dashboard-stock-chart");
    if (!chart) return;
    
    // Calculate stock changes mock daily history
    let dailyValues = [4500, 5200, 4800, 6100, 5900, 7200, 8500]; // Fallback mock values
    
    // Try to calculate from active products values
    let totalVal = 0;
    products.forEach(p => {
        totalVal += (parseFloat(p.priceSale) || 0) * (parseInt(p.quantity) || 0);
    });
    if (totalVal > 0) {
        dailyValues[6] = Math.round(totalVal);
        dailyValues[5] = Math.round(totalVal * 0.85);
        dailyValues[4] = Math.round(totalVal * 0.9);
        dailyValues[3] = Math.round(totalVal * 0.72);
        dailyValues[2] = Math.round(totalVal * 0.75);
        dailyValues[1] = Math.round(totalVal * 0.60);
        dailyValues[0] = Math.round(totalVal * 0.55);
    }
    
    const maxVal = Math.max(...dailyValues, 1000) * 1.15;
    
    // Build path points
    const width = 500; // inner chart coordinates
    const height = 150;
    const xOffset = 50;
    const yOffset = 40;
    
    let pathD = "";
    let areaD = "";
    
    dailyValues.forEach((val, idx) => {
        const x = xOffset + (idx * (width / (dailyValues.length - 1)));
        const y = yOffset + height - ((val / maxVal) * height);
        
        if (idx === 0) {
            pathD = `M ${x} ${y}`;
            areaD = `M ${x} ${yOffset + height} L ${x} ${y}`;
        } else {
            pathD += ` L ${x} ${y}`;
            areaD += ` L ${x} ${y}`;
        }
        
        if (idx === dailyValues.length - 1) {
            areaD += ` L ${x} ${yOffset + height} Z`;
        }
    });
    
    chart.querySelector(".chart-line").setAttribute("d", pathD);
    chart.querySelector(".chart-area").setAttribute("d", areaD);
    
    // Update y-axis scale labels
    const axisLabels = chart.querySelectorAll(".chart-axis-text");
    if (axisLabels.length >= 4) {
        axisLabels[0].textContent = "0";
        axisLabels[1].textContent = formatCurrency(Math.round(maxVal * 0.33));
        axisLabels[2].textContent = formatCurrency(Math.round(maxVal * 0.66));
        axisLabels[3].textContent = formatCurrency(Math.round(maxVal));
    }
}

function formatCurrency(val) {
    const symbol = state.currency === 'DKK' ? ' kr.' : state.currency === 'EUR' ? ' €' : state.currency === 'USD' ? ' $' : ' £';
    if (val >= 1000) {
        return (val / 1000).toFixed(1) + 'K' + symbol;
    }
    return val + symbol;
}

// Quick action buttons click listeners
document.getElementById("btn-quick-add").addEventListener("click", () => {
    openProductFormModal();
});

document.getElementById("btn-quick-scan").addEventListener("click", () => {
    openScannerModal();
});

document.getElementById("btn-quick-export").addEventListener("click", () => {
    exportToCSV();
});

document.getElementById("btn-quick-import").addEventListener("click", () => {
    // Trigger logo upload input hidden in settings/mock triggers for CSV import
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = (e) => {
        importFromCSV(e.target.files[0]);
    };
    input.click();
});

// --- INVENTORY VIEW TABLE ---
let inventoryPage = 1;
const itemsPerPage = 10;
let filteredProductsList = [];

function initProductsView() {
    // Setup categories in selector dropdown
    const catSelect = document.getElementById("inventory-filter-category");
    catSelect.innerHTML = `<option value="">Alle Kategorier</option>`;
    
    const categories = [...new Set(products.map(p => p.category).filter(c => c))];
    categories.forEach(cat => {
        catSelect.innerHTML += `<option value="${cat}">${cat}</option>`;
    });
}

function renderInventoryTable() {
    initProductsView();
    
    const searchQuery = document.getElementById("inventory-search-query").value.toLowerCase().trim();
    const filterCat = document.getElementById("inventory-filter-category").value;
    const filterStock = document.getElementById("inventory-filter-stock").value;
    
    filteredProductsList = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery) ||
                             p.barcode.includes(searchQuery) ||
                             (p.location || "").toLowerCase().includes(searchQuery) ||
                             (p.supplier || "").toLowerCase().includes(searchQuery);
                             
        const matchesCat = !filterCat || p.category === filterCat;
        
        let matchesStock = true;
        if (filterStock === 'low') {
            matchesStock = p.quantity > 0 && p.quantity <= p.minStock;
        } else if (filterStock === 'out') {
            matchesStock = p.quantity === 0;
        }
        
        return matchesSearch && matchesCat && matchesStock;
    });
    
    const startIdx = (inventoryPage - 1) * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, filteredProductsList.length);
    const paginatedProducts = filteredProductsList.slice(startIdx, endIdx);
    
    const tbody = document.getElementById("inventory-table-body");
    tbody.innerHTML = "";
    
    if (filteredProductsList.length === 0) {
        document.getElementById("inventory-table-empty").style.display = "block";
        document.getElementById("inventory-pagination-text").innerText = "Viser 0-0 af 0 produkter";
    } else {
        document.getElementById("inventory-table-empty").style.display = "none";
        document.getElementById("inventory-pagination-text").innerText = `Viser ${startIdx + 1}-${endIdx} af ${filteredProductsList.length} produkter`;
        
        paginatedProducts.forEach(p => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <div class="table-product-cell">
                        <img class="table-product-img" src="${p.image || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394a3b8\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><circle cx=\'12\' cy=\'12\' r=\'10\'></circle><line x1=\'12\' y1=\'8\' x2=\'12\' y2=\'16\'></line><line x1=\'8\' y1=\'12\' x2=\'16\' y2=\'12\'></line></svg>'}" alt="${p.name}">
                        <div>
                            <div class="table-product-name">${p.name}</div>
                            <div class="table-product-brand">${p.brand || '-'}</div>
                        </div>
                    </div>
                </td>
                <td><code style="font-weight: 700; color: var(--accent);">${p.barcode}</code></td>
                <td><span style="font-weight:600;">${p.category || '-'}</span></td>
                <td>${p.priceSale} kr.</td>
                <td>${p.priceCost} kr.</td>
                <td>
                    <span class="list-item-badge ${p.quantity === 0 ? 'badge-out-stock' : p.quantity <= p.minStock ? 'badge-low-stock' : 'badge-instock'}">
                        ${p.quantity} stk
                    </span>
                </td>
                <td><span style="font-weight: 700;">${p.location || '-'}</span></td>
            `;
            tr.addEventListener("click", () => {
                showProductSheet(p.id);
            });
            tbody.appendChild(tr);
        });
    }
    
    // Enable/disable page buttons
    document.getElementById("btn-pagination-prev").disabled = (inventoryPage === 1);
    document.getElementById("btn-pagination-next").disabled = (endIdx >= filteredProductsList.length);
}

// Listeners for list filtering
document.getElementById("inventory-search-query").addEventListener("input", () => {
    inventoryPage = 1;
    renderInventoryTable();
});
document.getElementById("inventory-filter-category").addEventListener("change", () => {
    inventoryPage = 1;
    renderInventoryTable();
});
document.getElementById("inventory-filter-stock").addEventListener("change", () => {
    inventoryPage = 1;
    renderInventoryTable();
});

// Pagination events
document.getElementById("btn-pagination-prev").addEventListener("click", () => {
    if (inventoryPage > 1) {
        playSound("tap");
        inventoryPage--;
        renderInventoryTable();
    }
});
document.getElementById("btn-pagination-next").addEventListener("click", () => {
    playSound("tap");
    inventoryPage++;
    renderInventoryTable();
});

// --- ACTIVITIES HISTORY VIEW ---
function renderLogsTable() {
    const searchQ = document.getElementById("log-search-query").value.toLowerCase().trim();
    
    const tbody = document.getElementById("log-table-body");
    tbody.innerHTML = "";
    
    const filteredLogs = logs.filter(l => {
        return l.action.toLowerCase().includes(searchQ) ||
               l.user.toLowerCase().includes(searchQ);
    });
    
    if (filteredLogs.length === 0) {
        document.getElementById("log-table-empty").style.display = "block";
    } else {
        document.getElementById("log-table-empty").style.display = "none";
        
        filteredLogs.forEach(l => {
            const tr = document.createElement("tr");
            const dateStr = new Date(l.timestamp).toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = new Date(l.timestamp).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            tr.innerHTML = `
                <td><code style="color: var(--text-muted);">${dateStr} ${timeStr}</code></td>
                <td><strong style="color: var(--accent);">${l.user}</strong></td>
                <td>${l.action}</td>
            `;
            tbody.appendChild(tr);
        });
    }
}

document.getElementById("log-search-query").addEventListener("input", renderLogsTable);

// Clear activities logs history
document.getElementById("btn-clear-logs").addEventListener("click", () => {
    if (confirm("Er du sikker på, at du vil slette hele aktivitetsloggen permanent?")) {
        playSound("delete");
        logs = [];
        localStorage.removeItem('wf_logs');
        logActivity("Aktivitetsloggen blev ryddet.");
        renderLogsTable();
        showToast("Loggen blev ryddet.");
    }
});

// --- PRODUCT DETAILS SLIDE SHEET CONTROLLERS ---
let selectedProduct = null;
const detailSheet = document.getElementById("product-detail-sheet");

function showProductSheet(productId) {
    playSound("tap");
    selectedProduct = products.find(p => p.id === productId);
    if (!selectedProduct) return;
    
    document.getElementById("sheet-name").innerText = selectedProduct.name;
    document.getElementById("sheet-brand").innerText = selectedProduct.brand || "Intet mærke";
    
    const imgEl = document.getElementById("sheet-img");
    imgEl.src = selectedProduct.image || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394a3b8\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><circle cx=\'12\' cy=\'12\' r=\'10\'></circle><line x1=\'12\' y1=\'8\' x2=\'12\' y2=\'16\'></line><line x1=\'8\' y1=\'12\' x2=\'16\' y2=\'12\'></line></svg>';
    
    document.getElementById("sheet-stock-value").innerText = selectedProduct.quantity;
    document.getElementById("sheet-barcode").innerText = selectedProduct.barcode;
    document.getElementById("sheet-category").innerText = selectedProduct.category || "-";
    document.getElementById("sheet-price-sale").innerText = selectedProduct.priceSale + " kr.";
    document.getElementById("sheet-price-cost").innerText = selectedProduct.priceCost + " kr.";
    document.getElementById("sheet-min-stock").innerText = selectedProduct.minStock + " stk";
    document.getElementById("sheet-location").innerText = selectedProduct.location || "-";
    document.getElementById("sheet-notes").innerText = selectedProduct.notes || "Ingen notater.";
    
    // Render History specific for this product
    const historyList = document.getElementById("sheet-history-list");
    historyList.innerHTML = "";
    
    // Find logs references containing the barcode or name
    const productLogs = logs.filter(l => l.action.includes(`(${selectedProduct.barcode})`) || l.action.includes(selectedProduct.name));
    
    if (productLogs.length === 0) {
        historyList.innerHTML = `<div class="history-item">Ingen registreret historik for denne vare.</div>`;
    } else {
        productLogs.slice(0, 5).forEach(log => {
            const item = document.createElement("div");
            item.className = "history-item";
            const dateStr = new Date(log.timestamp).toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit' });
            item.innerHTML = `
                <span>${log.action.split('(')[0]}</span>
                <code>${dateStr}</code>
            `;
            historyList.appendChild(item);
        });
    }
    
    detailSheet.classList.add("active");
}

document.getElementById("btn-close-detail-sheet").addEventListener("click", () => {
    playSound("tap");
    detailSheet.classList.remove("active");
    selectedProduct = null;
});

// Add stock button sheets click
document.getElementById("btn-stock-inc").addEventListener("click", () => {
    if (!selectedProduct) return;
    playSound("scan");
    const oldQty = selectedProduct.quantity;
    selectedProduct.quantity = parseInt(selectedProduct.quantity) + 1;
    document.getElementById("sheet-stock-value").innerText = selectedProduct.quantity;
    
    logActivity(`Øgede mængden på ${selectedProduct.name} fra ${oldQty} → ${selectedProduct.quantity} (${selectedProduct.barcode}).`, 'Medarbejder');
    saveProducts();
    showProductSheet(selectedProduct.id);
});

// Dec stock button sheets click
document.getElementById("btn-stock-dec").addEventListener("click", () => {
    if (!selectedProduct) return;
    if (selectedProduct.quantity <= 0) {
        showToast("Lagerbeholdning kan ikke være mindre end 0!", "error");
        return;
    }
    playSound("delete");
    const oldQty = selectedProduct.quantity;
    selectedProduct.quantity = parseInt(selectedProduct.quantity) - 1;
    document.getElementById("sheet-stock-value").innerText = selectedProduct.quantity;
    
    logActivity(`Mindskede mængden på ${selectedProduct.name} fra ${oldQty} → ${selectedProduct.quantity} (${selectedProduct.barcode}).`, 'Medarbejder');
    saveProducts();
    showProductSheet(selectedProduct.id);
});

// Delete product button click
document.getElementById("btn-sheet-delete").addEventListener("click", () => {
    if (!selectedProduct) return;
    if (confirm(`Er du sikker på, at du vil slette ${selectedProduct.name} permanent fra databasen?`)) {
        playSound("delete");
        products = products.filter(p => p.id !== selectedProduct.id);
        logActivity(`Slettede produktet ${selectedProduct.name} (${selectedProduct.barcode}) fra databasen.`, 'Medarbejder');
        saveProducts();
        detailSheet.classList.remove("active");
        showToast("Produktet blev slettet.");
    }
});

// --- NEW PRODUCT MODAL CREATION ---
const modalProduct = document.getElementById("modal-product");
const productForm = document.getElementById("product-form");

function openProductFormModal(productId = null) {
    productForm.reset();
    document.getElementById("form-product-id").value = "";
    document.getElementById("modal-product-title").innerText = "Opret nyt produkt";
    document.getElementById("product-img-upload-text").innerText = "Klik for at uploade eller ændre billede";
    
    let uploadedImageBase64 = "";
    
    if (productId) {
        // Edit mode
        const p = products.find(prod => prod.id === productId);
        if (p) {
            document.getElementById("form-product-id").value = p.id;
            document.getElementById("form-barcode").value = p.barcode;
            document.getElementById("form-name").value = p.name;
            document.getElementById("form-brand").value = p.brand;
            document.getElementById("form-category").value = p.category;
            document.getElementById("form-price-sale").value = p.priceSale;
            document.getElementById("form-price-cost").value = p.priceCost;
            document.getElementById("form-quantity").value = p.quantity;
            document.getElementById("form-min-stock").value = p.minStock;
            document.getElementById("form-location").value = p.location;
            document.getElementById("form-supplier").value = p.supplier;
            document.getElementById("form-notes").value = p.notes;
            
            if (p.image) {
                uploadedImageBase64 = p.image;
                document.getElementById("product-img-upload-text").innerText = "Billede indlæst. Klik for at ændre.";
            }
            
            document.getElementById("modal-product-title").innerText = `Redigerer: ${p.name}`;
        }
    }
    
    // Auto find image event handling
    const autoFindBtn = document.getElementById("btn-auto-find-image");
    const nameInput = document.getElementById("form-name");
    
    const triggerAutoImageSearch = () => {
        const queryName = nameInput.value.trim();
        if (!queryName) {
            showToast("Indtast venligst et produktnavn først!", "warning");
            return;
        }
        
        autoFindBtn.disabled = true;
        autoFindBtn.innerText = "Søger...";
        document.getElementById("product-img-upload-text").innerText = "Søger efter transparent billede...";
        
        autoFindProductImage(queryName, (base64) => {
            autoFindBtn.disabled = false;
            autoFindBtn.innerText = "✨ Find Billede";
            if (base64) {
                uploadedImageBase64 = base64;
                document.getElementById("product-img-upload-text").innerText = "Billede fundet & baggrund fjernet! ✨";
                showToast("Billede fundet successfully!");
            } else {
                document.getElementById("product-img-upload-text").innerText = "Kunne ikke finde et billede online.";
                showToast("Kunne ikke finde et billede online. Prøv et mere præcist navn.", "error");
            }
        });
    };
    
    autoFindBtn.onclick = triggerAutoImageSearch;
    
    nameInput.addEventListener("change", () => {
        if (!uploadedImageBase64 && nameInput.value.trim()) {
            triggerAutoImageSearch();
        }
    });
    
    // File upload logic for individual product creation page
    const imgInput = document.getElementById("form-image-input");
    imgInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            uploadedImageBase64 = evt.target.result;
            document.getElementById("product-img-upload-text").innerText = `Indlæst: ${file.name}`;
        };
        reader.readAsDataURL(file);
    };

    // Save button trigger
    const submitBtn = document.getElementById("btn-form-submit");
    submitBtn.onclick = () => {
        playSound("tap");
        const id = document.getElementById("form-product-id").value;
        const barcode = document.getElementById("form-barcode").value.trim();
        const name = document.getElementById("form-name").value.trim();
        
        if (!barcode || !name) {
            showToast("Udfyld venligst stregkode og navn!", "error");
            return;
        }
        
        const brand = document.getElementById("form-brand").value.trim();
        const category = document.getElementById("form-category").value.trim();
        const priceSale = parseFloat(document.getElementById("form-price-sale").value) || 0;
        const priceCost = parseFloat(document.getElementById("form-price-cost").value) || 0;
        const quantity = parseInt(document.getElementById("form-quantity").value) || 0;
        const minStock = parseInt(document.getElementById("form-min-stock").value) || 5;
        const location = document.getElementById("form-location").value.trim();
        const supplier = document.getElementById("form-supplier").value.trim();
        const notes = document.getElementById("form-notes").value.trim();
        
        if (id) {
            // Update Existing Product
            const pIdx = products.findIndex(p => p.id === id);
            if (pIdx !== -1) {
                const old = products[pIdx];
                products[pIdx] = {
                    ...old,
                    barcode, name, brand, category, priceSale, priceCost, quantity, minStock, location, supplier, notes,
                    image: uploadedImageBase64 || old.image,
                    lastEdited: new Date().toISOString()
                };
                logActivity(`Opdaterede detaljer for ${name} (${barcode}).`, 'Medarbejder');
                showToast("Produktet blev opdateret.");
            }
        } else {
            // Check if barcode already exists
            if (products.find(p => p.barcode === barcode)) {
                showToast("Et produkt med denne stregkode eksisterer allerede!", "error");
                return;
            }
            
            // Create New Product
            const newProduct = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
                barcode, name, brand, category, priceSale, priceCost, quantity, minStock, location, supplier, notes,
                image: uploadedImageBase64 || "",
                lastEdited: new Date().toISOString()
            };
            products.push(newProduct);
            logActivity(`Oprettede produktet ${name} (${barcode}).`, 'Medarbejder');
            showToast("Produktet blev oprettet successfully.");
        }
        
        saveProducts();
        closeModal(modalProduct);
        if (id) showProductSheet(id); // Re-open detail sheet updated
    };

    openModal(modalProduct);
}

document.getElementById("btn-inventory-add").addEventListener("click", () => openProductFormModal());
document.getElementById("btn-form-cancel").addEventListener("click", () => {
    playSound("tap");
    closeModal(modalProduct);
});
document.getElementById("btn-close-modal-product").addEventListener("click", () => {
    playSound("tap");
    closeModal(modalProduct);
});

// Form trigger edit inside slide sheet
document.getElementById("btn-sheet-edit").addEventListener("click", () => {
    if (selectedProduct) {
        closeModal(detailSheet);
        openProductFormModal(selectedProduct.id);
    }
});

// --- GLOBAL SEARCH BAR / COMMAND PALETTE (CTRL+K) ---
const commandPalette = document.getElementById("command-palette");
const paletteInput = document.getElementById("palette-search-input");
const paletteResults = document.getElementById("palette-results-list");

function openPalette() {
    playSound("tap");
    paletteInput.value = "";
    paletteResults.innerHTML = `<div class="table-empty-state">Begynd at skrive for at søge...</div>`;
    openModal(commandPalette);
    setTimeout(() => paletteInput.focus(), 50);
}

document.getElementById("btn-trigger-search").addEventListener("click", openPalette);

// Capture Global shortcut Ctrl + K
document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
    }
    
    if (e.key === "Escape" && commandPalette.classList.contains("active")) {
        closeModal(commandPalette);
    }
});

paletteInput.addEventListener("input", () => {
    const query = paletteInput.value.toLowerCase().trim();
    paletteResults.innerHTML = "";
    
    if (!query) {
        paletteResults.innerHTML = `<div class="table-empty-state">Begynd at skrive for at søge...</div>`;
        return;
    }
    
    const matches = products.filter(p => {
        return p.name.toLowerCase().includes(query) ||
               p.barcode.includes(query) ||
               (p.category || "").toLowerCase().includes(query) ||
               (p.location || "").toLowerCase().includes(query) ||
               (p.supplier || "").toLowerCase().includes(query);
    });
    
    if (matches.length === 0) {
        paletteResults.innerHTML = `<div class="table-empty-state">Ingen resultater for "${query}"</div>`;
    } else {
        matches.slice(0, 8).forEach(p => {
            const div = document.createElement("div");
            div.className = "palette-result-item";
            div.innerHTML = `
                <div class="palette-result-img-wrapper">
                    <img class="palette-result-img" src="${p.image || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394a3b8\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><circle cx=\'12\' cy=\'12\' r=\'10\'></circle><line x1=\'12\' y1=\'8\' x2=\'12\' y2=\'16\'></line><line x1=\'8\' y1=\'12\' x2=\'16\' y2=\'12\'></line></svg>'}" alt="${p.name}">
                </div>
                <div class="palette-result-info">
                    <div class="palette-result-name">${p.name}</div>
                    <div class="palette-result-meta">${p.brand || 'Uden mærke'} • Barcode: ${p.barcode}</div>
                </div>
                <span class="palette-result-stock ${p.quantity === 0 ? 'text-danger' : p.quantity <= p.minStock ? 'text-warning' : 'text-primary'}">
                    ${p.quantity} stk
                </span>
            `;
            div.addEventListener("click", () => {
                closeModal(commandPalette);
                showProductSheet(p.id);
            });
            paletteResults.appendChild(div);
        });
    }
});

// --- KEYBOARD USB BARCODE SCANNER EMULATOR ---
let barcodeBuffer = "";
let barcodeLastKeyTime = 0;

document.addEventListener("keydown", (e) => {
    // Only intercept if we are not actively typing in an input field (to avoid messing up manual forms typing)
    const activeEl = document.activeElement;
    const isInputField = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT';
    
    // USB Scanner types very fast (typically < 30ms difference between keystrokes)
    const now = Date.now();
    const isRapid = (now - barcodeLastKeyTime) < 50;
    barcodeLastKeyTime = now;
    
    // Ignore function keys, controls, shift etc.
    if (e.key.length === 1) {
        if (isRapid || barcodeBuffer === "") {
            barcodeBuffer += e.key;
        } else {
            // Too slow, not a scanner - clear buffer and treat as normal manual typing
            barcodeBuffer = e.key;
        }
    }
    
    if (e.key === "Enter" && barcodeBuffer.length >= 8) {
        // Prevent default form submissions if it was a rapid scan
        if (isRapid) {
            e.preventDefault();
            const scannedCode = barcodeBuffer;
            barcodeBuffer = ""; // Reset
            
            triggerBarcodeScannedAction(scannedCode);
        } else {
            barcodeBuffer = "";
        }
    }
});

async function triggerBarcodeScannedAction(barcode) {
    playSound("scan");
    logActivity(`Hardware-scanner scannede stregkode (${barcode}).`, 'Medarbejder');
    
    // Check if product already exists
    const prod = products.find(p => p.barcode === barcode);
    if (prod) {
        showToast(`Produkt fundet: ${prod.name}`);
        showProductSheet(prod.id);
    } else {
        // Product not found. Prompt online fetch or manual create
        const create = confirm(`Stregkoden ${barcode} findes ikke i databasen. Vil du hente oplysningerne online og oprette produktet?`);
        if (create) {
            fetchOnlineProductDetails(barcode);
        }
    }
}

// Fetch online details via local Python proxy server
async function fetchOnlineProductDetails(barcode) {
    showToast("Henter produktinformationer online...");
    try {
        const response = await fetch(`/proxy/product/${barcode}`);
        if (response.status === 404) {
            showToast("Stregkode ikke fundet i online-databasen. Opret manuelt.", "warning");
            openProductFormModal();
            document.getElementById("form-barcode").value = barcode;
            return;
        }
        if (!response.ok) throw new Error("Search failed");
        
        const data = await response.json();
        
        if (data.status === 1 && data.product) {
            const p = data.product;
            
            // Extract the cleanest transparent or official photo
            let img = p.image_front_url || p.image_url || p.image_front_thumb_url || "";
            
            openProductFormModal();
            document.getElementById("form-barcode").value = barcode;
            document.getElementById("form-name").value = p.product_name || "";
            document.getElementById("form-brand").value = p.brands || "";
            document.getElementById("form-category").value = p.categories ? p.categories.split(',')[0] : "";
            
            // Weight notes
            const notes = p.quantity ? `Vægt: ${p.quantity}` : "";
            document.getElementById("form-notes").value = notes;
            
            if (img) {
                // We show loading indicators or fetch through proxy to convert image to local base64
                document.getElementById("product-img-upload-text").innerText = "Henter online produktbillede...";
                convertImageToBase64(img, (base64) => {
                    const imgInput = document.getElementById("form-image-input");
                    // Store the converted image
                    imgInput.dataset.base64 = base64;
                    document.getElementById("product-img-upload-text").innerText = "Online produktbillede indlæst successfully!";
                    // Bind base64 directly to the form handler
                    document.getElementById("btn-form-submit").onclick = (function(oldSubmit) {
                        return function() {
                            const imgInput = document.getElementById("form-image-input");
                            if (imgInput.dataset.base64) {
                                // Inject base64 into form values
                                const pIdx = products.length - 1;
                                if (pIdx >= 0) {
                                    products[pIdx].image = imgInput.dataset.base64;
                                }
                            }
                            oldSubmit();
                        };
                    })(document.getElementById("btn-form-submit").onclick);
                });
            }
            
            showToast("Produktinformationer hentet successfully!");
            playSound("success");
        } else {
            showToast("Stregkoden blev ikke fundet online. Opret manuelt.", "warning");
            openProductFormModal();
            document.getElementById("form-barcode").value = barcode;
        }
    } catch (err) {
        console.error("Online lookup error:", err);
        showToast("Netværksfejl under online opslag.", "error");
        openProductFormModal();
        document.getElementById("form-barcode").value = barcode;
    }
}

// Convert image URL to Base64 to store in localStorage (using a Canvas to bypass CORS where applicable)
function convertImageToBase64(url, callback) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL('image/png');
        callback(dataURL);
    };
    img.onerror = function() {
        // Fallback: just return empty if canvas download fails
        callback("");
    };
    img.src = '/proxy/image?url=' + encodeURIComponent(url);
}

// Remove background of image by converting light/white/corner pixels to transparent
function removeImageBackground(imgUrl, callback) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        try {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            
            const w = canvas.width;
            const h = canvas.height;
            const corners = [
                [data[0], data[1], data[2]], // TL
                [data[(w - 1) * 4], data[(w - 1) * 4 + 1], data[(w - 1) * 4 + 2]], // TR
                [data[(h - 1) * w * 4], data[(h - 1) * w * 4 + 1], data[(h - 1) * w * 4 + 2]], // BL
                [data[(data.length - 4)], data[(data.length - 3)], data[(data.length - 2)]] // BR
            ];
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                
                if (r > 240 && g > 240 && b > 240) {
                    data[i+3] = 0;
                } else {
                    for (const corner of corners) {
                        const dist = Math.sqrt(
                            Math.pow(r - corner[0], 2) +
                            Math.pow(g - corner[1], 2) +
                            Math.pow(b - corner[2], 2)
                        );
                        if (dist < 40) {
                            data[i+3] = 0;
                            break;
                        }
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
            callback(canvas.toDataURL('image/png'));
        } catch (e) {
            callback(canvas.toDataURL('image/png'));
        }
    };
    img.onerror = function() {
        callback("");
    };
    img.src = '/proxy/image?url=' + encodeURIComponent(imgUrl);
}

// Search and retrieve an image based on product name in background
function autoFindProductImage(productName, callback) {
    if (!productName) return callback("");
    
    fetch(`/proxy/find_image?q=${encodeURIComponent(productName)}`)
        .then(res => res.json())
        .then(data => {
            if (data.urls && data.urls.length > 0) {
                let index = 0;
                const tryNext = () => {
                    if (index >= data.urls.length) {
                        callback("");
                        return;
                    }
                    const url = data.urls[index];
                    index++;
                    
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    img.onload = () => {
                        removeImageBackground(url, (transparentBase64) => {
                            if (transparentBase64) {
                                callback(transparentBase64);
                            } else {
                                tryNext();
                            }
                        });
                    };
                    img.onerror = () => {
                        tryNext();
                    };
                    img.src = url;
                };
                tryNext();
            } else {
                callback("");
            }
        })
        .catch(err => {
            console.error("Error searching image:", err);
            callback("");
        });
}

// --- WEBCAM SCANNER (HTML5-QRCODE INTEGRATION) ---
const modalScan = document.getElementById("modal-scan");
let html5QrCode = null;

function openScannerModal() {
    playSound("tap");
    openModal(modalScan);
    
    // Clear feed container
    document.getElementById("interactive-camera-feed").innerHTML = "";
    
    setTimeout(() => {
        html5QrCode = new Html5Qrcode("interactive-camera-feed");
        const config = {
            fps: 15,
            qrbox: function(width, height) {
                // Taller rectangular scanning box (85% width and 65% height)
                return { width: Math.floor(width * 0.85), height: Math.floor(height * 0.65) };
            },
            aspectRatio: 1.333333
        };
        
        html5QrCode.start(
            { facingMode: "environment" }, 
            config,
            (decodedText, decodedResult) => {
                // Success scanning barcode
                playSound("scan");
                closeModal(modalScan);
                
                // Trigger action
                triggerBarcodeScannedAction(decodedText);
            },
            (errorMessage) => {
                // Ignore scanning noise
            }
        ).catch(err => {
            console.error("Camera init error:", err);
            showToast("Kunne ikke starte kameraet. Sørg for tilladelser.", "error");
            closeModal(modalScan);
        });
    }, 200);
}

document.getElementById("btn-topbar-scan").addEventListener("click", openScannerModal);
document.getElementById("btn-quick-scan").addEventListener("click", openScannerModal);
document.getElementById("btn-form-scan-trigger").addEventListener("click", () => {
    closeModal(modalProduct);
    openScannerModal();
});
document.getElementById("btn-close-modal-scan").addEventListener("click", () => {
    playSound("tap");
    closeModal(modalScan);
});
document.getElementById("btn-scan-manual-fallback").addEventListener("click", () => {
    playSound("tap");
    closeModal(modalScan);
    const barcode = prompt("Indtast stregkode manuelt:");
    if (barcode) {
        triggerBarcodeScannedAction(barcode.trim());
    }
});

let isMobilePairingActive = false;
let currentPairingCode = "";

function openMobilePairingModal() {
    playSound("tap");
    const modal = document.getElementById("modal-mobile-pairing");
    openModal(modal);
    
    isMobilePairingActive = true;
    
    // Generate code
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    currentPairingCode = code;
    
    document.getElementById("mobile-pairing-code").innerText = code;
    
    // Reset status indicator
    const dot = document.getElementById("mobile-pairing-status-dot");
    const text = document.getElementById("mobile-pairing-status-text");
    dot.style.backgroundColor = "var(--warning)";
    text.innerText = "Venter på tilslutning...";
    
    // Build link
    const link = window.location.origin + "/scanner.html?code=" + code;
    const a = document.getElementById("mobile-pairing-link");
    a.href = link;
    a.innerText = link;
    
    // Set QR code image using qrserver API
    const qrImg = document.getElementById("mobile-pairing-qr");
    qrImg.src = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(link);
    
    // Register session on server
    fetch(`/proxy/session/register?code=${code}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === "registered") {
                // Start wait poll loop
                pollMobileScanner(code);
            }
        })
        .catch(err => {
            console.error("Failed to register session:", err);
            showToast("Fejl under registrering af parringssession.", "error");
        });
}

function closeMobilePairingModal() {
    isMobilePairingActive = false;
    const modal = document.getElementById("modal-mobile-pairing");
    closeModal(modal);
}

function pollMobileScanner(code) {
    if (!isMobilePairingActive || currentPairingCode !== code) return;
    
    fetch(`/proxy/session/wait?code=${code}`)
        .then(res => res.json())
        .then(data => {
            if (!isMobilePairingActive || currentPairingCode !== code) return;
            
            if (data.status === "scanned") {
                // Update status indicator to success green
                const dot = document.getElementById("mobile-pairing-status-dot");
                const text = document.getElementById("mobile-pairing-status-text");
                dot.style.backgroundColor = "var(--primary)";
                text.innerText = `Varer modtaget! Sidste: ${data.barcode}`;
                
                // Show toast and trigger scan event
                showToast(`Mobil scan modtaget: ${data.barcode}`, "success");
                playSound("scan");
                
                // Trigger action
                triggerBarcodeScannedAction(data.barcode);
                
                // Re-poll immediately
                pollMobileScanner(code);
            } else if (data.status === "timeout") {
                // Connection timed out (expected in long-polling), poll again
                pollMobileScanner(code);
            } else if (data.error === "session_not_found") {
                // Session expired or deleted on server
                console.warn("Session expired on server");
            } else {
                // Any other status, wait a second and retry
                setTimeout(() => pollMobileScanner(code), 1000);
            }
        })
        .catch(err => {
            console.error("Poll error:", err);
            if (isMobilePairingActive && currentPairingCode === code) {
                // Wait 2 seconds on network error before retrying to prevent thrashing
                setTimeout(() => pollMobileScanner(code), 2000);
            }
        });
}

document.getElementById("btn-topbar-mobile-pairing").addEventListener("click", openMobilePairingModal);
document.getElementById("btn-close-modal-mobile-pairing").addEventListener("click", () => {
    playSound("tap");
    closeMobilePairingModal();
});
document.getElementById("btn-close-pairing-modal").addEventListener("click", () => {
    playSound("tap");
    closeMobilePairingModal();
});

// --- SETTINGS VIEW CONTROLLERS ---
function initSettingsView() {
    document.getElementById("settings-warehouse-name").value = state.warehouseName;
    document.getElementById("settings-currency").value = state.currency;
    document.getElementById("settings-scanner").value = state.scannerType;
}

document.getElementById("btn-save-settings").addEventListener("click", () => {
    playSound("success");
    state.warehouseName = document.getElementById("settings-warehouse-name").value.trim() || 'Hovedlager';
    state.currency = document.getElementById("settings-currency").value;
    state.scannerType = document.getElementById("settings-scanner").value;
    
    localStorage.setItem('wf_state', JSON.stringify(state));
    logActivity(`Lagerindstillinger blev opdateret.`);
    showToast("Indstillinger gemt.");
});

// Load professional mock items for demo validation
document.getElementById("btn-load-mock-data").addEventListener("click", () => {
    playSound("success");
    const mockProducts = [
        {
            id: "mock1",
            barcode: "5741000118557",
            name: "Faxe Kondi Flaske",
            brand: "Royal Unibrew",
            category: "Drikkevarer",
            priceSale: 15.0,
            priceCost: 7.5,
            quantity: 45,
            minStock: 10,
            location: "A-01",
            supplier: "Dagrofa",
            notes: "Populær dansk sodavand. Holdbarhed ca. 6 måneder.",
            image: "https://world-da.openfoodfacts.org/images/products/574/100/011/8557/front_da.40.400.jpg",
            lastEdited: new Date().toISOString()
        },
        {
            id: "mock2",
            barcode: "5701019001308",
            name: "Mathilde Kakaomælk",
            brand: "Arla",
            category: "Drikkevarer",
            priceSale: 12.0,
            priceCost: 6.0,
            quantity: 3,
            minStock: 8,
            location: "B-12",
            supplier: "Arla Foods",
            notes: "Klassisk kakaomælk. Lav beholdnings-alarm test.",
            image: "https://world-da.openfoodfacts.org/images/products/570/101/900/1308/front_da.16.400.jpg",
            lastEdited: new Date().toISOString()
        },
        {
            id: "mock3",
            barcode: "5449000000996",
            name: "Coca Cola Zero Dåse",
            brand: "Coca-Cola",
            category: "Drikkevarer",
            priceSale: 10.0,
            priceCost: 4.5,
            quantity: 120,
            minStock: 20,
            location: "A-02",
            supplier: "Dagrofa",
            notes: "Zero sugar. Bedst sælgende drikkevare.",
            image: "https://world-da.openfoodfacts.org/images/products/544/900/000/0996/front_fr.209.400.jpg",
            lastEdited: new Date().toISOString()
        },
        {
            id: "mock4",
            barcode: "5707388330058",
            name: "Havregryn Finvalsede",
            brand: "Ota Solgryn",
            category: "Fødevarer",
            priceSale: 18.0,
            priceCost: 9.0,
            quantity: 0,
            minStock: 5,
            location: "C-04",
            supplier: "Dansk Supermarked",
            notes: "Sund morgenmad. Test af Udsolgt-status.",
            image: "https://world-da.openfoodfacts.org/images/products/570/738/833/0058/front_da.11.400.jpg",
            lastEdited: new Date().toISOString()
        }
    ];
    
    // Inject and save
    products = mockProducts;
    saveProducts();
    
    logActivity("Test-produkter indlæst i databasen.", "System");
    showToast("Test-produkter indlæst!");
    renderInventoryTable();
});

document.getElementById("btn-wipe-data").addEventListener("click", () => {
    if (confirm("ADVARSEL: Dette vil slette ALT data (produkter, indstillinger og logfiler) permanent. Er du helt sikker?")) {
        playSound("delete");
        localStorage.clear();
        products = [];
        logs = [];
        state = {
            setupComplete: false,
            companyName: 'WarehouseFlow',
            warehouseName: 'Hovedlager',
            currency: 'DKK',
            language: 'da',
            scannerType: 'usb',
            logo: null,
            theme: 'dark'
        };
        location.reload();
    }
});

// --- STATISTICS VIEW CONTROLLERS ---
function initStatistics() {
    let totalSaleVal = 0;
    let totalCostVal = 0;
    
    products.forEach(p => {
        const qty = parseInt(p.quantity) || 0;
        totalSaleVal += (parseFloat(p.priceSale) || 0) * qty;
        totalCostVal += (parseFloat(p.priceCost) || 0) * qty;
    });
    
    const profit = totalSaleVal - totalCostVal;
    
    document.getElementById("stat-total-value-sale").innerText = totalSaleVal.toLocaleString('da-DK') + " kr.";
    document.getElementById("stat-total-value-cost").innerText = totalCostVal.toLocaleString('da-DK') + " kr.";
    document.getElementById("stat-estimated-profit").innerText = profit.toLocaleString('da-DK') + " kr.";
    
    // Render Category Distribution bars
    const catBars = document.getElementById("stat-category-distribution-bars");
    catBars.innerHTML = "";
    
    const categoriesCount = {};
    products.forEach(p => {
        const cat = p.category || "Uden kategori";
        categoriesCount[cat] = (categoriesCount[cat] || 0) + (parseInt(p.quantity) || 0);
    });
    
    const totalItems = Object.values(categoriesCount).reduce((a, b) => a + b, 0);
    
    if (totalItems === 0) {
        catBars.innerHTML = `<div class="table-empty-state">Ingen varer at fordele.</div>`;
    } else {
        Object.keys(categoriesCount).sort((a,b) => categoriesCount[b] - categoriesCount[a]).forEach(cat => {
            const qty = categoriesCount[cat];
            const pct = Math.round((qty / totalItems) * 100);
            
            const row = document.createElement("div");
            row.style.marginBottom = "15px";
            row.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                    <strong style="color:var(--text-main);">${cat}</strong>
                    <span style="color:var(--text-muted);">${qty} stk (${pct}%)</span>
                </div>
                <div style="width:100%; height:8px; background:rgba(255,255,255,0.03); border:1px solid var(--border-glass); border-radius:4px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:var(--accent); border-radius:4px;"></div>
                </div>
            `;
            catBars.appendChild(row);
        });
    }

    // Render Most Scanned Volume progress bars
    const scanBars = document.getElementById("stat-most-scanned-bars");
    scanBars.innerHTML = "";

    // Count scan events from logs
    const scanCounts = {};
    logs.filter(l => l.action.includes("scannede")).forEach(l => {
        const matches = l.action.match(/\((.*?)\)/);
        if (matches) {
            const barcode = matches[1];
            const p = products.find(prod => prod.barcode === barcode);
            if (p) {
                scanCounts[p.name] = (scanCounts[p.name] || 0) + 1;
            }
        }
    });

    const scanTotals = Object.values(scanCounts);
    const maxScans = scanTotals.length > 0 ? Math.max(...scanTotals) : 0;

    if (maxScans === 0) {
        scanBars.innerHTML = `<div class="table-empty-state">Ingen scannede hændelser registreret i loggen endnu.</div>`;
    } else {
        Object.keys(scanCounts).sort((a,b) => scanCounts[b] - scanCounts[a]).slice(0, 5).forEach(name => {
            const count = scanCounts[name];
            const pct = Math.round((count / maxScans) * 100);

            const row = document.createElement("div");
            row.style.marginBottom = "15px";
            row.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                    <strong style="color:var(--text-main);">${name}</strong>
                    <span style="color:var(--text-muted);">${count} scan</span>
                </div>
                <div style="width:100%; height:8px; background:rgba(255,255,255,0.03); border:1px solid var(--border-glass); border-radius:4px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:var(--primary); border-radius:4px;"></div>
                </div>
            `;
            scanBars.appendChild(row);
        });
    }
}

// --- CSV EXPORT & IMPORT UTILITIES ---
function exportToCSV() {
    if (products.length === 0) {
        showToast("Ingen produkter at eksportere!", "error");
        return;
    }
    
    playSound("success");
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Barcode,Name,Brand,Category,PriceSale,PriceCost,Quantity,MinStock,Location,Supplier,Notes\n";
    
    products.forEach(p => {
        const row = [
            `"${p.barcode}"`,
            `"${p.name.replace(/"/g, '""')}"`,
            `"${(p.brand || '').replace(/"/g, '""')}"`,
            `"${(p.category || '').replace(/"/g, '""')}"`,
            p.priceSale,
            p.priceCost,
            p.quantity,
            p.minStock,
            `"${(p.location || '').replace(/"/g, '""')}"`,
            `"${(p.supplier || '').replace(/"/g, '""')}"`,
            `"${(p.notes || '').replace(/"/g, '""')}"`
        ].join(",");
        csvContent += row + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Lagerliste_${state.warehouseName.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    logActivity("Eksporterede lagerliste til CSV-fil.", "Medarbejder");
    showToast("Lagerliste eksporteret.");
}

function importFromCSV(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const text = e.target.result;
            const lines = text.split("\n");
            let importedCount = 0;
            
            // Check headers
            const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ''));
            if (!headers.includes("Barcode") || !headers.includes("Name")) {
                showToast("Ugyldigt CSV-format! Mangler 'Barcode' eller 'Name'.", "error");
                return;
            }
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                // Simple regex to parse CSV taking care of quotes
                const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
                const values = matches ? matches.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"')) : line.split(",");
                
                if (values.length < 2) continue;
                
                const barcode = values[0];
                const name = values[1];
                const brand = values[2] || "";
                const category = values[3] || "";
                const priceSale = parseFloat(values[4]) || 0;
                const priceCost = parseFloat(values[5]) || 0;
                const quantity = parseInt(values[6]) || 0;
                const minStock = parseInt(values[7]) || 5;
                const location = values[8] || "";
                const supplier = values[9] || "";
                const notes = values[10] || "";
                
                // Only import if product barcode doesn't exist
                if (!products.find(p => p.barcode === barcode)) {
                    const newProduct = {
                        id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 4) + '-' + i,
                        barcode, name, brand, category, priceSale, priceCost, quantity, minStock, location, supplier, notes,
                        image: "",
                        lastEdited: new Date().toISOString()
                    };
                    products.push(newProduct);
                    importedCount++;
                }
            }
            
            if (importedCount > 0) {
                saveProducts();
                logActivity(`Importerede ${importedCount} produkter fra CSV-fil.`, 'Medarbejder');
                showToast(`Importerede ${importedCount} nye produkter!`);
                renderInventoryTable();
            } else {
                showToast("Ingen nye produkter importeret (allerede eksisterende stregkoder).", "warning");
            }
        } catch (err) {
            console.error("CSV import error:", err);
            showToast("Fejl under indlæsning af CSV-fil.", "error");
        }
    };
    reader.readAsText(file);
}

// --- LABEL PRINT & QR CANVAS GENERATORS ---
const modalQr = document.getElementById("modal-qr");

document.getElementById("btn-sheet-qr").addEventListener("click", () => {
    if (!selectedProduct) return;
    playSound("tap");
    
    document.getElementById("qr-product-name").innerText = selectedProduct.name;
    document.getElementById("qr-barcode-text").innerText = selectedProduct.barcode;
    
    const canvas = document.getElementById("qr-canvas");
    // Generate QR using canvas and public api.qrserver.com
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,200,200);
    
    const qrImg = new Image();
    qrImg.onload = function() {
        ctx.drawImage(qrImg, 0, 0, 200, 200);
    };
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(selectedProduct.barcode)}`;
    
    openModal(modalQr);
});

document.getElementById("btn-close-modal-qr").addEventListener("click", () => {
    playSound("tap");
    closeModal(modalQr);
});

document.getElementById("btn-download-qr").addEventListener("click", () => {
    if (!selectedProduct) return;
    playSound("success");
    
    const canvas = document.getElementById("qr-canvas");
    const link = document.createElement("a");
    link.download = `QR_${selectedProduct.name.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL();
    link.click();
});

// Barcode label printing generator (Code 39 draw on canvas)
document.getElementById("btn-print-label").addEventListener("click", () => {
    if (!selectedProduct) return;
    playSound("tap");
    
    document.getElementById("print-lbl-name").innerText = selectedProduct.name;
    document.getElementById("print-lbl-sku").innerText = `Barcode: ${selectedProduct.barcode}`;
    document.getElementById("print-lbl-price").innerText = `Pris: ${selectedProduct.priceSale} kr.`;
    
    const canvas = document.getElementById("print-lbl-barcode");
    drawCode39Barcode(canvas, selectedProduct.barcode);
    
    // Trigger Browser Print Dialog
    window.print();
});

function drawCode39Barcode(canvas, code) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    
    // Code 39 character patterns (simple bar widths represent binary codes)
    const code39Map = {
        '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
        '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
        '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
        'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
        'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
        '*': '100101101101' // Asterisk start/stop frame character
    };
    
    // Prepare formatted string: must start and end with asterisks in standard Code 39
    const formatted = `*${code.toUpperCase()}*`;
    let binary = "";
    
    for (let char of formatted) {
        const pattern = code39Map[char] || code39Map['*'];
        binary += pattern + "0"; // Add spacing character
    }
    
    // Render bars
    const barWidth = Math.max(1, Math.floor(canvas.width / binary.length));
    const paddingLeft = Math.floor((canvas.width - (binary.length * barWidth)) / 2);
    
    ctx.fillStyle = "#000000";
    
    for (let i = 0; i < binary.length; i++) {
        if (binary[i] === '1') {
            ctx.fillRect(paddingLeft + (i * barWidth), 0, barWidth, canvas.height);
        }
    }
}

// --- INITIALIZE APPLICATION ---
function init() {
    loadState();
    
    if (state.setupComplete) {
        initDashboard();
        renderInventoryTable();
        initSettingsView();
    }
    
    // Touch interaction to trigger audio context unlocking
    const unlock = () => {
        const buffer = audioCtx ? null : new (window.AudioContext || window.webkitAudioContext)();
        if (buffer) {
            audioCtx = buffer;
            audioCtx.resume();
        }
        document.removeEventListener("click", unlock);
        document.removeEventListener("touchstart", unlock);
    };
    document.addEventListener("click", unlock);
    document.addEventListener("touchstart", unlock);
    
    // Setup filewatch live reload listener
    setupLiveReload();
}

// Live-reload file watcher
function setupLiveReload() {
    let t = Date.now() / 1000;
    const poll = () => {
        fetch(`/watch?t=${t}`)
            .then(res => res.json())
            .then(data => {
                t = data.timestamp;
                if (data.changed) {
                    location.reload();
                } else {
                    poll();
                }
            })
            .catch(() => setTimeout(poll, 1000));
    };
    poll();
}

window.onload = init;
