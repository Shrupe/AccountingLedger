// --- LOGGER SYSTEM ---
const Logger = {
    logs: [],
    maxLogs: 50,
    
    log: function(message) {
        const timestamp = new Date().toLocaleTimeString('tr-TR');
        const entry = { timestamp, message, type: 'info', devOnly: false };
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) this.logs.shift();
        console.log(`[${timestamp}] ${message}`);
    },
    
    info: function(devMessage, uiMessage) {
        const timestamp = new Date().toLocaleTimeString('tr-TR');
        const entry = { timestamp, message: devMessage, type: 'info', devOnly: true };
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) this.logs.shift();
        console.info(`[${timestamp}] ${devMessage}`);
        if (uiMessage) notify(uiMessage, 'info', false);
    },
    
    success: function(devMessage, uiMessage) {
        const timestamp = new Date().toLocaleTimeString('tr-TR');
        const entry = { timestamp, message: devMessage, type: 'success', devOnly: true };
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) this.logs.shift();
        console.log(`[${timestamp}] ✓ ${devMessage}`);
        if (uiMessage) notify(uiMessage, 'success', false);
    },
    
    warn: function(devMessage, uiMessage) {
        const timestamp = new Date().toLocaleTimeString('tr-TR');
        const entry = { timestamp, message: devMessage, type: 'warning', devOnly: true };
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) this.logs.shift();
        console.warn(`[${timestamp}] ⚠ ${devMessage}`);
        if (uiMessage) notify(uiMessage || devMessage, 'warning', false);
    },
    
    error: function(devMessage, uiMessage) {
        const timestamp = new Date().toLocaleTimeString('tr-TR');
        const entry = { timestamp, message: devMessage, type: 'error', devOnly: true };
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) this.logs.shift();
        console.error(`[${timestamp}] ✗ ${devMessage}`);
        if (uiMessage) notify(uiMessage, 'error', true);
    },
    
    getAll: function() {
        return this.logs;
    },
    
    clear: function() {
        this.logs = [];
        console.clear();
    }
};

// --- DATABASE HELPERS (using Electron's file system via preload.js) ---
const DB = {
    // Get data from a JSON file
    get: async (key) => {
        const { success, data, error } = await window.electronAPI.loadData(key);
        if (success) {
            return data;
        } else {
            Logger.error(`Failed to load ${key}: ${error}`, 'Veri yüklenemedi.');
            return []; // Return empty array on failure
        }
    },
    // Save data to a JSON file
    set: async (key, data) => {
        const { success, path, error } = await window.electronAPI.saveData(key, data);
        if (!success) {
            Logger.error(`Failed to save ${key}: ${error}`, 'Veri kaydedilemedi.');
        }
        return success;
    },
    // Generate a unique ID
    generateId: () => {
        return '_' + Math.random().toString(36).substr(2, 9);
    }
};

// --- APP STATE ---
let state = {
    transactions: [],
    customers: [],
    products: []
};
let databases = []; // List of all databases
let currentDatabaseId = null; // Currently active database
let currentTab = 'dashboard';
let currentSort = { field: 'name', direction: 'asc' }; // For customer sorting

// --- DATABASE METADATA ---
// Stores database info: { id, name, createdDate, lastModified }

// --- UTILITY FUNCTIONS ---

/**
 * Replaces all placeholder icon elements with actual SVG icons.
 * Since we already have inline SVGs in HTML, this is mainly for verification.
 */
function replaceIcons() {
    // Icons are already embedded as inline SVGs in the HTML
    // This function is kept for compatibility
    return;
}

/**
 * Formats a number as Turkish Lira
 */
function formatCurrency(value) {
    if (isNaN(value)) value = 0;
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value);
}

/**
 * Formats a date string from YYYY-MM-DD to DD/MM/YYYY
 */
