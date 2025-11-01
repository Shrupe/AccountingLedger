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

// --- UTILITY FUNCTIONS ---

/**
 * Replaces all placeholder icon elements with actual Lucide SVG icons.
 * This needs to be called after any dynamic content is rendered.
 */
function replaceIcons() {
    if (window.lucide) {
        document.querySelectorAll('[id^="icon-"]').forEach(el => {
            const iconName = el.id.replace('icon-', '');
            // Convert kebab-case (e.g., package-plus) to PascalCase (e.g., PackagePlus)
            const iconPascal = iconName.charAt(0).toUpperCase() + iconName.slice(1).replace(/-(\w)/g, (m, g) => g.toUpperCase());
            
            if (window.lucide[iconPascal]) {
                const svg = window.lucide.createElement(window.lucide[iconPascal]);
                
                // Copy all attributes from placeholder (class, width, height, etc.)
                for (const attr of el.attributes) {
                    if (attr.name !== 'id') {
                        svg.setAttribute(attr.name, attr.value);
                    }
                }
                
                // Set default size if not provided
                if (!svg.getAttribute('width')) svg.setAttribute('width', '18');
                if (!svg.getAttribute('height')) svg.setAttribute('height', '18');
                
                // Check if element is still in the DOM before replacing
                if (el.parentNode) {
                    el.parentNode.replaceChild(svg, el);
                }
            } else {
                // console.warn(`Lucide icon not found: ${iconPascal}`);
            }
        });
    }
}

/**
 * Formats a number as Turkish Lira
 */
function formatCurrency(value) {
    if (isNaN(value)) value = 0;
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value);
}

/**
 * Gets today's date in YYYY-MM-DD format
 */
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Shows a toast notification
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    toastMessage.textContent = message;
    
    // Set color
    toast.classList.remove('bg-green-500', 'bg-red-500');
    if (type === 'error') {
        toast.classList.add('bg-red-500');
    } else {
        toast.classList.add('bg-green-500');
    }
    
    // Show toast
    toast.style.transform = 'translateX(0)';
    
    // Hide after 3 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(calc(100% + 2rem))';
    }, 3000);
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
    
    // Refresh data when switching to a tab
    if (tabId === 'dashboard') renderDashboard();
    if (tabId === 'transactions') renderTransactionTable(state.transactions);
    if (tabId === 'customers') renderCustomerTable();
    if (tabId === 'products') renderProductTable();
}

// --- DATA RENDERING ---

/**
 * Loads all initial data from files and renders the dashboard
 */
async function loadInitialData() {
    state.transactions = await DB.get('transactions');
    state.customers = await DB.get('customers');
    state.products = await DB.get('products');
    
    renderDashboard();
    updateDatalists();
    
    // Set default date for new transaction
    document.getElementById('t-date').value = getTodayDate();
    
    // Show import tab if no data
    if (state.transactions.length === 0 && state.products.length === 0) {
        showTab('import');
    }
}

/**
 * Updates the dashboard with current stats
 */
