// --- DATABASE HELPERS (using Electron's file system via preload.js) ---
const DB = {
    // Get data from a JSON file
    get: async (key) => {
        const { success, data, error } = await window.electronAPI.loadData(key);
        if (success) {
            return data;
        } else {
            console.error(`Failed to load ${key}:`, error);
            showToast(`Error loading data: ${error}`, 'error');
            return []; // Return empty array on failure
        }
    },
    // Save data to a JSON file
    set: async (key, data) => {
        const { success, path, error } = await window.electronAPI.saveData(key, data);
        if (!success) {
            console.error(`Failed to save ${key}:`, error);
            showToast(`Error saving data: ${error}`, 'error');
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

// --- UTILITY FUNCTIONS ---

/**
 * Formats a number as Turkish Lira
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    return num.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
}

/**
 * Show a toast message
 * @param {string} message
 * @param {string} type - 'success' or 'error'
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    toastMessage.textContent = message;
    if (type === 'error') {
        toast.classList.remove('bg-green-500');
        toast.classList.add('bg-red-500');
    } else {
        toast.classList.remove('bg-red-500');
        toast.classList.add('bg-green-500');
    }
    
    toast.classList.remove('translate-x-full');
    setTimeout(() => {
        toast.classList.add('translate-x-full');
    }, 3000);
}

/**
 * Gets today's date in YYYY-MM-DD format
 * @returns {string}
 */
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// --- DATA IMPORT LOGIC ---

document.getElementById('import-btn').addEventListener('click', async () => {
    try {
        let importedTransactions = [];
        let importedProducts = [];

        // 1. Import Transactions
        const transactionsCSV = document.getElementById('import-transactions').value;
        if (transactionsCSV) {
            const parsedTransactions = Papa.parse(transactionsCSV, { header: true, skipEmptyLines: true }).data;
            importedTransactions = parsedTransactions.map(t => ({
                id: DB.generateId(),
                date: t['TARİH'] || getTodayDate(),
                customer: (t['ADI SOYADI'] || 'İSİMSİZ').trim(),
                type: (t['VERESİYE/SATIŞ'] || 'SATIŞ').trim(),
                productType: (t['MALIN CİNSİ'] || 'DİĞER').trim(),
                productName: (t['ÇEŞİT'] || 'Bilinmeyen Ürün').trim(),
                quantity: parseFloat(t['MİKTAR'] || 0),
                unit: (t['ADET'] || 'TANE').trim(),
                price: parseFloat(t['FİYAT'] || 0),
                total: parseFloat(t['TOPLAM'] || 0)
            }));
        }
        
        // 2. Import Products
        const productsCSV = document.getElementById('import-products').value;
        if (productsCSV) {
            const parsedProducts = Papa.parse(productsCSV, { header: true, skipEmptyLines: true }).data;
            const productMap = new Map(); // Use map to handle duplicates
            
            parsedProducts.forEach(p => {
                const name = p['ÜRÜN ADI'] || p['İLAÇ ADI'] || p['GÜBRE ADI'];
                const price = parseFloat(p['FİYAT'] || 0);
                if (name && price > 0 && !productMap.has(name.trim())) {
                    productMap.set(name.trim(), {
                        id: DB.generateId(),
                        name: name.trim(),
                        type: name.toLowerCase().includes('lt') || name.toLowerCase().includes('ec') ? 'İLAÇ' : 'GÜBRE',
                        price: price
                    });
                }
            });
            importedProducts = Array.from(productMap.values());
            await DB.set('products', importedProducts);
            state.products = importedProducts;
            console.log('Imported products:', importedProducts);
        }
        
        // 3. Auto-generate customers from transactions
        const customerSet = new Set(importedTransactions.map(t => t.customer));
        const existingCustomers = new Set((await DB.get('customers')).map(c => c.name));
        const newCustomers = [];
        
        customerSet.forEach(name => {
            if (!existingCustomers.has(name) && name.toLowerCase() !== 'i̇si̇msi̇z') {
                newCustomers.push({
                    id: DB.generateId(),
                    name: name,
                    phone: ''
                });
            }
        });
        
        const allCustomers = [...(await DB.get('customers')), ...newCustomers];
        await DB.set('customers', allCustomers);
        state.customers = allCustomers;
        
        // 4. Update transactions with prices from product list
        importedTransactions.forEach(t => {
            if (t.price === 0 && t.total === 0) {
                const product = state.products.find(p => p.name === t.productName);
                if (product) {
                    t.price = product.price;
                    t.total = t.price * t.quantity;
                }
            } else if (t.price === 0 && t.total > 0 && t.quantity > 0) {
                t.price = t.total / t.quantity;
            }
        });
        
        await DB.set('transactions', importedTransactions);
        state.transactions = importedTransactions;
        console.log('Imported transactions:', importedTransactions);

        showToast('Data imported successfully!', 'success');
        // Refresh all views
        loadInitialData(); // This will re-load from the files we just saved
        showTab('dashboard');

    } catch (error) {
        console.error('Import failed:', error);
        showToast('Error during import. Check console.', 'error');
    }
});

// --- TAB SWITCHING ---
let currentTab = 'dashboard';
const tabs = document.querySelectorAll('.tab-content');
const tabButtons = document.querySelectorAll('.tab-button');

function showTab(tabId) {
    tabs.forEach(tab => tab.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
    
    tabButtons.forEach(button => button.classList.remove('active'));
    // --- THIS IS THE FIX ---
    // We now select the button by its 'data-tab' attribute, not the broken 'onclick'
    const activeButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
    // --- END OF FIX ---
    
    currentTab = tabId;
    
    if (tabId === 'dashboard') {
        renderDashboard();
    } else if (tabId === 'transactions') {
        renderTransactionTable(state.transactions);
    } else if (tabId === 'customers') {
        renderCustomerTable();
    } else if (tabId === 'products') {
        renderProductTable();
    } else if (tabId === 'newTransaction') {
        updateDatalists();
        document.getElementById('t-date').value = getTodayDate();
    }
}

// --- DASHBOARD LOGIC ---
function renderDashboard() {
    let totalTransactions = state.transactions.length;
    let totalCredit = 0;
    let totalSales = 0;
    const customerBalances = new Map();

    state.transactions.forEach(t => {
        const total = parseFloat(t.total) || 0;
        
        if (t.type === 'VERESİYE' || t.type === 'İKİSİDE') {
            totalCredit += total;
        }
        if (t.type === 'SATIŞ' || t.type === 'İKİSİDE') {
            totalSales += total;
        }
        
        const currentBalance = customerBalances.get(t.customer) || 0;
        customerBalances.set(t.customer, currentBalance + total);
    });
    
    document.getElementById('total-transactions').textContent = totalTransactions;
    document.getElementById('total-credit').textContent = formatCurrency(totalCredit);
    document.getElementById('total-sales').textContent = formatCurrency(totalSales);
    document.getElementById('total-customers').textContent = state.customers.length;
    
    const balanceBody = document.getElementById('customer-balances-table');
    balanceBody.innerHTML = '';
    
    const sortedBalances = [...customerBalances.entries()].sort((a, b) => b[1] - a[1]);
    
    if (sortedBalances.length === 0) {
         balanceBody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-gray-400">No customer data.</td></tr>';
         return;
    }
    
    sortedBalances.forEach(([name, balance]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${name}</td>
            <td>${formatCurrency(balance)}</td>
            <td><span class="px-2 py-1 rounded-full text-xs font-medium ${balance > 10000 ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800'}">
                ${balance > 10000 ? 'High' : 'Normal'}
            </span></td>
        `;
        balanceBody.appendChild(row);
    });
}

// --- NEW TRANSACTION LOGIC ---
const transactionForm = document.getElementById('transaction-form');
const tQuantity = document.getElementById('t-quantity');
const tPrice = document.getElementById('t-price');
const tTotal = document.getElementById('t-total');
const tProductName = document.getElementById('t-product-name');

function updateTransactionTotal() {
    const quantity = parseFloat(tQuantity.value) || 0;
    const price = parseFloat(tPrice.value) || 0;
    const total = quantity * price;
    tTotal.value = formatCurrency(total);
}

tQuantity.addEventListener('input', updateTransactionTotal);
tPrice.addEventListener('input', updateTransactionTotal);

tProductName.addEventListener('input', (e) => {
    const productName = e.target.value;
    const product = state.products.find(p => p.name === productName);
    if (product) {
        tPrice.value = product.price;
        updateTransactionTotal();
    }
});

transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newTransaction = {
        id: DB.generateId(),
        date: document.getElementById('t-date').value,
        customer: document.getElementById('t-customer').value.trim(),
        type: document.getElementById('t-type').value,
        productType: document.getElementById('t-product-type').value,
        productName: document.getElementById('t-product-name').value.trim(),
        quantity: parseFloat(tQuantity.value),
        unit: document.getElementById('t-unit').value,
        price: parseFloat(tPrice.value),
        total: (parseFloat(tQuantity.value) * parseFloat(tPrice.value))
    };
    
    state.transactions.unshift(newTransaction);
    await DB.set('transactions', state.transactions);
    
    if (!state.customers.find(c => c.name === newTransaction.customer)) {
        const newCustomer = {
            id: DB.generateId(),
            name: newTransaction.customer,
            phone: ''
        };
        state.customers.push(newCustomer);
        await DB.set('customers', state.customers);
    }
    
    showToast('Transaction saved!', 'success');
    transactionForm.reset();
    document.getElementById('t-date').value = getTodayDate();
    
    showTab('transactions');
});

// --- TRANSACTION LIST / SEARCH LOGIC ---
const filterBtn = document.getElementById('filter-btn');
const resetFilterBtn = document.getElementById('reset-filter-btn');

function renderTransactionTable(transactions) {
    const tableBody = document.getElementById('transaction-table-body');
    const noDataEl = document.getElementById('no-transactions');
    tableBody.innerHTML = '';
    
    if (!transactions || transactions.length === 0) {
        noDataEl.style.display = 'block';
        return;
    }
    
    noDataEl.style.display = 'none';
    
    transactions.forEach(t => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${t.date}</td>
            <td>${t.customer}</td>
            <td>${t.type}</td>
            <td>${t.productType}</td>
            <td>${t.productName}</td>
            <td>${t.quantity}</td>
            <td>${t.unit}</td>
            <td>${formatCurrency(t.price)}</td>
            <td>${formatCurrency(t.total)}</td>
            <td>
                <button class="btn btn-danger btn-delete-transaction" data-id="${t.id}">
                    <svg id="icon-trash" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// REMOVE THE OLD DELETE FUNCTION
// window.deleteTransaction = async (id) => { ... }

filterBtn.addEventListener('click', () => {
    const customerFilter = document.getElementById('f-customer').value.toLowerCase();
    const typeFilter = document.getElementById('f-type').value;
    const productTypeFilter = document.getElementById('f-product-type').value;
    
    const filteredTransactions = state.transactions.filter(t => {
        const customerMatch = t.customer.toLowerCase().includes(customerFilter);
        const typeMatch = !typeFilter || t.type === typeFilter;
        const productTypeMatch = !productTypeFilter || t.productType === productTypeFilter;
        
        return customerMatch && typeMatch && productTypeMatch;
    });
    
    renderTransactionTable(filteredTransactions);
});

resetFilterBtn.addEventListener('click', () => {
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
    
    if (state.customers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-gray-400">No customers saved.</td></tr>';
        return;
    }

    state.customers.forEach(c => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${c.name}</td>
            <td>${c.phone || '-'}</td>
            <td>
                <button class="btn btn-danger btn-delete-customer" data-id="${c.id}">
                    <svg id="icon-trash" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

customerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('c-name').value.trim();
    const phone = document.getElementById('c-phone').value.trim();
    
    if (!name) {
        showToast('Customer name is required.', 'error');
        return;
    }
    
    if (state.customers.find(c => c.name.toLowerCase() === name.toLowerCase())) {
        showToast('A customer with this name already exists.', 'error');
        return;
    }
    
    const newCustomer = {
        id: DB.generateId(),
        name: name,
        phone: phone
    };
    
    state.customers.push(newCustomer);
    await DB.set('customers', state.customers);
    
    renderCustomerTable();
    updateDatalists();
    customerForm.reset();
    showToast('Customer added!', 'success');
});

// REMOVE THE OLD DELETE FUNCTION
// window.deleteCustomer = async (id) => { ... }

// --- PRODUCT MANAGEMENT ---
const productForm = document.getElementById('product-form');

function renderProductTable() {
    const tableBody = document.getElementById('product-table-body');
    tableBody.innerHTML = '';
    
    if (state.products.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-400">No products saved. Import or add them.</td></tr>';
        return;
    }

    state.products.forEach(p => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${p.name}</td>
            <td>${p.type || 'DİĞER'}</td>
            <td>${formatCurrency(p.price)}</td>
            <td>
                <button class="btn btn-danger btn-delete-product" data-id="${p.id}">
                    <svg id="icon-trash" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('p-name').value.trim();
    const type = document.getElementById('p-type').value;
    const price = parseFloat(document.getElementById('p-price').value);
    
    if (!name || !price) {
        showToast('Product name and price are required.', 'error');
        return;
    }
    
    if (state.products.find(p => p.name.toLowerCase() === name.toLowerCase())) {
        showToast('A product with this name already exists.', 'error');
        return;
    }
    
    const newProduct = {
        id: DB.generateId(),
        name: name,
        type: type,
        price: price
    };
    
    state.products.push(newProduct);
    await DB.set('products', state.products);
    
    renderProductTable();
    updateDatalists();
    productForm.reset();
    showToast('Product added!', 'success');
});

// REMOVE THE OLD DELETE FUNCTION
// window.deleteProduct = async (id) => { ... }

// --- AUTOCOMPLETE DATALISTS ---
function updateDatalists() {
    const customerDatalist = document.getElementById('customer-list');
    customerDatalist.innerHTML = '';
    state.customers.forEach(c => {
        const option = document.createElement('option');
        option.value = c.name;
        customerDatalist.appendChild(option);
    });
    
    const productDatalist = document.getElementById('product-list');
    productDatalist.innerHTML = '';
    state.products.forEach(p => {
        const option = document.createElement('option');
        option.value = p.name;
        productDatalist.appendChild(option);
    });
}

// --- INITIALIZE APP ---
async function loadInitialData() {
    const transactionsResult = await DB.get('transactions');
    const customersResult = await DB.get('customers');
    const productsResult = await DB.get('products');

    state.transactions = Array.isArray(transactionsResult) ? transactionsResult : [];
    state.customers = Array.isArray(customersResult) ? customersResult : [];
    state.products = Array.isArray(productsResult) ? productsResult : [];
    
    if (state.transactions.length === 0 && state.products.length === 0) {
        showTab('import');
    } else {
        showTab('dashboard');
    }
    
    updateDatalists();
    renderTransactionTable(state.transactions);
    renderCustomerTable();
    renderProductTable();
    renderDashboard();
}

// --- REPLACE ICON PLACEHOLDERS ---
// This needs to run *after* the main HTML document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // We must wait for Lucide to load from the CDN
    const iconInterval = setInterval(() => {
        if (window.lucide) {
            clearInterval(iconInterval);
            document.querySelectorAll('[id^="icon-"]').forEach(el => {
                const iconName = el.id.replace('icon-', '');
                const iconPascal = iconName.charAt(0).toUpperCase() + iconName.slice(1).replace(/-(\w)/g, (m, g) => g.toUpperCase());
                
                if (window.lucide[iconPascal]) {
                    const svg = window.lucide.createElement(window.lucide[iconPascal]);
                    svg.setAttribute('width', el.getAttribute('width') || '20');
                    svg.setAttribute('height', el.getAttribute('height') || '20');
                    svg.setAttribute('stroke', el.getAttribute('stroke') || 'currentColor');
                    el.parentNode.replaceChild(svg, el);
                }
            });
        }
    }, 100);

    // --- ADD ALL OUR CLICK LISTENERS HERE ---

    // 1. Tab navigation
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            if (tabId) {
                showTab(tabId);
            }
        });
    });

    // 2. Clear Transaction Form button
    document.getElementById('clear-form-btn').addEventListener('click', () => {
        document.getElementById('transaction-form').reset();
        document.getElementById('t-date').value = getTodayDate();
    });

    // 3. Event Delegation for Delete Buttons
    // This one listener handles all clicks inside the transaction table body
    document.getElementById('transaction-table-body').addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.btn-delete-transaction');
        if (deleteButton) {
            const id = deleteButton.getAttribute('data-id');
            if (confirm('Are you sure you want to delete this transaction?')) {
                state.transactions = state.transactions.filter(t => t.id !== id);
                await DB.set('transactions', state.transactions);
                renderTransactionTable(state.transactions);
                showToast('Transaction deleted.', 'success');
            }
        }
    });

    // Customer table
    document.getElementById('customer-table-body').addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.btn-delete-customer');
        if (deleteButton) {
            const id = deleteButton.getAttribute('data-id');
                if (confirm('Are you sure you want to delete this customer? This cannot be undone.')) {
                state.customers = state.customers.filter(c => c.id !== id);
                await DB.set('customers', state.customers);
                renderCustomerTable();
                updateDatalists();
                showToast('Customer deleted.', 'success');
            }
        }
    });

    // Product table
    document.getElementById('product-table-body').addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.btn-delete-product');
        if (deleteButton) {
            const id = deleteButton.getAttribute('data-id');
            if (confirm('Are you sure you want to delete this product?')) {
                state.products = state.products.filter(p => p.id !== id);
                await DB.set('products', state.products);
                renderProductTable();
                updateDatalists();
                showToast('Product deleted.', 'success');
            }
        }
    });

    // Load initial data from JSON files
    loadInitialData();
});