function formatDateDisplay(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // fallback if invalid
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Gets today's date in YYYY-MM-DD format
 */
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Gets today's date in DD.MM.YYYY format for filenames
 */
function getTodayDateFilename() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}.${month}.${year}`;
}

// --- NOTIFICATION SYSTEM ---
let notificationTimeout = null;
let currentNotificationType = 'info';

function getNotificationIcon(type) {
    const icons = {
        success: '<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        error: '<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        warning: '<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        info: '<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
        loading: '<svg class="notification-spinner" width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>'
    };
    return icons[type] || icons.info;
}

function notify(message, type = 'info', keepOpen = false) {
    const panel = document.getElementById('notification-panel');
    const messageEl = document.getElementById('notification-message');
    const iconEl = document.getElementById('notification-icon');
    const closeBtn = document.getElementById('notification-close');
    
    // Clear previous timeout
    if (notificationTimeout) clearTimeout(notificationTimeout);
    
    // Update panel
    panel.className = `notification-panel ${type}`;
    messageEl.textContent = message;
    iconEl.innerHTML = getNotificationIcon(type);
    currentNotificationType = type;
    
    // Show panel
    panel.style.display = 'block';
    
    // Auto-hide after 4 seconds if not an error and keepOpen is false
    if (!keepOpen && type !== 'error') {
        notificationTimeout = setTimeout(() => {
            panel.style.display = 'none';
        }, 4000);
    }
}

function showLoading(message = 'İşlem devam ediyor...') {
    const panel = document.getElementById('notification-panel');
    const messageEl = document.getElementById('notification-message');
    const iconEl = document.getElementById('notification-icon');
    
    panel.className = 'notification-panel info';
    messageEl.textContent = message;
    iconEl.innerHTML = getNotificationIcon('loading');
    panel.style.display = 'block';
    
    // Clear any pending timeout
    if (notificationTimeout) clearTimeout(notificationTimeout);
}

function hideNotification() {
    const panel = document.getElementById('notification-panel');
    panel.style.display = 'none';
    if (notificationTimeout) clearTimeout(notificationTimeout);
}

/**
 * Waits for PapaParse to load and resolves when ready
 */
function waitForPapa(timeout = 5000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const checkPapa = () => {
            if (typeof Papa !== 'undefined' && Papa.unparse) {
                resolve();
            } else if (Date.now() - startTime > timeout) {
                reject(new Error('PapaParse library failed to load'));
            } else {
                setTimeout(checkPapa, 100);
            }
        };
        checkPapa();
    });
}

/**
 * Exports data to a CSV file and triggers download
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Name of the file
 */
function exportToCSV(data, filename) {
    try {
        if (!data || data.length === 0) {
            Logger.warn('Export attempted with no data', 'Dışa aktarılacak veri yok');
            return;
        }
        
        if (typeof Papa === 'undefined') {
            Logger.error('PapaParse library not available for export', 'CSV kütüphanesi yükleniyor... Lütfen biraz sonra tekrar deneyin.');
            return;
        }
        
        const csv = '\uFEFF' + Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the URL object
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        Logger.success(`Exported to file: ${filename}`, `${filename} olarak dışa aktarıldı`);
    } catch (error) {
        Logger.error(`Export error: ${error.message}`, 'Dışa aktarma başarısız oldu.');
    }
}

// --- NAVIGATION ---
const tabs = document.querySelectorAll('.tab-content');
const tabButtons = document.querySelectorAll('.tab-button');

function showTab(tabId) {
    tabs.forEach(tab => tab.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
    
    tabButtons.forEach(button => button.classList.remove('active'));
    const activeButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
    
    currentTab = tabId;
    
    if (tabId === 'dashboard') renderDashboard();
    if (tabId === 'transactions') renderTransactionTable(state.transactions);
    if (tabId === 'customers') renderCustomerTable();
    if (tabId === 'products') renderProductTable();

    if (tabId === 'newTransaction') {
        document.getElementById('p-date').value = getTodayDate();
        document.getElementById('t-date').value = getTodayDate();
        showSubTab('sale'); 
    }
}

// --- Sub-tab navigation within "Yeni İşlem"
const subTabButtons = document.querySelectorAll('.sub-tab-button');
const subTabContents = document.querySelectorAll('.sub-tab-content');

function showSubTab(subTabId) {
    subTabContents.forEach(content => {
        content.classList.remove('active');
    });
    subTabButtons.forEach(button => {
        button.classList.remove('active');
    });

    document.getElementById(`subtab-${subTabId}`).classList.add('active');
    document.querySelector(`.sub-tab-button[data-subtab="${subTabId}"]`).classList.add('active');
}

subTabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const subTabId = button.getAttribute('data-subtab');
        showSubTab(subTabId);
    });
});


// --- DATA RENDERING ---

async function loadInitialData() {
    // Load databases first
    await loadDatabases();
    
    // Load current database data
    if (currentDatabaseId) {
        await loadDatabase(currentDatabaseId);
    }
    
    renderDashboard();
    updateDatalists();
    
    document.getElementById('t-date').value = getTodayDate();
    document.getElementById('p-date').value = getTodayDate();
}

function renderDashboard() {
    let totalTransactions = state.transactions.length;
    let totalCredit = 0;
    let totalSales = 0;
    let totalCostOfGoods = 0;

    const customerAggregates = {};
    state.customers.forEach(c => {
        const veresiye = c.veresiye || 0;
        const satis = c.satis || 0;
        customerAggregates[c.name] = { veresiye, satis };
        totalCredit += veresiye;
        totalSales += satis;
    });

    if (Object.keys(customerAggregates).length === 0) {
        state.transactions.forEach(t => {
            if (!customerAggregates[t.customer]) customerAggregates[t.customer] = { veresiye: 0, satis: 0 };
            
            if (t.type === 'VERESİYE') {
                customerAggregates[t.customer].veresiye += t.total;
                totalCredit += t.total;
            } else if (t.type === 'SATIŞ' || t.type === 'İKİSİDE' || t.type === 'ÖDEME') {
                customerAggregates[t.customer].satis += t.total;
                totalSales += t.total;
            }
        });
    }

    // Calculate Cost of Goods Sold (COGS) for profit calculation
    state.transactions.forEach(t => {
        if (t.type !== 'ÖDEME' && t.type !== 'İADE') {
            const product = state.products.find(p => p.name.toLowerCase() === t.productName.toLowerCase());
            if (product) {
                totalCostOfGoods += t.quantity * (product.buyingPrice || 0);
            }
        }
    });

    document.getElementById('total-transactions').textContent = totalTransactions;
    document.getElementById('total-credit').textContent = formatCurrency(totalCredit);
    document.getElementById('total-sales').textContent = formatCurrency(totalSales);
    document.getElementById('total-customers').textContent = state.customers.length;

    const profit = totalSales - totalCostOfGoods;
    const profitEl = document.getElementById('net-balance');
    profitEl.textContent = formatCurrency(profit);
    profitEl.classList.remove('text-red-600', 'text-green-600', 'text-gray-800');
    if (profit > 0) {
        profitEl.classList.add('text-green-600'); 
    } else if (profit < 0) {
        profitEl.classList.add('text-red-600'); 
    } else {
        profitEl.classList.add('text-gray-800'); 
    }
    
    const balanceBody = document.getElementById('customer-balances-table');
    balanceBody.innerHTML = ''; 
    Object.keys(customerAggregates).forEach(customerName => {
        const ag = customerAggregates[customerName] || { veresiye: 0, satis: 0 };
        const total = (ag.veresiye || 0) + (ag.satis || 0);
        const netDebt = (ag.veresiye || 0) - (ag.satis || 0);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${customerName}</td>
            <td>${formatCurrency(ag.veresiye || 0)}</td>
            <td>${formatCurrency(ag.satis || 0)}</td>
            <td>${formatCurrency(total)}</td>
            <td>
                <span class="px-2 py-1 text-xs font-medium rounded-full ${
                    netDebt > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }">
                    ${netDebt > 0 ? `Borçlu: ${formatCurrency(netDebt)}` : 'Nötr'}
                </span>
            </td>
        `;
        balanceBody.appendChild(row);
    });
}

async function updateCustomerAggregates(saveToDB = false) {
    const aggregates = {};
    state.transactions.forEach(t => {
        const name = t.customer || 'İSİMSİZ';
        if (!aggregates[name]) aggregates[name] = { veresiye: 0, satis: 0 };
        
        if (t.type === 'VERESİYE') {
            aggregates[name].veresiye += t.total;
        } else if (t.type === 'SATIŞ' || t.type === 'İKİSİDE' || t.type === 'ÖDEME') {
            aggregates[name].satis += t.total;
        }
    });

    const map = {};
    state.customers.forEach(c => map[c.name] = c);

    Object.keys(aggregates).forEach(name => {
        const a = aggregates[name];
        if (map[name]) {
            map[name].veresiye = a.veresiye;
            map[name].satis = a.satis;
        } else {
            const newCustomer = { id: DB.generateId(), name, phone: '', veresiye: a.veresiye, satis: a.satis };
            state.customers.push(newCustomer);
            map[name] = newCustomer; 
        }
    });

    state.customers.forEach(c => {
        if (typeof c.veresiye !== 'number') c.veresiye = 0;
        if (typeof c.satis !== 'number') c.satis = 0;
    });

    if (saveToDB) {
        await saveCurrentDatabase();
    }
}

function updateDatalists() {
    const customerList = document.getElementById('customer-list');
    customerList.innerHTML = '';
    state.customers.forEach(c => {
        const option = document.createElement('option');
        option.value = c.name;
        customerList.appendChild(option);
    });
    
    const productList = document.getElementById('product-list');
    productList.innerHTML = '';
    state.products.forEach(p => {
        const option = document.createElement('option');
        option.value = p.name;
        productList.appendChild(option);
    });
}

