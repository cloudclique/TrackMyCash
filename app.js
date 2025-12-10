/* ---------------------------------------------------------------------- */
/* --- 1. FIREBASE SETUP & IMPORTS -------------------------------------- */
/* ---------------------------------------------------------------------- */

import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

// NOTE: Replace this placeholder config with your actual Firebase project config.
const firebaseConfig = {
  apiKey: "AIzaSyC76V6iCBNNAwDQI2i7IuQKWSSAOuPC-eA",
  authDomain: "budgettracker-260e6.firebaseapp.com",
  projectId: "budgettracker-260e6",
  storageBucket: "budgettracker-260e6.firebasestorage.app",
  messagingSenderId: "583347664104",
  appId: "1:583347664104:web:8372c2d4debd2460fe855d",
  measurementId: "G-Z7VET0VF3S"
};

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------------------------------------------------------------------- */
/* --- 2. GLOBAL STATE & INITIALIZATION --------------------------------- */
/* ---------------------------------------------------------------------- */

let entries = [];
let repeatingEntries = [];
let editIndex = null;
let actionIndex = null; 
let currency = "$";
let selectedMonth = null;
let chart = null;
let monthlyChart = null;
const today = new Date();
let currentUser = null; 

selectedMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;

/* ---------------------------------------------------------------------- */
/* --- 3. FIREBASE AUTHENTICATION FUNCTIONS (EMAIL/PASS) ---------------- */
/* ---------------------------------------------------------------------- */

function openAuthModal() { 
    document.getElementById('authModal').style.display = 'flex'; 
    document.getElementById('authEmail').value = '';
    document.getElementById('authPassword').value = '';
}
function closeAuthModal() { 
    document.getElementById('authModal').style.display = 'none'; 
}

async function handleAuthAction(action) {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;

    if (!email || !password || password.length < 6) {
        alert("Please enter a valid email and a password of at least 6 characters.");
        return;
    }

    try {
        if (action === 'login') {
            await signInWithEmailAndPassword(auth, email, password);
            alert("Login successful!");
        } else if (action === 'signup') {
            await createUserWithEmailAndPassword(auth, email, password);
            alert("Account created and logged in!");
        }
        closeAuthModal();
    } catch (error) {
        let message = "An authentication error occurred.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            message = "Invalid email or password.";
        } else if (error.code === 'auth/email-already-in-use') {
            message = "This email is already registered. Please log in.";
        } else {
            console.error("Auth error:", error);
            message = `Error: ${error.message}`;
        }
        alert(message);
    }
}

async function userSignOut() {
    if (!confirm('Are you sure you want to sign out? Data will be cleared from view.')) return;
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Sign-out error:", error);
    }
}

/* ---------------------------------------------------------------------- */
/* --- 4. DATA MANAGEMENT (Load/Save/Priority) -------------------------- */
/* ---------------------------------------------------------------------- */

/**
 * Loads data: Firestore (if logged in) > Local Storage > Default
 */
async function loadData() {
  // 1. Load from Local Storage (as cache/fallback)
  const localSaved = localStorage.getItem('budgetEntries');
  const localRepeats = localStorage.getItem('budgetRepeats');
  
  if (localSaved) {
    const saved = JSON.parse(localSaved);
    entries = saved.entries || [];
    currency = saved.currency || "$";
    document.getElementById('currency').value = currency;
  }
  if (localRepeats) {
    repeatingEntries = JSON.parse(localRepeats);
  }

  // 2. Override with Firestore data if logged in
  if (currentUser) {
    const docRef = doc(db, "budgets", currentUser.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const firestoreData = docSnap.data();
      entries = firestoreData.entries || [];
      repeatingEntries = firestoreData.repeatingEntries || [];
      currency = firestoreData.currency || "$";
      document.getElementById('currency').value = currency;
      
      // Update local storage with fresh data from Firestore
      localStorage.setItem('budgetEntries', JSON.stringify({ entries, currency }));
      localStorage.setItem('budgetRepeats', JSON.stringify(repeatingEntries));
      
      console.log("Data loaded from Firestore.");
    } else {
      console.log("No budget data found in Firestore for this user. Using local data.");
      // If no Firestore data, save existing local data to Firestore to initialize the document
      saveData();
      saveRepeats();
    }
  }
  
  // 3. Render
  renderEntries();
}

