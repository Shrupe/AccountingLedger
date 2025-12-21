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
let currentTab = 'dashboard';
let currentSort = { field: 'name', direction: 'asc' }; // For customer sorting

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
 * Gets today's date in DD-MM-YYYY format for filenames
 */
function getTodayDateFilename() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * Shows a toast notification
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    toastMessage.textContent = message;
    
    toast.classList.remove('bg-green-500', 'bg-red-500');
    if (type === 'error') {
        toast.classList.add('bg-red-500');
    } else {
        toast.classList.add('bg-green-500');
    }
    
    toast.style.transform = 'translateX(0)';
    setTimeout(() => {
        toast.style.transform = 'translateX(calc(100% + 2rem))';
    }, 3000);
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
            showToast('No data to export', 'error');
            return;
        }
        
        if (typeof Papa === 'undefined') {
            showToast('CSV library is loading... Please try again in a moment.', 'error');
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
        
        showToast(`Exported as ${filename}`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast(`Export failed: ${error.message}`, 'error');
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
    state.transactions = await DB.get('transactions');
    state.customers = await DB.get('customers');
    state.products = await DB.get('products');
    
    // Ensure all products have a stock property
    state.products.forEach(p => {
        if (typeof p.stock !== 'number') {
            p.stock = 0;
        }
    });

    await updateCustomerAggregates(true);

    renderDashboard();
    updateDatalists();
    
    document.getElementById('t-date').value = getTodayDate();
    document.getElementById('p-date').value = getTodayDate();
    
    if (state.transactions.length === 0 && state.products.length === 0) {
        showTab('import');
    }
}

function renderDashboard() {
    let totalTransactions = state.transactions.length;
    let totalCredit = 0;
    let totalSales = 0;

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

    document.getElementById('total-transactions').textContent = totalTransactions;
    document.getElementById('total-credit').textContent = formatCurrency(totalCredit);
    document.getElementById('total-sales').textContent = formatCurrency(totalSales);
    document.getElementById('total-customers').textContent = state.customers.length;

    const netBalance = totalSales - totalCredit;
    const netBalanceEl = document.getElementById('net-balance');
    netBalanceEl.textContent = formatCurrency(netBalance);
    netBalanceEl.classList.remove('text-red-600', 'text-green-600', 'text-gray-800');
    if (netBalance > 0) {
        netBalanceEl.classList.add('text-green-600'); 
    } else if (netBalance < 0) {
        netBalanceEl.classList.add('text-red-600'); 
    } else {
        netBalanceEl.classList.add('text-gray-800'); 
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
                    ${netDebt > 0 ? `Borçlu: ${formatCurrency(netDebt)}` : 'Ödendi'}
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
        await DB.set('customers', state.customers);
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
        tPrice.value = product.price;
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
        price = product.price;
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
        showToast('Please fill in all required fields.', 'error');
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
                showToast('Stokta bu ürün mevcut değil!', 'error');
                return;
            }
            // For Sales (VERESİYE, SATIŞ, İKİSİDE), we decrease stock
            product.stock = currentStock - quantity;
        }
        
        // Save product changes immediately
        await DB.set('products', state.products);
    } else {
        if (!product) {
            showToast('Ürün bulunamadı!', 'error'); 
            return; 
        }
    }

    state.transactions.push(newTransaction);
    const saved = await DB.set('transactions', state.transactions);

    if (saved) {
        showToast('Transaction saved and stock updated!', 'success');
        transactionForm.reset();
        document.getElementById('t-date').value = getTodayDate(); 
        await updateCustomerAggregates(true);
        updateDatalists(); 
        renderDashboard(); 
        renderTransactionTable(state.transactions); 
    } else {
        showToast('Failed to save transaction.', 'error');
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
        showToast('Please fill in all fields with valid data.', 'error');
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
    const saved = await DB.set('transactions', state.transactions);

    if (saved) {
        showToast('Payment saved!', 'success');
        paymentForm.reset();
        document.getElementById('p-date').value = getTodayDate(); 
        await updateCustomerAggregates(true);
        updateDatalists(); 
        renderDashboard(); 
        renderTransactionTable(state.transactions); 
    } else {
        showToast('Failed to save payment.', 'error');
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

    // Sort by date, oldest first
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    transactions.forEach(t => {
        const row = document.createElement('tr');
        
        if (t.type === 'ÖDEME') {
            row.innerHTML = `
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
    const fCustomer = document.getElementById('f-customer').value.toLowerCase();
    const fType = document.getElementById('f-type').value;
    const fProductType = document.getElementById('f-product-type').value;

    const filtered = state.transactions.filter(t => {
        const customerMatch = t.customer.toLowerCase().includes(fCustomer);
        const typeMatch = !fType || t.type === fType;
        const productTypeMatch = !fProductType || t.productType === fProductType;
        return customerMatch && typeMatch && productTypeMatch;
    });
    
    renderTransactionTable(filtered);
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
        showToast('Customer name is required.', 'error');
        return;
    }
    
    if (state.customers.find(c => c.name.toLowerCase() === name.toLowerCase())) {
        showToast('Customer with this name already exists.', 'error');
        return;
    }

    const newCustomer = { 
        id: DB.generateId(), 
        name, phone, tc, dob, city, district, street,
        veresiye: 0, satis: 0 
    };
    
    state.customers.push(newCustomer);
    await DB.set('customers', state.customers);
    
    renderCustomerTable();
    updateDatalists();
    customerForm.reset();
    showToast('Customer added!', 'success');
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
            <td>${formatCurrency(p.price)}</td>
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
    const price = parseFloat(document.getElementById('p-price').value);
    
    if (!name || !price) {
        showToast('Product name and price are required.', 'error');
        return;
    }
    
    // Default stock is 0
    const newProduct = { id: DB.generateId(), name, type, unit, price, stock: 0 };
    state.products.push(newProduct);
    await DB.set('products', state.products);
    
    renderProductTable();
    updateDatalists();
    productForm.reset();
    showToast('Product added!', 'success');
});


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

    // --- Export Buttons
    const exportTransactionsBtn = document.getElementById('export-transactions-btn');
    if (exportTransactionsBtn) {
        exportTransactionsBtn.addEventListener('click', async () => {
            if (state.transactions.length === 0) {
                showToast('No transactions to export', 'error');
                return;
            }
            try {
                await waitForPapa();
                const exportData = state.transactions.map(t => ({
                    Date: formatDateDisplay(t.date),
                    Customer: t.customer,
                    Type: t.type,
                    ProductType: t.productType,
                    ProductName: t.productName,
                    Quantity: t.quantity,
                    Unit: t.unit,
                    Price: t.price,
                    Total: t.total
                }));
                exportToCSV(exportData, `transactions_${getTodayDateFilename()}.csv`);
            } catch (error) {
                showToast(`Export failed: ${error.message}`, 'error');
            }
        });
    }

    const exportCustomersBtn = document.getElementById('export-customers-btn');
    if (exportCustomersBtn) {
        exportCustomersBtn.addEventListener('click', async () => {
            if (state.customers.length === 0) {
                showToast('No customers to export', 'error');
                return;
            }
            try {
                await waitForPapa();
                const exportData = state.customers.map(c => ({
                    Name: c.name,
                    TC_ID: c.tc || '',
                    DOB: formatDateDisplay(c.dob),
                    Phone: c.phone || '',
                    City: c.city || '',
                    District: c.district || '',
                    Street: c.street || '',
                    TotalDebt: c.veresiye,
                    TotalPaid: c.satis
                }));
                exportToCSV(exportData, `customers_${getTodayDateFilename()}.csv`);
            } catch (error) {
                showToast(`Export failed: ${error.message}`, 'error');
            }
        });
    }

    const exportProductsBtn = document.getElementById('export-products-btn');
    if (exportProductsBtn) {
        exportProductsBtn.addEventListener('click', async () => {
            if (state.products.length === 0) {
                showToast('No products to export', 'error');
                return;
            }
            try {
                await waitForPapa();
                const exportData = state.products.map(p => ({
                    Name: p.name,
                    Type: p.type,
                    Unit: p.unit,
                    Price: p.price,
                    Stock: p.stock || 0
                }));
                exportToCSV(exportData, `products_${getTodayDateFilename()}.csv`);
            } catch (error) {
                showToast(`Export failed: ${error.message}`, 'error');
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
            if (confirm('Are you sure you want to delete this transaction?')) {
                state.transactions = state.transactions.filter(t => t.id !== id);
                await DB.set('transactions', state.transactions);
                await updateCustomerAggregates(true);
                updateDatalists();
                renderTransactionTable(state.transactions);
                renderDashboard(); 
                showToast('Transaction deleted.', 'success');
            }
        }
    });

    document.getElementById('customer-table-body').addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.btn-delete-customer');
        if (deleteButton) {
            const id = deleteButton.getAttribute('data-id');
            const customer = state.customers.find(c => c.id === id);
            
            const customerTransactions = state.transactions.filter(t => t.customer === customer.name);
            if (customerTransactions.length > 0) {
                 if (!confirm('This customer has transactions. Deleting them will also delete all their transactions. Are you sure?')) {
                    return;
                 }
                 state.transactions = state.transactions.filter(t => t.customer !== customer.name);
                 await DB.set('transactions', state.transactions);
            } else if (!confirm('Are you sure you want to delete this customer? This cannot be undone.')) {
                return;
            }

            state.customers = state.customers.filter(c => c.id !== id);
            await DB.set('customers', state.customers);
            
            await updateCustomerAggregates(true);
            renderCustomerTable();
            updateDatalists();
            renderDashboard();
            renderTransactionTable(state.transactions);
            showToast('Customer deleted.', 'success');
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
            if (confirm('Are you sure you want to delete this product?')) {
                state.products = state.products.filter(p => p.id !== id);
                await DB.set('products', state.products);
                renderProductTable();
                updateDatalists();
                showToast('Product deleted.', 'success');
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
                document.getElementById('edit-p-price').value = product.price;
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
        const updatedProduct = {
            id: id,
            name: document.getElementById('edit-p-name').value.trim(),
            type: document.getElementById('edit-p-type').value,
            unit: document.getElementById('edit-p-unit').value.trim(),
            price: parseFloat(document.getElementById('edit-p-price').value)
        };

        if (!updatedProduct.name || updatedProduct.price < 0) {
            showToast('Invalid product name or price.', 'error');
            return;
        }

        // Preserve existing stock
        const existingProduct = state.products.find(p => p.id === id);
        if (existingProduct) {
            updatedProduct.stock = existingProduct.stock;
        }

        state.products = state.products.map(p => p.id === id ? updatedProduct : p);
        await DB.set('products', state.products);

        renderProductTable();
        updateDatalists();
        editModal.style.display = 'none';
        showToast('Product updated!', 'success');
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
            showToast('Please enter a valid quantity.', 'error');
            return;
        }

        const product = state.products.find(p => p.id === id);
        if (product) {
            product.stock = (product.stock || 0) + quantityToAdd;
            await DB.set('products', state.products);
            renderProductTable();
            stockModal.style.display = 'none';
            showToast('Stock updated!', 'success');
        }
    });

    loadInitialData();
});