// --- DATABASE MANAGEMENT ---

async function loadDatabases() {
    const metadata = await DB.get('database-metadata');
    databases = Array.isArray(metadata) ? metadata : [];
    
    // Set current database to first one if not set
    if (databases.length > 0 && !currentDatabaseId) {
        currentDatabaseId = databases[0].id;
    } else if (databases.length === 0) {
        // Create default database
        await createDatabase('Ana Veritabanı');
    }
    
    renderDatabaseTable();
    updateCurrentDatabaseDisplay();
}

async function createDatabase(name) {
    if (!name.trim()) {
        Logger.warn('Empty database name', 'Veritabanı adı boş olamaz.');
        return false;
    }
    
    if (databases.some(db => db.name.toLowerCase() === name.toLowerCase())) {
        Logger.warn('Duplicate database name', 'Bu isimde bir veritabanı zaten var.');
        return false;
    }
    
    const dbId = DB.generateId();
    const now = new Date();
    const dbMetadata = {
        id: dbId,
        name: name.trim(),
        createdDate: now.toISOString(),
        lastModified: now.toISOString()
    };
    
    databases.push(dbMetadata);
    
    // Initialize empty database
    await DB.set(`db-${dbId}-transactions`, []);
    await DB.set(`db-${dbId}-customers`, []);
    await DB.set(`db-${dbId}-products`, []);
    
    // Save database metadata
    await saveDatabaseMetadata();
    
    // Switch to new database
    currentDatabaseId = dbId;
    await loadDatabase(dbId);
    
    Logger.success('Database created', `"${name}" veritabanı oluşturuldu.`);
    renderDatabaseTable();
    updateCurrentDatabaseDisplay();
    
    return true;
}

