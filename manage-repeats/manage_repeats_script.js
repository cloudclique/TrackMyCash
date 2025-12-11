// manage_repeats_script.js

import { 
    repeatingEntries, 
    deleteRepeat, 
    updateRepeatField, 
    escapeHtml,
    updateCategoryList,
    onAuthStateChanged,
    loadData,
    auth,
    userSignOut // Import sign out to be available on this page
} from './app.js';

// Expose functions for inline HTML event handlers
window.deleteRepeat = deleteRepeat;
window.updateRepeatField = updateRepeatField;
window.escapeHtml = escapeHtml; 
window.userSignOut = userSignOut;

/**
 * Builds and renders the editable table for repeating entries on the management page.
 */
function renderManageRepeatsTable(){
    const tbody = document.getElementById('manageRepeatsBody');
    if (!tbody) return; 

    tbody.innerHTML = '';

    // Sort entries by start date for predictable order
    repeatingEntries.sort((a, b) => a.start.localeCompare(b.start));

    repeatingEntries.forEach(r => { 
        const tr = document.createElement('tr');
        
        // 1. Type Select
        const typeSelectHtml = `
            <select onchange="updateRepeatField('${r.id}', 'type', this.value)">
                <option value="income" ${r.type === 'income' ? 'selected' : ''}>income</option>
                <option value="expense" ${r.type === 'expense' ? 'selected' : ''}>expense</option>
            </select>
        `;

        // 2. Frequency Select (using saved value or default 'months')
        const currentFrequency = r.frequency || 'months'; 
        const frequencySelectHtml = `
            <select onchange="updateRepeatField('${r.id}', 'frequency', this.value)">
                <option value="days" ${currentFrequency === 'days' ? 'selected' : ''}>Day(s)</option>
                <option value="weeks" ${currentFrequency === 'weeks' ? 'selected' : ''}>Week(s)</option>
                <option value="months" ${currentFrequency === 'months' ? 'selected' : ''}>Month(s)</option> 
                <option value="years" ${currentFrequency === 'years' ? 'selected' : ''}>Year(s)</option>
            </select>
        `;

        // 3. Assemble Row
        tr.innerHTML = `
            <td>${typeSelectHtml}</td>
            <td><input type="text" value="${escapeHtml(r.reason||'')}" onchange="updateRepeatField('${r.id}', 'reason', this.value)"></td>
            <td><input type="number" step="0.01" value="${r.amount}" onchange="updateRepeatField('${r.id}', 'amount', this.value)"></td>
            <td><input list="categoryList" type="text" value="${escapeHtml(r.category||'')}" onchange="updateRepeatField('${r.id}', 'category', this.value)"></td>
            
            <td><input type="number" value="${r.interval||1}" min="1" onchange="updateRepeatField('${r.id}', 'interval', this.value)"></td>
            <td>${frequencySelectHtml}</td>

            <td><input type="date" value="${r.start}" onchange="updateRepeatField('${r.id}', 'start', this.value)"></td>
            <td><input type="date" value="${r.end||''}" onchange="updateRepeatField('${r.id}', 'end', this.value||null)"></td>
            <td><button onclick="deleteRepeat('${r.id}')">Delete</button></td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Checks authentication status and initializes the page.
 */
function initManageRepeatsPage() {
    
    // Listen for auth changes to update the UI and load data
    onAuthStateChanged(auth, (user) => {
        const authStatusDiv = document.getElementById('authStatus');
        
        // 1. Update the Auth Status UI
        if (user) {
            authStatusDiv.innerHTML = `
                <p style="margin-bottom:5px; font-size:0.9em;">User: **${user.email}**</p>
                <button onclick="userSignOut()">Sign Out</button>
            `;
        } else {
            authStatusDiv.innerHTML = `
                
            `;
        }
        
        // 2. Load Data and Render Table
        loadData().then(() => {
            renderManageRepeatsTable();
            updateCategoryList();
        });
    });
}

// Initialize the page script
initManageRepeatsPage();