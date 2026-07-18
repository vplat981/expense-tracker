const API_URL = 'http://localhost:5000/api'; // Change to your Render URL

let currentUser = null;

// Check if user is logged in
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname.includes('dashboard.html')) {
        checkAuth();
        loadExpenses();
        loadDailySummary();
        setupDateField();
    }
});

function switchTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabs = document.querySelectorAll('.tab-btn');
    
    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    }
}

// Login
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Login successful! Redirecting...', 'success');
            localStorage.setItem('user', JSON.stringify(data.user));
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } else {
            showMessage(data.message || 'Login failed', 'error');
        }
    } catch (error) {
        showMessage('Error connecting to server', 'error');
    }
});

// Register
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    if (password !== confirmPassword) {
        showMessage('Passwords do not match', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Registration successful! Please login.', 'success');
            switchTab('login');
            document.getElementById('loginEmail').value = email;
        } else {
            showMessage(data.message || 'Registration failed', 'error');
        }
    } catch (error) {
        showMessage('Error connecting to server', 'error');
    }
});

function showMessage(message, type) {
    const msgDiv = document.getElementById('message');
    msgDiv.textContent = message;
    msgDiv.className = `message ${type}`;
    msgDiv.style.display = 'block';
    
    setTimeout(() => {
        msgDiv.style.display = 'none';
    }, 5000);
}

// Dashboard Functions
function checkAuth() {
    const user = localStorage.getItem('user');
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = JSON.parse(user);
    document.getElementById('userEmail').textContent = currentUser;
}

function logout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

function setupDateField() {
    const dateInput = document.getElementById('expenseDate');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }
}

// Add Expense
document.getElementById('expenseForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const description = document.getElementById('expenseDescription').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const category = document.getElementById('expenseCategory').value;
    const date = document.getElementById('expenseDate').value;
    
    try {
        const response = await fetch(`${API_URL}/expenses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ description, amount, category, date })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('expenseForm').reset();
            setupDateField();
            loadExpenses();
            loadDailySummary();
            showMessage('Expense added successfully!', 'success');
        } else {
            showMessage(data.message || 'Failed to add expense', 'error');
        }
    } catch (error) {
        showMessage('Error connecting to server', 'error');
    }
});

// Load Expenses
async function loadExpenses() {
    try {
        const response = await fetch(`${API_URL}/expenses`);
        const data = await response.json();
        
        if (data.success) {
            displayExpenses(data.data);
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
    }
}

function displayExpenses(expenses) {
    const container = document.getElementById('expensesList');
    container.innerHTML = '';
    
    if (expenses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">No expenses yet</p>';
        return;
    }
    
    expenses.slice(0, 10).forEach(expense => {
        const div = document.createElement('div');
        div.className = 'expense-item';
        div.innerHTML = `
            <div class="expense-info">
                <span class="expense-description">${expense.description}</span>
                <span class="expense-details">${expense.category} • ${new Date(expense.date).toLocaleDateString()}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <span class="expense-amount">$${expense.amount.toFixed(2)}</span>
                <button onclick="deleteExpense('${expense.id}')" class="delete-btn">Delete</button>
            </div>
        `;
        container.appendChild(div);
    });
}

// Delete Expense
async function deleteExpense(id) {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    
    try {
        const response = await fetch(`${API_URL}/expenses/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadExpenses();
            loadDailySummary();
            showMessage('Expense deleted successfully', 'success');
        }
    } catch (error) {
        showMessage('Error deleting expense', 'error');
    }
}

// Load Daily Summary
async function loadDailySummary() {
    try {
        const response = await fetch(`${API_URL}/daily-summary`);
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('todayTotal').textContent = `$${data.data.total.toFixed(2)}`;
            document.getElementById('todayCount').textContent = data.data.count;
            
            // Update chart
            updateChart(data.data.categories);
            
            // Load month total (simplified)
            loadMonthTotal();
        }
    } catch (error) {
        console.error('Error loading summary:', error);
    }
}

async function loadMonthTotal() {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        const response = await fetch(`${API_URL}/expenses`);
        const data = await response.json();
        
        if (data.success) {
            const monthTotal = data.data
                .filter(exp => new Date(exp.date) >= startOfMonth && new Date(exp.date) <= endOfMonth)
                .reduce((sum, exp) => sum + exp.amount, 0);
            
            document.getElementById('monthTotal').textContent = `$${monthTotal.toFixed(2)}`;
        }
    } catch (error) {
        console.error('Error loading month total:', error);
    }
}

// Chart
let chartInstance = null;

function updateChart(categories) {
    const ctx = document.getElementById('categoryChart')?.getContext('2d');
    if (!ctx) return;
    
    const colors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
        '#9966FF', '#FF9F40', '#FF6384'
    ];
    
    const labels = Object.keys(categories);
    const data = Object.values(categories);
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Receipt Scanner
async function scanReceipt() {
    const fileInput = document.getElementById('receiptImage');
    const resultsDiv = document.getElementById('scanResults');
    
    if (!fileInput.files || !fileInput.files[0]) {
        alert('Please select an image first');
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            resultsDiv.innerHTML = 'Scanning receipt with AI...';
            resultsDiv.className = 'scan-results visible';
            
            const imageData = e.target.result;
            
            const response = await fetch(`${API_URL}/analyze-receipt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ image_data: imageData })
            });
            
            const data = await response.json();
            
            if (data.success) {
                const result = data.data;
                resultsDiv.innerHTML = `
                    <h5>Receipt Analysis Results:</h5>
                    <p><strong>Total:</strong> $${result.total || 'N/A'}</p>
                    <p><strong>Store:</strong> ${result.store || 'N/A'}</p>
                    <p><strong>Date:</strong> ${result.date || 'N/A'}</p>
                    <p><strong>Category:</strong> ${result.category || 'Other'}</p>
                    <p><strong>Items:</strong> ${result.items ? result.items.join(', ') : 'N/A'}</p>
                    <button onclick="addScannedExpense(${JSON.stringify(result).replace(/"/g, '&quot;')})" 
                            class="btn-primary" style="margin-top: 10px;">
                        Add This Expense
                    </button>
                `;
            } else {
                resultsDiv.innerHTML = `<p style="color: red;">Error: ${data.message}</p>`;
            }
        } catch (error) {
            resultsDiv.innerHTML = `<p style="color: red;">Error scanning receipt: ${error.message}</p>`;
        }
    };
    
    reader.readAsDataURL(file);
}

function addScannedExpense(result) {
    document.getElementById('expenseDescription').value = 
        result.items ? result.items.join(', ') : 'Receipt purchase';
    document