/**
 * Saves entries and currency: Firestore > Local Storage
 */
function saveData(){
  // Local storage (browser saved files)
  localStorage.setItem('budgetEntries', JSON.stringify({ entries, currency }));

  // Firestore (highest priority)
  if (currentUser) {
    const userId = currentUser.uid;
    const docRef = doc(db, "budgets", userId);

    setDoc(docRef, { 
      entries: entries, 
      currency: currency,
      lastUpdated: new Date().toISOString()
    }, { merge: true }) 
    .catch(error => console.error("Error writing entries to Firestore:", error));
  }
}

/**
 * Saves repeating entries: Firestore > Local Storage
 */
function saveRepeats(){
  // Local storage (browser saved files)
  localStorage.setItem('budgetRepeats', JSON.stringify(repeatingEntries));

  // Firestore (highest priority)
  if (currentUser) {
    const userId = currentUser.uid;
    const docRef = doc(db, "budgets", userId);
    
    setDoc(docRef, { 
      repeatingEntries: repeatingEntries,
      lastUpdated: new Date().toISOString()
    }, { merge: true }) 
    .catch(error => console.error("Error writing repeats to Firestore:", error));
  }
}

// Global listener for auth state changes (main entry point for data flow)
onAuthStateChanged(auth, async (user) => {
  const authStatusDiv = document.getElementById('authStatus');
  
  if (user) {
    // User is signed in.
    currentUser = user;
    authStatusDiv.innerHTML = `
      <p style="margin-bottom:5px; font-size:0.9em;">User: **${user.email}**</p>
      <button onclick="openSettingsModal()"><i class="bi bi-gear-fill"></i></button>
      <button onclick="userSignOut()">Sign Out</button>
    `;
  } else {
    // User is signed out.
    currentUser = null;
    authStatusDiv.innerHTML = `
      <button onclick="openSettingsModal()"><i class="bi bi-gear-fill"></i></button>
      <button onclick="openAuthModal()" id="mainLoginBtn">Login / Sign Up</button>
    `;
    
    // Clear in-memory data on sign-out to show only local data (or default empty)
    entries = [];
    repeatingEntries = [];
    
    // If local storage has a currency setting, maintain that
    const localSaved = localStorage.getItem('budgetEntries');
    if (localSaved) {
        currency = JSON.parse(localSaved).currency;
    } else {
        currency = "$";
    }
    document.getElementById('currency').value = currency;
  }
  
  // Load data corresponding to the current state (logged in or logged out)
  await loadData();
});

/* ---------------------------------------------------------------------- */
/* --- 5. EXISTING BUDGET TRACKER FUNCTIONS ----------------------------- */
/* ---------------------------------------------------------------------- */

/* --- Action Modal Functions (NEW) --- */

function openActionModal(index) {
    actionIndex = index;
    const modal = document.getElementById('actionModal');
    const reasonP = document.getElementById('actionModalReason');

    if (index === null || index < 0 || index >= entries.length) {
        alert("Error: Invalid entry selected.");
        return;
    }
    
    const entry = entries[index];
    
    reasonP.innerText = `${entry.reason || 'No Description'}`;
    modal.style.display = 'flex';
}

function closeActionModal() {
    document.getElementById('actionModal').style.display = 'none';
    actionIndex = null; // Clear the selected entry index
}

function handleActionClick(actionType) {
    if (actionIndex === null) return;
    
    if (actionType === 'edit') {
        closeActionModal();
        // The existing openModal handles editing when the index is provided
        openModal(true, actionIndex); 
    } else if (actionType === 'delete') {
        closeActionModal();
        // The existing deleteEntry handles the deletion
        deleteEntry(actionIndex); 
    }
}

/* --- Basic entry functions --- */
function changeCurrency(){
  currency = document.getElementById('currency').value;
  saveData();
  renderEntries();
}