async function deleteDatabase(dbId) {
    const database = databases.find(db => db.id === dbId);
    if (!database) return false;
    
    if (!confirm(`"${database.name}" veritabanını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) {
        return false;
    }
    
    // Delete database data
    await DB.set(`db-${dbId}-transactions`, null);
    await DB.set(`db-${dbId}-customers`, null);
    await DB.set(`db-${dbId}-products`, null);
    
    // Remove from list
    databases = databases.filter(db => db.id !== dbId);
    await saveDatabaseMetadata();
    
    // If deleted database was current, switch to first available
    if (currentDatabaseId === dbId) {
        if (databases.length > 0) {
            currentDatabaseId = databases[0].id;
            await loadDatabase(currentDatabaseId);
        } else {
            await createDatabase('Ana Veritabanı');
        }
    }
    
    Logger.success('Database deleted', `"${database.name}" veritabanı silindi.`);
    renderDatabaseTable();
    updateCurrentDatabaseDisplay();
    
    return true;
}

async function loadDatabase(dbId) {
    const database = databases.find(db => db.id === dbId);
    if (!database) {
        Logger.error('Database not found', 'Veritabanı bulunamadı.');
        return false;
    }
    
    currentDatabaseId = dbId;
    
    // Load database data
    state.transactions = await DB.get(`db-${dbId}-transactions`);
    state.customers = await DB.get(`db-${dbId}-customers`);
    state.products = await DB.get(`db-${dbId}-products`);
    
    // Ensure products have stock property
    state.products.forEach(p => {
        if (typeof p.stock !== 'number') p.stock = 0;
    });
    
    await updateCustomerAggregates(true);
    updateDatalists();
    renderDashboard();
    
    Logger.success(`Database switched: ${database.name}`);
    updateCurrentDatabaseDisplay();
    renderDatabaseTable();
    
    return true;
}

async function saveDatabaseMetadata() {
    await DB.set('database-metadata', databases);
}

async function saveCurrentDatabase() {
    if (!currentDatabaseId) return;
    
    const now = new Date();
    const currentDb = databases.find(db => db.id === currentDatabaseId);
    if (currentDb) {
        currentDb.lastModified = now.toISOString();
    }
    
    await DB.set(`db-${currentDatabaseId}-transactions`, state.transactions);
    await DB.set(`db-${currentDatabaseId}-customers`, state.customers);
    await DB.set(`db-${currentDatabaseId}-products`, state.products);
    await saveDatabaseMetadata();
}

function updateCurrentDatabaseDisplay() {
    const currentDb = databases.find(db => db.id === currentDatabaseId);
    if (currentDb) {
        document.getElementById('current-db-name').textContent = currentDb.name;
        document.getElementById('current-db-date').textContent = formatDateDisplay(currentDb.createdDate);
    } else {
        document.getElementById('current-db-name').textContent = 'Yükleniyor...';
        document.getElementById('current-db-date').textContent = '-';
    }
}

function renderDatabaseTable() {
    const tableBody = document.getElementById('database-table-body');
    tableBody.innerHTML = '';
    
    if (databases.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-500 py-8">Veritabanı bulunamadı</td></tr>';
        return;
    }
    
    databases.forEach(db => {
        const row = document.createElement('tr');
        const isActive = db.id === currentDatabaseId;
        
        row.innerHTML = `
            <td class="${isActive ? 'font-bold text-blue-600' : ''}">${db.name}${isActive ? ' (Aktif)' : ''}</td>
            <td>${formatDateDisplay(db.createdDate)}</td>
            <td>${formatDateDisplay(db.lastModified)}</td>
            <td class="flex gap-2">
                ${!isActive ? `<button class="btn btn-secondary btn-switch-db" data-id="${db.id}" data-name="${db.name}" title="Aç">
                    <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21H3v-2a6 6 0 0 1 6-6h3v2m6-11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"></path></svg>
                    Aç
                </button>` : '<span class="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">Aktif</span>'}
                <button class="btn btn-danger btn-delete-db" data-id="${db.id}" title="Sil">
                    <svg id="icon-trash" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    Sil
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    replaceIcons();
}

async function exportAllDatabases() {
    try {
        showLoading('Veritabanları dışa aktarılıyor...');
        await waitForPapa();
        
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            databases: []
        };
        
        // Collect all database data
        for (const db of databases) {
            const dbData = {
                metadata: db,
                transactions: await DB.get(`db-${db.id}-transactions`),
                customers: await DB.get(`db-${db.id}-customers`),
                products: await DB.get(`db-${db.id}-products`)
            };
            exportData.databases.push(dbData);
        }
        
        // Create JSON file
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `veritabanlari_${getTodayDateFilename()}.json`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        Logger.success('Databases exported successfully', 'Tüm veritabanları dışa aktarıldı.');
        hideNotification();
    } catch (error) {
        Logger.error(`Export failed: ${error.message}`, 'Dışa aktarma başarısız oldu.');
    }
}

async function importAllDatabases(file) {
    try {
        showLoading('Veritabanları içe aktarılıyor...');
        
        const text = await file.text();
        const importData = JSON.parse(text);
        
        if (!importData.databases || !Array.isArray(importData.databases)) {
            throw new Error('Geçersiz veritabanı dosyası formatı.');
        }
        
        // Merge or replace databases
        for (const dbData of importData.databases) {
            const existingDb = databases.find(db => db.id === dbData.metadata.id);
            
            if (!existingDb) {
                databases.push(dbData.metadata);
            }
            
            // Save database data
            await DB.set(`db-${dbData.metadata.id}-transactions`, dbData.transactions || []);
            await DB.set(`db-${dbData.metadata.id}-customers`, dbData.customers || []);
            await DB.set(`db-${dbData.metadata.id}-products`, dbData.products || []);
        }
        
        // Save updated metadata
        await saveDatabaseMetadata();
        
        // Switch to first imported database
        if (importData.databases.length > 0) {
            await loadDatabase(importData.databases[0].metadata.id);
        }
        
        renderDatabaseTable();
        Logger.success(`${importData.databases.length} veritabanı içe aktarıldı.`, 'İçe aktarma başarılı.');
        hideNotification();
    } catch (error) {
        Logger.error(`Import failed: ${error.message}`, 'İçe aktarma başarısız oldu.');
    }
}


// --- NEW TRANSACTION FORM (SALE) ---
const transactionForm = document.getElementById('transaction-form');
const tQuantity = document.getElementById('t-quantity');
const tPrice = document.getElementById('t-price');
const tTotal = document.getElementById('t-total');
const tProductName = document.getElementById('t-product-name');

function calculateTotal() {
    const quantity = parseFloat(tQuantity.value) || 0;
    const price = parseFloat(tPrice.value) || 0;
    const total = quantity * price;
    tTotal.value = formatCurrency(total);
}
tQuantity.addEventListener('input', calculateTotal);
tPrice.addEventListener('input', calculateTotal);

tProductName.addEventListener('change', () => {
    const productName = tProductName.value.trim();
    const product = state.products.find(p => p.name.toLowerCase() === productName.toLowerCase());
    if (product) {
        // Use selling price for transactions
        tPrice.value = product.sellingPrice;
        try {
            const tUnitEl = document.getElementById('t-unit');
            if (tUnitEl && product.unit) tUnitEl.value = product.unit;

            const tProductTypeEl = document.getElementById('t-product-type');
            if (tProductTypeEl && product.type) tProductTypeEl.value = product.type;
        } catch (err) {
            console.warn('Auto-fill for unit/product-type failed:', err);
        }
        calculateTotal();
    }
});

transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const productName = tProductName.value.trim();
    const product = state.products.find(p => p.name.toLowerCase() === productName.toLowerCase());
    
    let price = parseFloat(tPrice.value);
    if ((!price || price === 0) && product) {
        // Use selling price as default
        price = product.sellingPrice;
    }

    const quantity = parseFloat(tQuantity.value);
    const total = price * quantity;
    
    const newTransaction = {
        id: DB.generateId(),
        date: document.getElementById('t-date').value,
        customer: document.getElementById('t-customer').value.trim(),
        type: document.getElementById('t-type').value,
        productType: document.getElementById('t-product-type').value,
        productName: productName,
        quantity: quantity,
        unit: document.getElementById('t-unit').value,
        price: price,
        total: total
    };

    if (!newTransaction.date || !newTransaction.customer || !newTransaction.productName || !newTransaction.quantity || !newTransaction.price) {
        Logger.warn('Transaction submission with missing required fields', 'Lütfen tüm gerekli alanları doldurun.');
        return;
    }

    // Stock Management Logic
    if (product) {
        const currentStock = product.stock || 0;
        
        // If sale type is RETURN (İADE), we increase stock
        if (newTransaction.type === 'İADE') {
            product.stock = currentStock + quantity;
        } else {
            // Check stock sufficiency for sales
            if (currentStock < quantity) {
                Logger.error(`Insufficient stock for product: ${productName}. Available: ${currentStock}, Requested: ${quantity}`, 'Stokta bu ürün mevcut değil!');
                return;
            }
            // For Sales (VERESİYE, SATIŞ, İKİSİDE), we decrease stock
            product.stock = currentStock - quantity;
        }
        
        // Save product changes (will be saved again with transaction but this ensures consistency)
        await saveCurrentDatabase();
    } else {
        if (!product) {
            Logger.error('Product not found in database', 'Ürün bulunamadı!'); 
            return; 
        }
    }

    state.transactions.push(newTransaction);
    const saved = await saveCurrentDatabase();

    if (saved) {
        Logger.success('Transaction recorded and stock updated', 'İşlem kaydedildi ve stok güncellendi!');
        transactionForm.reset();
        document.getElementById('t-date').value = getTodayDate(); 
        await updateCustomerAggregates(true);
        updateDatalists(); 
        renderDashboard(); 
        renderTransactionTable(state.transactions); 
    } else {
        Logger.error('Failed to save transaction to database', 'İşlem kaydedilemedi.');
        state.transactions.pop();
        // Revert stock change if transaction failed (optional but good practice)
        if (product) {
             // To properly revert, we'd need to re-fetch or undo the logic above.
             // Since failures here are rare (file write errors), simple notification is okay for now.
        }
    }
});

// --- NEW PAYMENT FORM ---
const paymentForm = document.getElementById('payment-form');

paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const paymentAmount = parseFloat(document.getElementById('p-amount').value);
    const customerName = document.getElementById('p-customer').value.trim();
    const paymentDate = document.getElementById('p-date').value;

    if (!paymentDate || !customerName || !paymentAmount || paymentAmount <= 0) {
        Logger.warn('Payment submission with invalid data', 'Lütfen tüm alanları geçerli verilerle doldurun.');
        return;
    }

    const newPaymentTransaction = {
        id: DB.generateId(),
        date: paymentDate,
        customer: customerName,
        type: 'ÖDEME', 
        productType: '-',
        productName: 'Ödeme',
        quantity: 1,
        unit: '-',
        price: paymentAmount,
        total: paymentAmount
    };

    state.transactions.push(newPaymentTransaction);
    const saved = await saveCurrentDatabase();

    if (saved) {
        Logger.success('Payment recorded', 'Ödeme kaydedildi!');
        paymentForm.reset();
        document.getElementById('p-date').value = getTodayDate(); 
        await updateCustomerAggregates(true);
        updateDatalists(); 
        renderDashboard(); 
        renderTransactionTable(state.transactions); 
    } else {
        Logger.error('Failed to save payment to database', 'Ödeme kaydedilemedi.');
        state.transactions.pop();
    }
});


// --- SEARCH TRANSACTIONS ---
const filterBtn = document.getElementById('filter-btn');
const resetFilterBtn = document.getElementById('reset-filter-btn');
const noTransactionsEl = document.getElementById('no-transactions');