function renderDashboard() {
    let totalTransactions = state.transactions.length;
    let totalCredit = 0;
    let totalSales = 0;
    
    const customerBalances = {};

    state.transactions.forEach(t => {
        if (t.type === 'VERESİYE') {
            totalCredit += t.total;
        } else if (t.type === 'SATIŞ') {
            totalSales += t.total;
        } else if (t.type === 'İKİSİDE') {
            // Assuming 'İKİSİDE' might need different logic, but for now...
            totalSales += t.total; // Or split logic
        }

        // Update customer balances
        if (!customerBalances[t.customer]) {
            customerBalances[t.customer] = 0;
        }
        if (t.type === 'VERESİYE') {
            customerBalances[t.customer] += t.total;
        } else if (t.type === 'SATIŞ') {
            // This might reduce balance if it's a payment?
            // For now, just summing up total spent.
            // customerBalances[t.customer] -= t.total; // Uncomment if SATIŞ is payment
        }
    });

    document.getElementById('total-transactions').textContent = totalTransactions;
    document.getElementById('total-credit').textContent = formatCurrency(totalCredit);
    document.getElementById('total-sales').textContent = formatCurrency(totalSales);
    document.getElementById('total-customers').textContent = state.customers.length;

    // Add Net Balance calculation
    const netBalance = totalSales - totalCredit;
    const netBalanceEl = document.getElementById('net-balance');
    netBalanceEl.textContent = formatCurrency(netBalance);
    // Clear previous color classes
    netBalanceEl.classList.remove('text-red-600', 'text-green-600', 'text-gray-800');
    if (netBalance > 0) {
        netBalanceEl.classList.add('text-green-600'); // More credit than sales
    } else if (netBalance < 0) {
        netBalanceEl.classList.add('text-red-600'); // More sales than credit
    } else {
        netBalanceEl.classList.add('text-gray-800'); // Balanced
    }
    
    const balanceBody = document.getElementById('customer-balances-table');
    balanceBody.innerHTML = ''; // Clear old data
    Object.keys(customerBalances).forEach(customerName => {
        const balance = customerBalances[customerName];
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${customerName}</td>
            <td>${formatCurrency(balance)}</td>
            <td>
                <span class="px-2 py-1 text-xs font-medium rounded-full ${
                    balance > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }">
                    ${balance > 0 ? 'Owes Money' : 'Paid'}
                </span>
            </td>
        `;
        balanceBody.appendChild(row);
    });
}

/**
 * Updates the autocomplete <datalist> for customers and products
 */
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


// --- NEW TRANSACTION FORM ---
const transactionForm = document.getElementById('transaction-form');
const tQuantity = document.getElementById('t-quantity');
const tPrice = document.getElementById('t-price');
const tTotal = document.getElementById('t-total');
const tProductName = document.getElementById('t-product-name');

// Auto-calculate total
function calculateTotal() {
    const quantity = parseFloat(tQuantity.value) || 0;
    const price = parseFloat(tPrice.value) || 0;
    const total = quantity * price;
    tTotal.value = formatCurrency(total);
}
tQuantity.addEventListener('input', calculateTotal);
tPrice.addEventListener('input', calculateTotal);

// Auto-fill price when product is selected
tProductName.addEventListener('change', () => {
    const productName = tProductName.value.trim();
    const product = state.products.find(p => p.name.toLowerCase() === productName.toLowerCase());
    if (product) {
        tPrice.value = product.price;
        calculateTotal();
    }
});

transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const productName = tProductName.value.trim();
    const product = state.products.find(p => p.name.toLowerCase() === productName.toLowerCase());
    
    let price = parseFloat(tPrice.value);
    if (!price && product) {
        price = product.price;
    }

    const total = price * parseFloat(tQuantity.value);
    
    const newTransaction = {
        id: DB.generateId(),
        date: document.getElementById('t-date').value,
        customer: document.getElementById('t-customer').value.trim(),
        type: document.getElementById('t-type').value,
        productType: product ? product.type : 'DİĞER', // Auto-set product type
        productName: productName,
        quantity: parseFloat(tQuantity.value),
        unit: document.getElementById('t-unit').value,
        price: price,
        total: total
    };

    if (!newTransaction.date || !newTransaction.customer || !newTransaction.productName || !newTransaction.quantity || !newTransaction.price) {
        showToast('Please fill in all required fields (Date, Customer, Product, Quantity, Price).', 'error');
        return;
    }

    state.transactions.push(newTransaction);
    const saved = await DB.set('transactions', state.transactions);

    if (saved) {
        showToast('Transaction saved!', 'success');
        transactionForm.reset();
        document.getElementById('t-date').value = getTodayDate(); // Reset date
        renderDashboard(); // Update dashboard
        renderTransactionTable(state.transactions); // Update search table
    } else {
        showToast('Failed to save transaction.', 'error');
        // Rollback state if save failed
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
            <td class="flex gap-2">
                <button class="btn btn-danger btn-delete-transaction" data-id="${t.id}">
                    <svg id="icon-trash" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Replace icons after rendering
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
    state.customers.forEach(c => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${c.name}</td>
            <td>${c.phone || '-'}</td>
            <td class="flex gap-2">
                <button class="btn btn-danger btn-delete-customer" data-id="${c.id}">
                    <svg id="icon-trash" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Replace icons after rendering
    replaceIcons();
}

customerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('c-name').value.trim();
    const phone = document.getElementById('c-phone').value.trim();
    
    if (!name) {
        showToast('Customer name is required.', 'error');
        return;
    }
    
    const newCustomer = { id: DB.generateId(), name, phone };
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
            <td>${formatCurrency(p.price)}</td>
            <td class="flex gap-2">
                <button class="btn btn-secondary btn-edit-product" data-id="${p.id}">
                    <svg id="icon-edit" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn btn-danger btn-delete-product" data-id="${p.id}">
                    <svg id="icon-trash" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Replace icons after rendering
    replaceIcons();
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
    
    const newProduct = { id: DB.generateId(), name, type, price };
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
            price: parseFloat(row['FİYAT']) || 0, // Assuming price isn't in this CSV
            total: parseFloat(row['TOPLAM']) || 0 // Assuming total isn't in this CSV
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
            price: parseFloat(row['FİYAT']) || 0
        })).filter(p => p.price > 0 && p.name !== 'Bilinmeyen Ürün'); // Filter out bad data
    } catch (e) {
        showToast(`Error parsing products: ${e.message}`, 'error');
        return;
    }
    
    // Save to state and DB
    state.transactions = importedTransactions;
    state.products = importedProducts;
    
    // Also extract customers from transactions
    const customerNames = new Set(importedTransactions.map(t => t.customer));
    state.customers = [...customerNames].map(name => ({ id: DB.generateId(), name, phone: '' }));
    
    await DB.set('transactions', state.transactions);
    await DB.set('products', state.products);
    await DB.set('customers', state.customers);
    
    showToast('Data imported successfully!', 'success');
    loadInitialData(); // Reload all data from files
    showTab('dashboard'); // Switch to dashboard
});


// --- GLOBAL EVENT LISTENERS ---
// This needs to run *after* the main HTML document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // We must wait for Lucide to load from the CDN
    const iconInterval = setInterval(() => {
        if (window.lucide) {
            clearInterval(iconInterval);
            replaceIcons(); // Initial icon replacement
        }
    }, 100);

    // --- Tab navigation
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            if (tabId) {
                showTab(tabId);
            }
        });
    });

    // --- Clear Transaction Form button
    document.getElementById('clear-form-btn').addEventListener('click', () => {
        document.getElementById('transaction-form').reset();
        document.getElementById('t-date').value = getTodayDate();
    });

    // --- Event Delegation for Delete Buttons ---
    
    // Transaction table
    document.getElementById('transaction-table-body').addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.btn-delete-transaction');
        if (deleteButton) {
            const id = deleteButton.getAttribute('data-id');
            if (confirm('Are you sure you want to delete this transaction?')) {
                state.transactions = state.transactions.filter(t => t.id !== id);
                await DB.set('transactions', state.transactions);
                renderTransactionTable(state.transactions);
                renderDashboard(); // Update dashboard
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
                renderDashboard(); // Update dashboard
                showToast('Customer deleted.', 'success');
            }
        }
    });

    // Product table (Handles Edit AND Delete)
    document.getElementById('product-table-body').addEventListener('click', async (e) => {
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
            return; // Stop further execution
        }
        
        // Check for edit
        const editButton = e.target.closest('.btn-edit-product');
        if (editButton) {
            const id = editButton.getAttribute('data-id');
            const product = state.products.find(p => p.id === id);
            if (product) {
                document.getElementById('edit-p-id').value = product.id;
                document.getElementById('edit-p-name').value = product.name;
                document.getElementById('edit-p-type').value = product.type;
                document.getElementById('edit-p-price').value = product.price;
                document.getElementById('edit-product-modal').style.display = 'flex';
            }
        }
    });


    // --- Product Edit Modal Listeners ---
    const editModal = document.getElementById('edit-product-modal');
    const editForm = document.getElementById('edit-product-form');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    // Close modal
    cancelEditBtn.addEventListener('click', () => {
        editModal.style.display = 'none';
    });

    // Save changes from modal
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-p-id').value;
        const updatedProduct = {
            id: id,
            name: document.getElementById('edit-p-name').value.trim(),
            type: document.getElementById('edit-p-type').value,
            price: parseFloat(document.getElementById('edit-p-price').value)
        };

        if (!updatedProduct.name || updatedProduct.price < 0) {
            showToast('Invalid product name or price.', 'error');
            return;
        }

        state.products = state.products.map(p => p.id === id ? updatedProduct : p);
        await DB.set('products', state.products);

        renderProductTable();
        updateDatalists();
        editModal.style.display = 'none';
        showToast('Product updated!', 'success');
    });


    // Load initial data from JSON files
    loadInitialData();
});