function openModal(edit=false, index=null){
  document.getElementById('entryModal').style.display = 'flex';
  if(edit && index!==null){
    editIndex = index;
    const e = entries[index];
    document.getElementById('modalTitle').innerText = 'Edit Entry';
    document.getElementById('type').value = e.type;
    document.getElementById('reason').value = e.reason;
    document.getElementById('amount').value = e.amount;
    document.getElementById('category').value = e.category;
    document.getElementById('date').value = e.date;
  } else {
    editIndex = null;
    document.getElementById('modalTitle').innerText = 'New Entry';
    clearInputs();
  }
}
function closeModal(){ document.getElementById('entryModal').style.display = 'none'; }

function saveEntry(){
  const type = document.getElementById('type').value;
  const reason = document.getElementById('reason').value.trim();
  const amount = parseFloat(document.getElementById('amount').value);
  const category = document.getElementById('category').value.trim();
  let date = document.getElementById('date').value;

  if(!amount || amount <= 0){ alert('Amount required and > 0'); return; }
  if(!date){
    const d = new Date();
    date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  const entry = { type, reason, amount, category, date };

  if(editIndex !== null) entries[editIndex] = entry;
  else entries.push(entry);

  saveData();
  renderEntries();
  closeModal();
  clearInputs();
}

/* --- Repeating entries: add, save --- */
function openRepeatModal(){ document.getElementById('repeatModal').style.display='flex'; resetRepeatInputs(); }
function closeRepeatModal(){ document.getElementById('repeatModal').style.display='none'; }

function resetRepeatInputs(){
  document.getElementById('repeatType').value = 'income';
  document.getElementById('repeatReason').value = '';
  document.getElementById('repeatAmount').value = '';
  document.getElementById('repeatCategory').value = '';
  document.getElementById('repeatStartDate').value = '';
  document.getElementById('repeatEndDate').value = '';
}

function saveRepeatEntry(){
  const type = document.getElementById('repeatType').value;
  const reason = document.getElementById('repeatReason').value.trim();
  const amount = parseFloat(document.getElementById('repeatAmount').value);
  const category = document.getElementById('repeatCategory').value.trim();
  const start = document.getElementById('repeatStartDate').value;
  const end = document.getElementById('repeatEndDate').value || null;

  if(!amount || amount <= 0 || !start){ alert('Amount and start date required'); return; }

  repeatingEntries.push({ type, reason, amount, category, start, end, excludeMonths: [] });
  saveRepeats();
  closeRepeatModal();
  renderEntries();
}

/* --- Manage repeating: open modal & build editable table --- */
function openManageRepeats(){
  document.getElementById('manageRepeatsModal').style.display = 'flex';
  const tbody = document.getElementById('manageRepeatsBody');
  tbody.innerHTML = '';

  repeatingEntries.forEach((r, i) => {
    const tr = document.createElement('tr');
    
    // Create the select element for Type
    const typeSelectHtml = `
      <select onchange="updateRepeatField(${i}, 'type', this.value)">
        <option value="income" ${r.type === 'income' ? 'selected' : ''}>income</option>
        <option value="expense" ${r.type === 'expense' ? 'selected' : ''}>expense</option>
      </select>
    `;

    // Reason (editable), Amount (editable), Category (editable), Start (editable), End (editable), Actions
    tr.innerHTML = `
      <td>${typeSelectHtml}</td>
      <td><input type="text" value="${escapeHtml(r.reason||'')}" onchange="updateRepeatField(${i}, 'reason', this.value)"></td>
      <td><input type="number" step="0.01" value="${r.amount}" onchange="updateRepeatField(${i}, 'amount', this.value)"></td>
      <td><input list="categoryList" type="text" value="${escapeHtml(r.category||'')}" onchange="updateRepeatField(${i}, 'category', this.value)"></td>
      <td><input type="date" value="${r.start}" onchange="updateRepeatField(${i}, 'start', this.value)"></td>
      <td><input type="date" value="${r.end||''}" onchange="updateRepeatField(${i}, 'end', this.value||null)"></td>
      <td><button onclick="deleteRepeat(${i})">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });
}

/* helper to sanitize values placed into value="" above */
function escapeHtml(s){
  return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function closeManageRepeats(){ document.getElementById('manageRepeatsModal').style.display='none'; }

function deleteRepeat(i){
  if(!confirm('Delete repeating entry?')) return;
  repeatingEntries.splice(i,1);
  saveRepeats();
  openManageRepeats();
  renderEntries();
}

/* Called by inputs in Manage Repeats to save changes inline */
function updateRepeatField(index, field, value){
  if(index < 0 || index >= repeatingEntries.length) return;

  if(field === 'amount'){
    const num = parseFloat(value);
    repeatingEntries[index].amount = Number.isFinite(num) ? num : 0;
  } else if(field === 'end'){
    // set to null if empty string
    repeatingEntries[index].end = value === '' || value === null ? null : value;
  } else {
    repeatingEntries[index][field] = value;
  }

  saveRepeats();
  // Ensure the main display is refreshed when any field changes
  renderEntries(); 
}

/* --- Repeats expanded for a selected month --- */
function getRepeatsForMonth(ym){
  if(!ym) return [];
  const [year, month] = ym.split('-');
  const monthStr = `${year}-${month}`;

  return repeatingEntries.flatMap(entry => {
    const startMonth = entry.start.slice(0,7);
    const endMonth = entry.end ? entry.end.slice(0,7) : null;

    if(entry.excludeMonths && entry.excludeMonths.includes(monthStr)){
      return [{ ...entry, date: monthStr + '-01', isRepeat: true, excluded: true }];
    }

    if(monthStr < startMonth) return [];
    if(endMonth && monthStr > endMonth) return [];

    return [{ ...entry, date: monthStr + '-01', isRepeat: true, excluded: false }];
  });
}

/* toggle include/exclude for a repeating entry instance (for a month) */
function toggleRepeat(reason, date){
  // Prevents the row click event from firing when clicking the button
  event.stopPropagation(); 
  const month = date.slice(0,7);
  // find the correct repeating entry by reason AND month range (prefer exact match)
  const entry = repeatingEntries.find(e => e.reason === reason);
  if(!entry) return;

  entry.excludeMonths = entry.excludeMonths || [];
  const idx = entry.excludeMonths.indexOf(month);
  if(idx >= 0) entry.excludeMonths.splice(idx,1);
  else entry.excludeMonths.push(month);

  saveRepeats();
  renderEntries(); 
}

/* --- Render main entries + repeats for selected month (UPDATED) --- */
function renderEntries(){
  // Build table body
  const tbody = document.getElementById('entries');
  tbody.innerHTML = '';

  const todayMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  let totalBalance = 0;
  let monthlyBalance = 0;

  if(!selectedMonth) selectedMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;

  const filteredEntries = entries.filter(e => e.date.startsWith(selectedMonth));
  const repeats = getRepeatsForMonth(selectedMonth);

  // Total balance calculation (unchanged)
  const pastEntries = entries.filter(e => e.date.slice(0,7) <= todayMonth);
  const pastRepeats = repeatingEntries.flatMap(entry => {
    const months = [];
    let cur = new Date(entry.start);
    const end = entry.end ? new Date(entry.end) : today;

    while(cur <= end && cur <= today){
      const m = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
      if(!(entry.excludeMonths || []).includes(m)){
        months.push({...entry, date: m + '-01', isRepeat: true});
      }
      cur.setMonth(cur.getMonth()+1);
    }
    return months;
  });

  totalBalance =
    pastEntries.reduce((s,e) => s + (e.type === 'income' ? e.amount : -e.amount), 0) +
    pastRepeats.reduce((s,e) => s + (e.type === 'income' ? e.amount : -e.amount), 0);

  // 1. COMBINE AND SORT ENTRIES (Newest on top)
  const combinedEntries = [...filteredEntries, ...repeats].sort((a, b) => {
      // Sort by date descending (newest date first)
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      
      // Secondary sort: repeating entries should appear after standard entries on the same day
      if (a.isRepeat && !b.isRepeat) return 1;
      if (!a.isRepeat && b.isRepeat) return -1;

      return 0;
  });

  // render current month rows (entries + repeats)
  combinedEntries.forEach(entry => {
    if(!entry.excluded) monthlyBalance += (entry.type === 'income' ? entry.amount : -entry.amount);

    const tr = document.createElement('tr');
    if(entry.excluded) tr.classList.add('gray');

    // Content generation
    const isRepeat = entry.isRepeat;
    const dateDay = entry.date.slice(-2); // Display only the day

    const amountHtml = `<span class="${entry.type}">${currency}${Number(entry.amount).toFixed(2)}</span>`;
    
    // UPDATED: Wrap reasoning text in .main-reason for ellipsis
    const reasonHtml = `
        <div class="main-reason">${entry.reason ? escapeHtml(entry.reason) : '-'}</div>
        <span class="category-text">${entry.category ? escapeHtml(entry.category) : '-'}</span>
    `;
    
    let rowHtml = '';
    
    if (isRepeat) {
        // Repeating entries: action button is inside the Date column, and the row is NOT clickable for the action modal
        const safeReason = (entry.reason || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeDate = entry.date;
        
        rowHtml = `
            <td class="reason-cell">${reasonHtml}</td>
            <td class="amount-cell" style="font-weight:bold;">${amountHtml}</td>
            <td class="date-cell">
                ${dateDay} <span style="font-size:0.8em;">(R)</span>
                <button 
                    onclick="toggleRepeat('${safeReason}','${safeDate}')" 
                    style="margin-top: 5px; padding: 5px 8px; font-size: 0.8em; display:block; margin-left:auto; margin-right:auto; white-space:nowrap;"
                >
                    ${entry.excluded ? '<i class="bi bi-eye-fill"></i>' : '<i class="bi bi-eye-slash-fill"></i>'}
                </button>
            </td>
        `;
        
    } else {
        // Standard entries: row is clickable to open the action modal
        const realEntryIndex = entries.indexOf(entry);
        tr.setAttribute('onclick', `openActionModal(${realEntryIndex})`);
        
        rowHtml = `
            <td class="reason-cell">${reasonHtml}</td>
            <td class="amount-cell" style="font-weight:bold;">${amountHtml}</td>
            <td class="date-cell">${dateDay}</td>
        `;
    }

    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  });

  document.getElementById('totalBalance').innerText = `Total Balance: ${currency}${totalBalance.toFixed(2)}`;
  document.getElementById('monthBalance').innerText = `Monthly Balance: ${currency}${monthlyBalance.toFixed(2)}`;
  document.getElementById('monthLabel').innerText = selectedMonth ? formatMonthLabel(selectedMonth) : 'All Time';

  updateCategoryList();
  updateChart();
}


/* --- Helpers & storage --- */
function formatMonthLabel(ym){
  const [y,m] = ym.split('-');
  const d = new Date(y, m-1);
  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function clearInputs(){
  document.getElementById('reason').value = '';
  document.getElementById('amount').value = '';
  document.getElementById('category').value = '';
  document.getElementById('date').value = '';
}

function deleteEntry(index){
  if(!confirm('Delete entry?')) return;
  entries.splice(index, 1);
  saveData();
  renderEntries();
}

function clearAll(){
  if(!confirm('Clear EVERYTHING? This will remove entries and repeating entries and erase them from the database.')) return;
  entries = [];
  repeatingEntries = [];
  saveData();
  saveRepeats();
  renderEntries();
  closeSettingsModal();
}

/* Export / Import */
function exportData(){
  const dataStr = JSON.stringify({ entries, currency, repeatingEntries }, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'budget_data.json';
  a.click();

  URL.revokeObjectURL(url);
  closeSettingsModal();
}

function importData(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try {
      const data = JSON.parse(e.target.result);
      entries = data.entries || [];
      currency = data.currency || "$";
      repeatingEntries = data.repeatingEntries || [];
      document.getElementById('currency').value = currency;
      saveData();
      saveRepeats();
      renderEntries();
      alert('Data imported.');
      closeSettingsModal();
    } catch(err){
      alert('Invalid file.');
    }
  };
  reader.readAsText(file);
}

/* category datalist */
function updateCategoryList(){
  const list = document.getElementById('categoryList');
  list.innerHTML = '';
  const cats = new Set();
  entries.forEach(e => { if(e.category) cats.add(e.category); });
  repeatingEntries.forEach(r => { if(r.category) cats.add(r.category); });
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    list.appendChild(opt);
  });
}

/* Chart: basic pie by category (expenses only to show spend) */
function updateChart() {
  const canvas = document.getElementById('categoryChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // collect entries for current month
  const monthEntries = selectedMonth
    ? entries.filter(e => e.date.startsWith(selectedMonth))
        .concat(getRepeatsForMonth(selectedMonth).filter(r => !r.excluded))
    : entries.concat(getRepeatsForMonth(selectedMonth).filter(r => !r.excluded)); // Use selectedMonth consistently

  // gather categories
  const labels = [...new Set(monthEntries.map(e => e.category).filter(Boolean))];

  // if absolutely no categories → clear chart and stop
  if (labels.length === 0) {
    if (chart) chart.destroy();
    return;
  }

  // pastel color palette
  const pastelColors = [
    '#A3C9F9', // pastel blue
    '#FFB5C8', // pastel pink
    '#FBE7A1', // pastel yellow
    '#C8E7C5', // pastel green
    '#E6C7F1', // pastel purple
    '#FFD9B3', // pastel peach
    '#B8F2E0', // pastel aqua
    '#F2C6DE'  // soft rose
  ];

  // calculate category sums
  const data = labels.map(cat =>
    monthEntries
      .filter(e => e.category === cat)
      .reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0)
  );

  // destroy previous chart
  if (chart) chart.destroy();

  // create chart
  chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: pastelColors.slice(0, labels.length)
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Category Balances (Income - Expense)'
        },
        legend: {
          position: 'bottom',
          labels: {
            padding: 16,
            font: { size: 13 }
          }
        }
      }
    }
  });
}

/* Month navigation */
function prevMonth(){
  const d = new Date(selectedMonth + '-01');
  d.setMonth(d.getMonth() - 1);
  selectedMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  renderEntries();
}
function nextMonth(){
  const d = new Date(selectedMonth + '-01');
  d.setMonth(d.getMonth() + 1);
  selectedMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  renderEntries();
}


/* --- NEW SETTINGS MODAL FUNCTIONS --- */
function openSettingsModal() { 
    document.getElementById('settingsModal').style.display = 'flex'; 
}
function closeSettingsModal() { 
    document.getElementById('settingsModal').style.display = 'none'; 
    // Clear the file input just in case
    document.getElementById('importFile').value = '';
}
/* ------------------------------------ */


/* close modals when clicking outside (UPDATED) */
window.onclick = function(e){
  if(e.target === document.getElementById('authModal')) closeAuthModal();
  if(e.target === document.getElementById('entryModal')) closeModal();
  if(e.target === document.getElementById('repeatModal')) closeRepeatModal();
  if(e.target === document.getElementById('manageRepeatsModal')) closeManageRepeats();
  if(e.target === document.getElementById('monthlyBalanceModal')) closeMonthlyBalanceModal();
  if(e.target === document.getElementById('settingsModal')) closeSettingsModal();
  if(e.target === document.getElementById('actionModal')) closeActionModal(); 
};

// Drag scrolling
const chartWrapper = document.getElementById('chartWrapper');
let isDragging = false;
let startX, scrollLeft;

chartWrapper.addEventListener('mousedown', (e) => {
  isDragging = true;
  chartWrapper.style.cursor = 'grabbing';
  startX = e.pageX - chartWrapper.offsetLeft;
  scrollLeft = chartWrapper.scrollLeft;
});
chartWrapper.addEventListener('mouseleave', () => { isDragging = false; chartWrapper.style.cursor = 'grab'; });
chartWrapper.addEventListener('mouseup', () => { isDragging = false; chartWrapper.style.cursor = 'grab'; });
chartWrapper.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  e.preventDefault();
  const x = e.pageX - chartWrapper.offsetLeft;
  chartWrapper.scrollLeft = scrollLeft + (startX - x);
});

// Open modal
document.getElementById('totalBalance').onclick = function() {
  document.getElementById('monthlyBalanceModal').style.display = 'flex';
  renderMonthlyBalanceChart();
};

// Close modal
function closeMonthlyBalanceModal() {
  document.getElementById('monthlyBalanceModal').style.display = 'none';
}

// Render chart
function renderMonthlyBalanceChart() {
  const ctx = document.getElementById('monthlyBalanceChart').getContext('2d');

  const allEntries = entries.concat(
    repeatingEntries.flatMap(entry => {
      const months = [];
      let current = new Date(entry.start);
      const end = entry.end ? new Date(entry.end) : today;
      
      const maxDate = end > today ? today : end;
      
      while(current <= maxDate){
        const monthStr = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}`;
        
        if(monthStr <= `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`){
            if(!entry.excludeMonths.includes(monthStr)){
                months.push({ ...entry, date: monthStr+'-01', isRepeat:true });
            }
        }
        
        current.setMonth(current.getMonth()+1);
      }
      return months;
    })
  );
  
  // Collect all months, sorted oldest → newest, but only up to today
  const todayMonthStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const monthSet = new Set(allEntries.map(e => e.date.slice(0,7)).filter(m => m <= todayMonthStr));
  const months = Array.from(monthSet).sort();

  // Compute cumulative total balance
  let cumulative = 0;
  const totalBalances = months.map(month => {
    // Collect all unique entries for that month (including repeats that aren't excluded)
    const monthEntries = entries.filter(e => e.date.startsWith(month))
      .concat(getRepeatsForMonth(month).filter(r => !r.excluded));
      
    // Sum up the month's income/expense
    const monthSum = monthEntries.reduce((sum,e)=>sum + (e.type==='income'?e.amount:-e.amount),0);
    
    cumulative += monthSum;
    return cumulative;
  });

  if(monthlyChart) monthlyChart.destroy();

  // Fixed width per month, max 12 visible at a time
  const monthWidth = 80;
  const canvasWidth = Math.max(12 * monthWidth, months.length * monthWidth); 
  const canvas = document.getElementById('monthlyBalanceChart');
  canvas.style.width = canvasWidth + 'px';
  canvas.style.height = '300px';

  monthlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months.map(m => {
        const [y,mon] = m.split('-');
        const d = new Date(y, mon-1);
        return d.toLocaleString('default', { month:'short', year:'numeric' });
      }),
      datasets: [{
        label: 'Total Balance',
        data: totalBalances,
        borderColor: '#AEC6CF',       // pastel blue
        backgroundColor: 'rgba(174,198,207,0.3)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      scales: {
        x: { 
          ticks: { maxRotation: 45, minRotation: 45 },
          grid: { display: false }
        },
        y: { 
          beginAtZero: false, 
          grid: { color: '#444' }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      }
    }
  });

  // Scroll so the **current month** is at the right
  setTimeout(()=> {
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
    const index = months.indexOf(currentMonthStr);
    if(index >= 0){
      chartWrapper.scrollLeft = Math.max(0, monthWidth*index - chartWrapper.clientWidth + monthWidth);
    } else {
      chartWrapper.scrollLeft = chartWrapper.scrollWidth - chartWrapper.clientWidth;
    }
  }, 50);
}

// --- EXPOSE NECESSARY FUNCTIONS TO GLOBAL WINDOW SCOPE (for onclick in HTML) ---
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.handleAuthAction = handleAuthAction;
window.userSignOut = userSignOut;
window.changeCurrency = changeCurrency;
window.openModal = openModal;
window.closeModal = closeModal;
window.saveEntry = saveEntry;
window.clearAll = clearAll;
window.exportData = exportData;
window.importData = importData;
window.openRepeatModal = openRepeatModal;
window.closeRepeatModal = closeRepeatModal;
window.saveRepeatEntry = saveRepeatEntry;
window.openManageRepeats = openManageRepeats;
window.closeManageRepeats = closeManageRepeats;
window.deleteRepeat = deleteRepeat;
window.updateRepeatField = updateRepeatField;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.toggleRepeat = toggleRepeat;
window.deleteEntry = deleteEntry;
window.closeMonthlyBalanceModal = closeMonthlyBalanceModal;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.openActionModal = openActionModal;
window.closeActionModal = closeActionModal;
window.handleActionClick = handleActionClick;

// Initial data load is handled by the onAuthStateChanged listener at the end of section 4.