function renderTransactionTable(transactions) {
    const tableBody = document.getElementById('transaction-table-body');
    tableBody.innerHTML = '';
    
    if (transactions.length === 0) {
        noTransactionsEl.style.display = 'block';
    } else {
        noTransactionsEl.style.display = 'none';
    }

    // Sort by date, newest first
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    transactions.forEach(t => {
        const row = document.createElement('tr');
        
        if (t.type === 'ÖDEME') {
            row.innerHTML = `
                <td><code class="text-xs bg-gray-100 px-2 py-1 rounded">${t.id}</code></td>
                <td>${formatDateDisplay(t.date)}</td>
                <td>${t.customer}</td>
                <td><span class="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">${t.type}</span></td>
                <td>-</td>
                <td class="font-medium">${t.productName}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td class="font-medium text-green-700">${formatCurrency(t.total)}</td>
                <td class="flex gap-2">
                    <button class="btn btn-danger btn-delete-transaction" data-id="${t.id}">
                        <svg id="icon-trash" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </td>
            `;
        } else {
             row.innerHTML = `
                <td><code class="text-xs bg-gray-100 px-2 py-1 rounded">${t.id}</code></td>
                <td>${formatDateDisplay(t.date)}</td>
                <td>${t.customer}</td>
                <td>${t.type}</td>
                <td>${t.productType}</td>
                <td>${t.productName}</td>
                <td>${t.quantity}</td>
                <td>${t.unit}</td>
                <td>${formatCurrency(t.price)}</td>
                <td class="font-medium ${t.type === 'VERESİYE' ? 'text-red-600' : 'text-gray-800'}">${formatCurrency(t.total)}</td>
                <td class="flex gap-2">
                    <button class="btn btn-danger btn-delete-transaction" data-id="${t.id}">
                        <svg id="icon-trash" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </td>
            `;
        }
        tableBody.appendChild(row);
    });

    replaceIcons();
}

filterBtn.addEventListener('click', () => {
    const fId = document.getElementById('f-id').value.toLowerCase();
    const fCustomer = document.getElementById('f-customer').value.toLowerCase();
    const fType = document.getElementById('f-type').value;
    const fProductType = document.getElementById('f-product-type').value;

    const filtered = state.transactions.filter(t => {
        const idMatch = !fId || t.id.toLowerCase().includes(fId);
        const customerMatch = t.customer.toLowerCase().includes(fCustomer);
        const typeMatch = !fType || t.type === fType;
        const productTypeMatch = !fProductType || t.productType === fProductType;
        return idMatch && customerMatch && typeMatch && productTypeMatch;
    });
    
    renderTransactionTable(filtered);
});

resetFilterBtn.addEventListener('click', () => {
    document.getElementById('f-id').value = '';
    document.getElementById('f-customer').value = '';
    document.getElementById('f-type').value = '';
    document.getElementById('f-product-type').value = '';
    renderTransactionTable(state.transactions);
});


// --- CUSTOMER MANAGEMENT ---
const customerForm = document.getElementById('customer-form');

function renderCustomerTable() {
    const tableBody = document.getElementById('customer-table-body');
    tableBody.innerHTML = '';
    
    // Sort logic
    state.customers.sort((a, b) => {
        let valA = (a[currentSort.field] || '').toString().toLowerCase();
        let valB = (b[currentSort.field] || '').toString().toLowerCase();
        
        // Combine address fields for sorting if sorting by address
        if (currentSort.field === 'address') {
            valA = `${a.city || ''} ${a.district || ''} ${a.street || ''}`.trim().toLowerCase();
            valB = `${b.city || ''} ${b.district || ''} ${b.street || ''}`.trim().toLowerCase();
        }

        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    state.customers.forEach(c => {
        const address = `${c.city || ''} ${c.district || ''} ${c.street || ''}`.trim() || '-';
        const dob = formatDateDisplay(c.dob);
        const tc = c.tc || '-';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${c.name}</td>
            <td>${tc}</td>
            <td>${dob}</td>
            <td>${c.phone || '-'}</td>
            <td>${address}</td>
            <td class="flex gap-2">
                <button class="btn btn-secondary btn-edit-customer" data-id="${c.id}" title="Düzenle">
                    <svg id="icon-edit" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn btn-danger btn-delete-customer" data-id="${c.id}">
                    <svg id="icon-trash" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    replaceIcons();
}

customerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('c-name').value.trim();
    const phone = document.getElementById('c-phone').value.trim();
    const tc = document.getElementById('c-id').value.trim();
    const dob = document.getElementById('c-dob').value;
    const city = document.getElementById('c-city').value.trim();
    const district = document.getElementById('c-district').value.trim();
    const street = document.getElementById('c-street').value.trim();
    
    if (!name) {
        Logger.warn('Customer creation without name', 'Müşteri adı gerekli.');
        return;
    }
    
    if (state.customers.find(c => c.name.toLowerCase() === name.toLowerCase())) {
        Logger.warn('Duplicate customer name attempted', 'Bu isimde bir müşteri zaten var.');
        return;
    }

    const newCustomer = { 
        id: DB.generateId(), 
        name, phone, tc, dob, city, district, street,
        veresiye: 0, satis: 0 
    };
    
    state.customers.push(newCustomer);
    await saveCurrentDatabase();
    
    renderCustomerTable();
    updateDatalists();
    customerForm.reset();
    Logger.success('Customer added', 'Müşteri eklendi!');
});


// --- PRODUCT MANAGEMENT ---
const productForm = document.getElementById('product-form');

function renderProductTable() {
    const tableBody = document.getElementById('product-table-body');
    tableBody.innerHTML = '';
    state.products.forEach(p => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${p.name}</td>
            <td>${p.type || 'DİĞER'}</td>
            <td>${p.unit || '-'}</td>
            <td>${formatCurrency(p.buyingPrice || 0)}</td>
            <td>${formatCurrency(p.sellingPrice || 0)}</td>
            <td>${p.stock || 0}</td>
            <td class="flex gap-2">
                <button class="btn btn-success btn-add-stock" data-id="${p.id}" title="Stok Ekle">
                    <svg id="icon-plus" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"></line><line x1="5" x2="19" y1="12" y2="12"></line></svg>
                </button>
                <button class="btn btn-secondary btn-edit-product" data-id="${p.id}" title="Düzenle">
                    <svg id="icon-edit" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn btn-danger btn-delete-product" data-id="${p.id}" title="Sil">
                    <svg id="icon-trash" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    replaceIcons();
}

productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('p-name').value.trim();
    const type = document.getElementById('p-type').value;
    const unit = document.getElementById('p-unit').value.trim();
    const buyingPrice = parseFloat(document.getElementById('p-buying-price').value);
    const sellingPrice = parseFloat(document.getElementById('p-selling-price').value);
    
    if (!name || !buyingPrice || !sellingPrice) {
        Logger.warn('Product creation with missing fields', 'Ürün adı ve her iki fiyat gerekli.');
        return;
    }
    
    // Default stock is 0
    const newProduct = { id: DB.generateId(), name, type, unit, buyingPrice, sellingPrice, stock: 0 };
    state.products.push(newProduct);
    await saveCurrentDatabase();
    
    renderProductTable();
    updateDatalists();
    productForm.reset();
    Logger.success('Product added', 'Ürün eklendi!');
});

/*
// --- DATA IMPORT ---
const importBtn = document.getElementById('import-btn');

importBtn.addEventListener('click', async () => {
    const transactionCSV = document.getElementById('import-transactions').value;
    const productCSV = document.getElementById('import-products').value;
    
    let importedTransactions = [];
    let importedProducts = [];
    
    // Parse Transactions
    try {
        const transactionData = Papa.parse(transactionCSV, { header: true, skipEmptyLines: true });
        importedTransactions = transactionData.data.map(row => ({
            id: DB.generateId(),
            date: row['TARİH'] || getTodayDate(),
            customer: row['ADI SOYADI'] || 'İSİMSİZ',
            type: row['VERESİYE/SATIŞ'] || 'SATIŞ',
            productType: row['MALIN CİNSİ'] || 'DİĞER',
            productName: row['ÇEŞİT'] || 'Bilinmeyen Ürün',
            quantity: parseFloat(row['MİKTAR']) || 1,
            unit: row['ADET'] || 'TANE',
            price: parseFloat(row['FİYAT']) || 0, 
            total: parseFloat(row['TOPLAM']) || 0 
        }));
    } catch (e) {
        showToast(`Error parsing transactions: ${e.message}`, 'error');
        return;
    }
    
    // Parse Products
    try {
        const productData = Papa.parse(productCSV, { header: true, skipEmptyLines: true });
        importedProducts = productData.data.map(row => ({
            id: DB.generateId(),
            name: row['ÜRÜN ADI'] || row['İLAÇ ADI'] || row['GÜBRE ADI'] || 'Bilinmeyen Ürün',
            type: (row['İLAÇ ADI'] ? 'İLAÇ' : (row['GÜBRE ADI'] ? 'GÜBRE' : 'DİĞER')),
            price: parseFloat(row['FİYAT']) || 0,
            stock: 0 // Default stock for imported products
        })).filter(p => p.price > 0 && p.name !== 'Bilinmeyen Ürün'); 
    } catch (e) {
        showToast(`Error parsing products: ${e.message}`, 'error');
        return;
    }
    
    state.transactions = importedTransactions;
    state.products = importedProducts;
    
    const customerNames = new Set(importedTransactions.map(t => t.customer));
    state.customers = [...customerNames].map(name => ({ id: DB.generateId(), name, phone: '' }));
    
    await DB.set('transactions', state.transactions);
    await DB.set('products', state.products);
    await DB.set('customers', state.customers);
    
    showToast('Data imported successfully!', 'success');
    loadInitialData(); 
    showTab('dashboard'); 
});
*/

// --- GLOBAL EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
    // Verify that PapaParse is loaded
    let papaReady = false;
    const maxWaitTime = 10000; // 10 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
        if (typeof Papa !== 'undefined') {
            papaReady = true;
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!papaReady) {
        console.warn('PapaParse library failed to load in time');
        console.error('PapaParse library did not load');
    }
    
    // Call replaceIcons for any dynamically created SVG placeholders
    replaceIcons();

    // --- Tab navigation
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            if (tabId) showTab(tabId);
        });
    });

    // --- Customer Table Sorting
    document.querySelectorAll('#customers th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.getAttribute('data-sort');
            if (currentSort.field === field) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.field = field;
                currentSort.direction = 'asc';
            }
            renderCustomerTable();
        });
    });

    // --- Database Management Handlers ---
    const createDatabaseForm = document.getElementById('create-database-form');
    if (createDatabaseForm) {
        createDatabaseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-db-name').value.trim();
            if (await createDatabase(name)) {
                createDatabaseForm.reset();
            }
        });
    }

    // Database delete handlers
    document.getElementById('database-table-body').addEventListener('click', async (e) => {
        const switchBtn = e.target.closest('.btn-switch-db');
        if (switchBtn) {
            const dbId = switchBtn.getAttribute('data-id');
            const dbName = switchBtn.getAttribute('data-name') || 'Veritabanı';
            showLoading(`"${dbName}" veritabanına geçiliyor...`);
            await saveCurrentDatabase();
            await loadDatabase(dbId);
            hideNotification();
            return;
        }

        const deleteBtn = e.target.closest('.btn-delete-db');
        if (deleteBtn) {
            const dbId = deleteBtn.getAttribute('data-id');
            await deleteDatabase(dbId);
            renderDatabaseTable();
            return;
        }
    });

    // Export all databases
    const exportDatabasesBtn = document.getElementById('export-databases-btn');
    if (exportDatabasesBtn) {
        exportDatabasesBtn.addEventListener('click', async () => {
            await saveCurrentDatabase();
            await exportAllDatabases();
        });
    }

    // Import databases
    const importDatabasesBtn = document.getElementById('import-databases-btn');
    const importDatabasesFile = document.getElementById('import-databases-file');
    if (importDatabasesBtn && importDatabasesFile) {
        importDatabasesBtn.addEventListener('click', () => {
            importDatabasesFile.click();
        });

        importDatabasesFile.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await importAllDatabases(file);
                renderDatabaseTable();
                importDatabasesFile.value = '';
            }
        });
    }

    // --- Export Buttons
    const exportTransactionsBtn = document.getElementById('export-transactions-btn');
    if (exportTransactionsBtn) {
        exportTransactionsBtn.addEventListener('click', async () => {
            if (state.transactions.length === 0) {
                Logger.warn('Export attempted with no transactions', 'Aktarılacak işlem yok.');
                return;
            }
            try {
                showLoading('İşlemler dışa aktarılıyor...');
                await waitForPapa();
                const exportData = state.transactions.map(t => ({
                    'İşlem ID': t.id,
                    Tarih: formatDateDisplay(t.date),
                    Müşteri: t.customer,
                    Tür: t.type,
                    'Ürün Çeşidi': t.productType,
                    'Ürün Adı': t.productName,
                    Miktar: t.quantity,
                    Birim: t.unit,
                    Fiyat: t.price,
                    Toplam: t.total
                }));
                exportToCSV(exportData, `islemler_${getTodayDateFilename()}.csv`);
                Logger.success(`Exported ${exportData.length} transactions`, null);
            } catch (error) {
                Logger.error(`Transaction export failed: ${error.message}`, 'Dışa aktarma başarısız oldu.');
            }
        });
    }

    const exportCustomersBtn = document.getElementById('export-customers-btn');
    if (exportCustomersBtn) {
        exportCustomersBtn.addEventListener('click', async () => {
            if (state.customers.length === 0) {
                Logger.warn('Export attempted with no customers', 'Aktarılacak müşteri yok.');
                return;
            }
            try {
                showLoading('Müşteriler dışa aktarılıyor...');
                await waitForPapa();
                const exportData = state.customers.map(c => ({
                    İsim: c.name,
                    'TC Kimlik': c.tc || '',
                    'Doğum Tarihi': formatDateDisplay(c.dob),
                    Telefon: c.phone || '',
                    İl: c.city || '',
                    İlçe: c.district || '',
                    Sokak: c.street || '',
                    'Toplam Borç': c.veresiye,
                    'Toplam Ödeme': c.satis
                }));
                exportToCSV(exportData, `musteriler_${getTodayDateFilename()}.csv`);
                Logger.success(`Exported ${exportData.length} customers`, null);
            } catch (error) {
                Logger.error(`Customer export failed: ${error.message}`, 'Dışa aktarma başarısız oldu.');
            }
        });
    }

    const exportProductsBtn = document.getElementById('export-products-btn');
    if (exportProductsBtn) {
        exportProductsBtn.addEventListener('click', async () => {
            if (state.products.length === 0) {
                Logger.warn('Export attempted with no products', 'Aktarılacak ürün yok.');
                return;
            }
            try {
                showLoading('Ürünler dışa aktarılıyor...');
                await waitForPapa();
                const exportData = state.products.map(p => ({
                    İsim: p.name,
                    Tür: p.type,
                    Birim: p.unit,
                    'Alış Fiyatı': p.buyingPrice,
                    'Satış Fiyatı': p.sellingPrice,
                    Stok: p.stock || 0
                }));
                exportToCSV(exportData, `urunler_${getTodayDateFilename()}.csv`);
                Logger.success(`Exported ${exportData.length} products`, null);
            } catch (error) {
                Logger.error(`Product export failed: ${error.message}`, 'Dışa aktarma başarısız oldu.');
            }
        });
    }


    // --- Clear Forms
    document.getElementById('clear-form-btn').addEventListener('click', () => {
        document.getElementById('transaction-form').reset();
        document.getElementById('t-date').value = getTodayDate();
    });
    document.getElementById('clear-payment-form-btn').addEventListener('click', () => {
        document.getElementById('payment-form').reset();
        document.getElementById('p-date').value = getTodayDate();
    });

    // --- Delete Handlers
    document.getElementById('transaction-table-body').addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.btn-delete-transaction');
        if (deleteButton) {
            const id = deleteButton.getAttribute('data-id');
            if (confirm('Bu işlemi silmek istediğinizden emin misiniz?')) {
                state.transactions = state.transactions.filter(t => t.id !== id);
                await saveCurrentDatabase();
                await updateCustomerAggregates(true);
                updateDatalists();
                renderTransactionTable(state.transactions);
                renderDashboard(); 
                Logger.success('Transaction deleted', 'İşlem silindi.');
            }
        }
    });

    document.getElementById('customer-table-body').addEventListener('click', async (e) => {
        // Check for edit
        const editButton = e.target.closest('.btn-edit-customer');
        if (editButton) {
            const id = editButton.getAttribute('data-id');
            const customer = state.customers.find(c => c.id === id);
            if (customer) {
                document.getElementById('edit-c-hidden-id').value = customer.id;
                document.getElementById('edit-c-name').value = customer.name;
                document.getElementById('edit-c-id').value = customer.tc || '';
                document.getElementById('edit-c-dob').value = customer.dob || '';
                document.getElementById('edit-c-city').value = customer.city || '';
                document.getElementById('edit-c-district').value = customer.district || '';
                document.getElementById('edit-c-phone').value = customer.phone || '';
                document.getElementById('edit-c-street').value = customer.street || '';
                // Initialize flatpickr for edit modal date
                flatpickr("#edit-c-dob", {
                    dateFormat: "d/m/Y",
                    locale: "tr",
                    defaultDate: customer.dob || ''
                });
                document.getElementById('edit-customer-modal').style.display = 'flex';
            }
            return;
        }

        const deleteButton = e.target.closest('.btn-delete-customer');
        if (deleteButton) {
            const id = deleteButton.getAttribute('data-id');
            const customer = state.customers.find(c => c.id === id);
            
            const customerTransactions = state.transactions.filter(t => t.customer === customer.name);
            if (customerTransactions.length > 0) {
                 if (!confirm('Bu müşterinin işlemleri var. Silmek tüm işlemlerini de silecektir. Emin misiniz?')) {
                    return;
                 }
                 state.transactions = state.transactions.filter(t => t.customer !== customer.name);
                 Logger.info(`Deleted customer ${customer.name} and ${customerTransactions.length} related transactions`);
            } else if (!confirm('Bu müşteriyi silmek istediğinizden emin misiniz? Bu geri alınamaz.')) {
                return;
            }

            state.customers = state.customers.filter(c => c.id !== id);
            await saveCurrentDatabase();
            
            await updateCustomerAggregates(true);
            renderCustomerTable();
            updateDatalists();
            renderDashboard();
            renderTransactionTable(state.transactions);
            Logger.success('Customer deleted', 'Müşteri silindi.');
        }
    });

    document.getElementById('product-table-body').addEventListener('click', async (e) => {
        // Check for Add Stock
        const stockButton = e.target.closest('.btn-add-stock');
        if (stockButton) {
            const id = stockButton.getAttribute('data-id');
            const product = state.products.find(p => p.id === id);
            if (product) {
                document.getElementById('add-stock-id').value = product.id;
                document.getElementById('add-stock-product-name').textContent = product.name;
                document.getElementById('add-stock-quantity').value = ''; // Clear previous
                document.getElementById('add-stock-modal').style.display = 'flex';
                document.getElementById('add-stock-quantity').focus();
            }
            return;
        }
        // Check for delete
        const deleteButton = e.target.closest('.btn-delete-product');
        if (deleteButton) {
            const id = deleteButton.getAttribute('data-id');
            if (confirm('Bu ürünü silmek istediğinizden emin misiniz?')) {
                state.products = state.products.filter(p => p.id !== id);
                await saveCurrentDatabase();
                renderProductTable();
                updateDatalists();
                Logger.success('Product deleted', 'Ürün silindi.');
            }
            return; 
        }
        
        const editButton = e.target.closest('.btn-edit-product');
        if (editButton) {
            const id = editButton.getAttribute('data-id');
            const product = state.products.find(p => p.id === id);
            if (product) {
                document.getElementById('edit-p-id').value = product.id;
                document.getElementById('edit-p-name').value = product.name;
                document.getElementById('edit-p-type').value = product.type;
                document.getElementById('edit-p-unit').value = product.unit || '';
                document.getElementById('edit-p-buying-price').value = product.buyingPrice;
                document.getElementById('edit-p-selling-price').value = product.sellingPrice;
                document.getElementById('edit-product-modal').style.display = 'flex';
            }
        }
    });

    // --- Product Edit Modal Listeners ---
    const editModal = document.getElementById('edit-product-modal');
    const editForm = document.getElementById('edit-product-form');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    cancelEditBtn.addEventListener('click', () => {
        editModal.style.display = 'none';
    });

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-p-id').value;
        const buyingPrice = parseFloat(document.getElementById('edit-p-buying-price').value);
        const sellingPrice = parseFloat(document.getElementById('edit-p-selling-price').value);
        const updatedProduct = {
            id: id,
            name: document.getElementById('edit-p-name').value.trim(),
            type: document.getElementById('edit-p-type').value,
            unit: document.getElementById('edit-p-unit').value.trim(),
            buyingPrice: buyingPrice,
            sellingPrice: sellingPrice
        };

        if (!updatedProduct.name || buyingPrice < 0 || sellingPrice < 0) {
                Logger.warn('Invalid product data for update', 'Geçersiz ürün adı veya fiyat.');
        }

        // Preserve existing stock
        const existingProduct = state.products.find(p => p.id === id);
        if (existingProduct) {
            updatedProduct.stock = existingProduct.stock;
        }

        state.products = state.products.map(p => p.id === id ? updatedProduct : p);
        await saveCurrentDatabase();

        renderProductTable();
        updateDatalists();
        editModal.style.display = 'none';
        Logger.success('Product updated', 'Ürün güncellendi!');
    });

    // --- Add Stock Modal Listeners ---
    const stockModal = document.getElementById('add-stock-modal');
    const stockForm = document.getElementById('add-stock-form');
    const cancelStockBtn = document.getElementById('cancel-stock-btn');

    cancelStockBtn.addEventListener('click', () => {
        stockModal.style.display = 'none';
    });

    stockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('add-stock-id').value;
        const quantityToAdd = parseFloat(document.getElementById('add-stock-quantity').value);

        if (isNaN(quantityToAdd) || quantityToAdd <= 0) {
            Logger.warn('Invalid stock quantity entered', 'Lütfen geçerli bir miktar girin.');
            return;
        }

        const product = state.products.find(p => p.id === id);
        if (product) {
            product.stock = (product.stock || 0) + quantityToAdd;
            await saveCurrentDatabase();
            renderProductTable();
            stockModal.style.display = 'none';
            Logger.success(`Stock updated for ${product.name}: +${quantityToAdd}`, 'Stok güncellendi!');
        }
    });

    loadInitialData();

    // Initialize date pickers
    flatpickr("#t-date", {
        dateFormat: "d/m/Y",
        locale: "tr",
        defaultDate: getTodayDate()
    });
    flatpickr("#p-date", {
        dateFormat: "d/m/Y",
        locale: "tr",
        defaultDate: getTodayDate()
    });
    flatpickr("#c-dob", {
        dateFormat: "d/m/Y",
        locale: "tr"
    });

    // --- Edit Customer Modal Listeners ---
    const editCustomerModal = document.getElementById('edit-customer-modal');
    const editCustomerForm = document.getElementById('edit-customer-form');
    const cancelEditCustomerBtn = document.getElementById('cancel-edit-customer-btn');

    cancelEditCustomerBtn.addEventListener('click', () => {
        editCustomerModal.style.display = 'none';
    });

    editCustomerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-c-hidden-id').value;
        const updatedCustomer = {
            id: id,
            name: document.getElementById('edit-c-name').value.trim(),
            tc: document.getElementById('edit-c-id').value.trim(),
            dob: document.getElementById('edit-c-dob').value,
            city: document.getElementById('edit-c-city').value.trim(),
            district: document.getElementById('edit-c-district').value.trim(),
            phone: document.getElementById('edit-c-phone').value.trim(),
            street: document.getElementById('edit-c-street').value.trim(),
            veresiye: 0, // Will be updated by aggregates
            satis: 0
        };

        if (!updatedCustomer.name) {
            Logger.warn('Customer update with empty name', 'Müşteri adı gerekli.');
            return;
        }

        // Check for duplicate name, excluding current
        const existing = state.customers.find(c => c.name.toLowerCase() === updatedCustomer.name.toLowerCase() && c.id !== id);
        if (existing) {
            Logger.warn('Duplicate customer name in update', 'Bu isimde bir müşteri zaten var.');
            return;
        }

        // Update transactions if name changed
        const oldCustomer = state.customers.find(c => c.id === id);
        if (oldCustomer.name !== updatedCustomer.name) {
            state.transactions.forEach(t => {
                if (t.customer === oldCustomer.name) {
                    t.customer = updatedCustomer.name;
                }
            });
        }

        state.customers = state.customers.map(c => c.id === id ? updatedCustomer : c);
        await saveCurrentDatabase();

        await updateCustomerAggregates(true);
        renderCustomerTable();
        updateDatalists();
        renderDashboard();
        editCustomerModal.style.display = 'none';
        Logger.success('Customer updated', 'Müşteri güncellendi!');
    });

    // --- Notification Panel Event Listeners ---
    const notificationCloseBtn = document.getElementById('notification-close');
    const notificationToggleLogsBtn = document.getElementById('notification-toggle-logs');
    const notificationLogs = document.getElementById('notification-logs');
    let logsExpanded = false;

    notificationCloseBtn.addEventListener('click', () => {
        hideNotification();
    });

    notificationToggleLogsBtn.addEventListener('click', () => {
        logsExpanded = !logsExpanded;
        if (logsExpanded) {
            notificationLogs.classList.add('expanded');
            notificationToggleLogsBtn.textContent = 'Günlüğü Gizle';
            updateNotificationLogs();
        } else {
            notificationLogs.classList.remove('expanded');
            notificationToggleLogsBtn.textContent = 'Günlüğü Göster';
        }
    });

    function updateNotificationLogs() {
        const logs = Logger.getAll();
        const logsContainer = document.getElementById('notification-logs');
        logsContainer.innerHTML = '';
        
        // Show last 10 logs
        const recentLogs = logs.slice(-10).reverse();
        recentLogs.forEach(log => {
            const entry = document.createElement('div');
            entry.className = `notification-log-entry ${log.type}`;
            entry.textContent = `[${log.timestamp}] ${log.message}`;
            logsContainer.appendChild(entry);
        });
        
        if (logs.length > 0) {
            notificationToggleLogsBtn.style.display = 'block';
        }
    }

    // Initialize app
    Logger.info('Application started', 'Uygulama başlatıldı');
});