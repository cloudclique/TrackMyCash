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
export const auth = getAuth(app); // EXPORTED
export const db = getFirestore(app); // EXPORTED
export { initializeApp, getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, getFirestore, doc, setDoc, getDoc }; // EXPORTED

/* --- Global Utility Functions (NEW) --- */

/**
 * Generates a simple, non-cryptographic unique ID string.
 */
export function generateUniqueId() { // EXPORTED
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

/**
 * Ensures all entries in an array have a unique 'id' property.
 */
export function assignMissingIds(arr) { // EXPORTED
    if (!Array.isArray(arr)) return [];
    return arr.map(e => {
        if (!e.id) e.id = generateUniqueId();
        if (e.isRepeat && e.interval === undefined) e.interval = 1;
        if (e.isRepeat && e.frequency === undefined) e.frequency = 'months';
        return e;
    });
}

/* ---------------------------------------------------------------------- */
/* --- 2. GLOBAL STATE & INITIALIZATION --------------------------------- */
/* ---------------------------------------------------------------------- */

export let entries = []; // EXPORTED
export let repeatingEntries = []; // EXPORTED
let editIndex = null;
let actionId = null; 
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

export async function userSignOut() { // EXPORTED
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
export async function loadData() { // EXPORTED
  // 1. Load from Local Storage (as cache/fallback)
  const localSaved = localStorage.getItem('budgetEntries');
  const localRepeats = localStorage.getItem('budgetRepeats');
  
  if (localSaved) {
    const saved = JSON.parse(localSaved);
    entries = assignMissingIds(saved.entries || []); 
    currency = saved.currency || "$";
    const currencyEl = document.getElementById('currency');
    if(currencyEl) currencyEl.value = currency;
  }
  if (localRepeats) {
    repeatingEntries = assignMissingIds(JSON.parse(localRepeats)); 
  }

  // 2. Override with Firestore data if logged in
  if (currentUser) {
    const docRef = doc(db, "budgets", currentUser.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const firestoreData = docSnap.data();
      entries = assignMissingIds(firestoreData.entries || []); 
      repeatingEntries = assignMissingIds(firestoreData.repeatingEntries || []); 
      currency = firestoreData.currency || "$";
      const currencyEl = document.getElementById('currency');
      if(currencyEl) currencyEl.value = currency;
      
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
  
  // 3. Render (only runs on index.html)
  if (document.getElementById('entries')) {
      renderEntries();
  }
}

/**
 * Saves entries and currency: Firestore > Local Storage
 */
export function saveData(){ // EXPORTED
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
export function saveRepeats(){ // EXPORTED
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
  
  // Only execute this logic on the main index page
  if (authStatusDiv && authStatusDiv.closest('.top-bar').querySelector('h1').innerText === 'CashTracker') {
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
  } else {
    // If not on the index page, just set currentUser
    currentUser = user;
  }
  
  // The loadData function is now responsible for rendering based on page context
  await loadData();
});

/* ---------------------------------------------------------------------- */
/* --- 5. EXISTING BUDGET TRACKER FUNCTIONS ----------------------------- */
/* ---------------------------------------------------------------------- */

/* --- Action Modal Functions --- */

function openActionModal(entryId) { 
    actionId = entryId; 
    const modal = document.getElementById('actionModal');
    const reasonP = document.getElementById('actionModalReason');

    const entry = entries.find(e => e.id === entryId);

    if (!entry) {
        alert("Error: Invalid entry selected.");
        actionId = null;
        return;
    }
    
    reasonP.innerText = `${entry.reason || 'No Description'}`;
    modal.style.display = 'flex';
}

function closeActionModal() {
    document.getElementById('actionModal').style.display = 'none';
    actionId = null; 
}

function handleActionClick(actionType) {
    if (actionId === null) return;
    
    const index = entries.findIndex(e => e.id === actionId);

    if(index === -1) {
        alert("Error: Entry not found.");
        closeActionModal();
        return;
    }

    if (actionType === 'edit') {
        closeActionModal();
        openModal(true, index); 
    } else if (actionType === 'delete') {
        closeActionModal();
        deleteEntry(index); 
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

  if(editIndex !== null) {
      entry.id = entries[editIndex].id; 
      entries[editIndex] = entry;
  }
  else {
      entry.id = generateUniqueId(); 
      entries.push(entry);
  }

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
  document.getElementById('repeatInterval').value = '1';
  document.getElementById('repeatFrequency').value = 'months';
  document.getElementById('repeatStartDate').value = '';
  document.getElementById('repeatEndDate').value = '';
}

function saveRepeatEntry(){
  const type = document.getElementById('repeatType').value;
  const reason = document.getElementById('repeatReason').value.trim();
  const amount = parseFloat(document.getElementById('repeatAmount').value);
  const category = document.getElementById('repeatCategory').value.trim();
  const interval = parseInt(document.getElementById('repeatInterval').value);
  const frequency = document.getElementById('repeatFrequency').value;
  const start = document.getElementById('repeatStartDate').value;
  const end = document.getElementById('repeatEndDate').value || null;

  if(!amount || amount <= 0 || !start || !interval || interval < 1){ alert('Amount, start date, and a valid interval required'); return; }

  repeatingEntries.push({ id: generateUniqueId(), type, reason, amount, category, start, end, interval, frequency, excludeMonths: [] });
  saveRepeats();
  closeRepeatModal();
  renderEntries();
}

/* helper to sanitize values placed into value="" above */
export function escapeHtml(s){ // EXPORTED
  const str = String(s || ''); 
  return str.replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}


export function deleteRepeat(id){ // EXPORTED
  if(!confirm('Delete repeating entry?')) return;
  const index = repeatingEntries.findIndex(r => r.id === id); 

  if(index !== -1) {
    repeatingEntries.splice(index,1);
    saveRepeats();
    // If we're on the manage page, we want to re-render it
    if (document.getElementById('manageRepeatsBody')) {
        // Since renderManageRepeatsTable is not in app.js, we need to rely on 
        // the manage_repeats_script.js to handle re-render after data update.
        // The inline call to deleteRepeat will trigger a window-level function call 
        // which has the updated reference to repeatingEntries.
        // On a single-page app, we would re-render. Since we are on a different page, 
        // the manage_repeats_script.js needs a way to re-render itself. 
        // The management script exposes this. We'll rely on the window-level call in the other script.
    }
    renderEntries(); // Re-render the main table
  }
}

/* Called by inputs in Manage Repeats to save changes inline */
export function updateRepeatField(id, field, value){ // EXPORTED
  const index = repeatingEntries.findIndex(r => r.id === id); 
  if(index === -1) return;
  
  const r = repeatingEntries[index];

  if(field === 'amount'){
    const num = parseFloat(value);
    r.amount = Number.isFinite(num) ? num : 0;
  } else if(field === 'interval'){ 
    const num = parseInt(value);
    r.interval = Number.isInteger(num) && num > 0 ? num : 1;
  } else if(field === 'end'){
    r.end = value === '' || value === null ? null : value;
  } else {
    r[field] = value;
  }

  saveRepeats();
  // Ensure the main display is refreshed when any field changes
  if (document.getElementById('entries')) {
      renderEntries(); 
  }
}

/**
 * Calculates all specific dates within a month (ym) for a single repeating entry.
 */
function getRepeatDatesForMonth(entry, ym) {
  const dates = [];
  const targetDateStart = new Date(`${ym}-01T00:00:00`);
  const targetDateEnd = new Date(targetDateStart);
  targetDateEnd.setMonth(targetDateEnd.getMonth() + 1); 

  const startDate = new Date(entry.start + 'T00:00:00');
  const endDate = entry.end ? new Date(entry.end + 'T00:00:00') : null;

  const interval = Number(entry.interval) || 1;
  const frequency = entry.frequency || 'months';

  let repeatCheckDate = new Date(startDate);
  
  while (repeatCheckDate < targetDateEnd) {
    if (endDate && repeatCheckDate > endDate) break;

    const dateStr = `${repeatCheckDate.getFullYear()}-${String(repeatCheckDate.getMonth() + 1).padStart(2, '0')}-${String(repeatCheckDate.getDate()).padStart(2, '0')}`;
    const repeatCheckYM = dateStr.slice(0, 7);

    if (repeatCheckYM === ym) {
        dates.push(dateStr);
    } else if (repeatCheckYM > ym) {
        break; 
    }

    const nextDate = new Date(repeatCheckDate);
    if (frequency === 'days') nextDate.setDate(repeatCheckDate.getDate() + interval);
    else if (frequency === 'weeks') nextDate.setDate(repeatCheckDate.getDate() + interval * 7);
    else if (frequency === 'months') {
        const dayOfMonth = repeatCheckDate.getDate();
        nextDate.setMonth(repeatCheckDate.getMonth() + interval);
        if (nextDate.getDate() < dayOfMonth && nextDate.getMonth() !== (repeatCheckDate.getMonth() + interval) % 12) {
            nextDate.setDate(0); 
            nextDate.setMonth(repeatCheckDate.getMonth() + interval); 
        }
    } else if (frequency === 'years') nextDate.setFullYear(repeatCheckDate.getFullYear() + interval);
    
    if (nextDate.getTime() <= repeatCheckDate.getTime()) {
      break; 
    }
    repeatCheckDate = nextDate;
  }
  
  const uniqueDates = Array.from(new Set(dates)).filter(d => d.startsWith(ym));
  return uniqueDates.sort();
}

/* --- Repeats expanded for a selected month --- */
function getRepeatsForMonth(ym){
  if(!ym) return [];
  const monthStr = ym; 

  return repeatingEntries.flatMap(entry => {
    if(entry.excludeMonths && entry.excludeMonths.includes(monthStr)){
      return [{ 
        ...entry, 
        date: monthStr + '-01', 
        isRepeat: true, 
        excluded: true 
      }];
    }
    
    const startMonth = entry.start.slice(0,7);
    const endMonth = entry.end ? entry.end.slice(0,7) : null;
    
    if(monthStr < startMonth) return [];
    if(endMonth && monthStr > endMonth) return [];

    const datesInMonth = getRepeatDatesForMonth(entry, ym);

    return datesInMonth.map(date => ({ 
      ...entry, 
      date: date, 
      isRepeat: true, 
      excluded: false 
    }));
  });
}


/* toggle include/exclude for a repeating entry instance (for a month) */
function toggleRepeat(repeatId, date){ 
  event.stopPropagation(); 
  const month = date.slice(0,7);
  const entry = repeatingEntries.find(e => e.id === repeatId);
  if(!entry) return;

  entry.excludeMonths = entry.excludeMonths || [];
  const idx = entry.excludeMonths.indexOf(month);
  if(idx >= 0) entry.excludeMonths.splice(idx,1);
  else entry.excludeMonths.push(month);

  saveRepeats();
  renderEntries(); 
}

/* --- Render main entries + repeats for selected month --- */
function renderEntries(){
  const tbody = document.getElementById('entries');
  if(!tbody) return; // Only run on index.html

  tbody.innerHTML = '';

  const todayMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  let totalBalance = 0;
  let monthlyBalance = 0;

  if(!selectedMonth) selectedMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;

  const filteredEntries = entries.filter(e => e.date.startsWith(selectedMonth));
  const repeats = getRepeatsForMonth(selectedMonth);

  const pastEntries = entries.filter(e => e.date.slice(0,7) <= todayMonth);
  
  const pastRepeats = repeatingEntries.flatMap(entry => {
    const repeats = [];
    let cur = new Date(entry.start + 'T00:00:00'); 
    const endLimit = entry.end ? new Date(entry.end + 'T00:00:00') : new Date(8640000000000000); 
    const effectiveEnd = (endLimit > today) ? today : endLimit;

    const interval = Number(entry.interval) || 1;
    const frequency = entry.frequency || 'months';

    while(cur <= effectiveEnd){
      const m = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
      if(!(entry.excludeMonths || []).includes(m)){
        const dateStr = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
        repeats.push({...entry, date: dateStr, isRepeat: true});
      }
      
      const nextDate = new Date(cur);
      if (frequency === 'days') nextDate.setDate(cur.getDate() + interval);
      else if (frequency === 'weeks') nextDate.setDate(cur.getDate() + interval * 7);
      else if (frequency === 'months') {
        const dayOfMonth = cur.getDate();
        nextDate.setMonth(cur.getMonth() + interval);
        if (nextDate.getDate() < dayOfMonth && nextDate.getMonth() !== (cur.getMonth() + interval) % 12) {
            nextDate.setDate(0); 
            nextDate.setMonth(cur.getMonth() + interval);
        }
      } else if (frequency === 'years') nextDate.setFullYear(cur.getFullYear() + interval);
      
      if (nextDate.getTime() <= cur.getTime()) break;
      cur = nextDate;
    }
    return repeats;
  });

  const uniquePastRepeats = Array.from(new Set(pastRepeats.map(r => r.id + r.date))) 
    .map(uniqueId => pastRepeats.find(r => r.id + r.date === uniqueId)); 

  totalBalance =
    pastEntries.reduce((s,e) => s + (e.type === 'income' ? e.amount : -e.amount), 0) +
    uniquePastRepeats.reduce((s,e) => s + (e.type === 'income' ? e.amount : -e.amount), 0);
  
  const combinedEntries = [...filteredEntries, ...repeats].sort((a, b) => {
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      if (a.isRepeat && !b.isRepeat) return 1;
      if (!a.isRepeat && b.isRepeat) return -1;
      return 0;
  });

  combinedEntries.forEach(entry => {
    if(!entry.excluded) monthlyBalance += (entry.type === 'income' ? entry.amount : -entry.amount);

    const tr = document.createElement('tr');
    if(entry.excluded) tr.classList.add('gray');

    const isRepeat = entry.isRepeat;
    const dateDay = entry.date.slice(-2); 

    const amountHtml = `<span class="${entry.type}">${currency}${Number(entry.amount).toFixed(2)}</span>`;
    
    const reasonHtml = `
        <div class="main-reason">${entry.reason ? escapeHtml(entry.reason) : '-'}</div>
        <span class="category-text">${entry.category ? escapeHtml(entry.category) : '-'}</span>
    `;
    
    let rowHtml = '';
    
    if (isRepeat) {
        const repeatId = entry.id; 
        const safeDate = entry.date;
        
        rowHtml = `
            <td class="reason-cell">(R)${reasonHtml}</td>
            <td class="amount-cell" style="font-weight:bold;">${amountHtml}</td>
            <td class="date-cell">
                ${dateDay} 
                <button 
                    onclick="toggleRepeat('${repeatId}','${safeDate}')" 
                    style="margin-top: 5px; padding: 5px 8px; font-size: 0.8em; display:block; margin-left:auto; margin-right:auto; white-space:nowrap;"
                >
                    ${entry.excluded ? '<i class="bi bi-eye-fill"></i>' : '<i class="bi bi-eye-slash-fill"></i>'}
                </button>
            </td>
        `;
        
    } else {
        const entryId = entry.id; 
        tr.setAttribute('onclick', `openActionModal('${entryId}')`); 
        
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
  const [y, m] = ym.split('-');
  const date = new Date(y, m - 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function clearInputs(){
  document.getElementById('type').value = 'expense';
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

function prevMonth(){
  const date = new Date(selectedMonth + '-01');
  date.setMonth(date.getMonth() - 1);
  selectedMonth = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  renderEntries();
}

function nextMonth(){
  const date = new Date(selectedMonth + '-01');
  date.setMonth(date.getMonth() + 1);
  selectedMonth = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  renderEntries();
}

function getCategoriesForMonth(ym){
  if(!ym) return {};

  const monthlyEntries = entries.filter(e => e.date.startsWith(ym));
  const monthlyRepeats = getRepeatsForMonth(ym).filter(e => !e.excluded);

  const combined = [...monthlyEntries, ...monthlyRepeats];

  const categories = {};
  combined.forEach(e => {
    if(e.type === 'expense' && e.amount > 0){
      const cat = e.category || 'Other';
      categories[cat] = (categories[cat] || 0) + e.amount;
    }
  });
  return categories;
}

export function updateCategoryList(){ // EXPORTED
  const categoryList = document.getElementById('categoryList');
  if (!categoryList) return; // Exit if element is not present (e.g. on manage_repeats page)
  categoryList.innerHTML = '';
  const allCategories = new Set(entries.map(e => e.category).filter(Boolean));
  repeatingEntries.map(e => e.category).filter(Boolean).forEach(c => allCategories.add(c));

  Array.from(allCategories).sort().forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    categoryList.appendChild(option);
  });
}

function updateChart(){
  const categories = getCategoriesForMonth(selectedMonth);
  const chartEl = document.getElementById('categoryChart');
  const labels = Object.keys(categories);
  const data = Object.values(categories);

  if(chart) chart.destroy();

  chart = new Chart(chartEl, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        label: 'Expense by Category',
        data: data,
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', 
          '#E7E9ED', '#C9CBCF', '#8A2BE2', '#5F9EA0', '#D2B48C', '#00FF7F' 
        ],
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#eee'
          }
        }
      }
    }
  });

  updateMonthlyBalanceChart(false);
}

function openMonthlyBalanceModal(){
  document.getElementById('monthlyBalanceModal').style.display = 'flex';
  updateMonthlyBalanceChart(true);
}
function closeMonthlyBalanceModal(){
  document.getElementById('monthlyBalanceModal').style.display = 'none';
  updateMonthlyBalanceChart(false);
}

function updateMonthlyBalanceChart(fullScreen=false) {
  const chartEl = document.getElementById('monthlyBalanceChart');

  const minDate = entries.length > 0 ? entries.reduce((min, e) => e.date < min ? e.date : min, entries[0].date) : selectedMonth + '-01';
  const firstMonth = minDate.slice(0, 7);
  
  const months = [];
  let currentMonth = new Date(firstMonth + '-01');
  const endMonth = new Date(selectedMonth + '-01');
  
  while (currentMonth <= endMonth) {
    months.push(`${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`);
    
    const currentM = currentMonth.getMonth();
    currentMonth.setMonth(currentM + 1);
    if (currentMonth.getMonth() !== (currentM + 1) % 12) {
        currentMonth.setDate(0); 
        currentMonth.setDate(1); 
    }
  }
  
  let runningBalance = 0;
  const balanceData = months.map(monthYM => {
    const monthEntries = entries.filter(e => e.date.startsWith(monthYM));
    const monthRepeats = getRepeatsForMonth(monthYM).filter(e => !e.excluded);
    const combined = [...monthEntries, ...monthRepeats];
    
    const monthlyNet = combined.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0);
    
    runningBalance += monthlyNet;
    return runningBalance;
  });
  
  const labels = months.map(m => formatMonthLabel(m));
  
  if (monthlyChart) monthlyChart.destroy();

  const chartOptions = {
      responsive: true,
      maintainAspectRatio: !fullScreen,
      aspectRatio: fullScreen ? 3 : 1.5, 
      scales: {
          y: {
              beginAtZero: false,
              ticks: { color: '#eee' },
              grid: { color: 'rgba(238, 238, 238, 0.1)' }
          },
          x: {
              ticks: { color: '#eee' },
              grid: { color: 'rgba(238, 238, 238, 0.1)' }
          }
      },
      plugins: {
          legend: { display: false },
          title: {
              display: fullScreen,
              text: 'Cumulative Balance Over Time',
              color: '#eee',
              font: { size: 16 }
          },
          tooltip: {
              callbacks: {
                  label: function(context) {
                      return ` Balance: ${currency}${context.parsed.y.toFixed(2)}`;
                  }
              }
          }
      }
  };

  monthlyChart = new Chart(chartEl, {
      type: 'line',
      data: {
          labels: labels,
          datasets: [{
              label: 'Cumulative Balance',
              data: balanceData,
              borderColor: '#00ffd5',
              backgroundColor: 'rgba(0, 255, 213, 0.2)',
              fill: true,
              tension: 0.3
          }]
      },
      options: chartOptions
  });

  if (fullScreen) {
    scrollToCurrentMonthChart(months.length - 1);
  }
}

function scrollToCurrentMonthChart(index) {
  const chartWrapper = document.getElementById('chartWrapper');
  const chartCanvas = document.getElementById('monthlyBalanceChart');
  
  setTimeout(() => {
    const monthWidth = 100; 
    
    if (chartCanvas.clientWidth > chartWrapper.clientWidth) {
      chartWrapper.scrollLeft = Math.max(0, monthWidth * index - chartWrapper.clientWidth + monthWidth);
    } else {
      chartWrapper.scrollLeft = chartWrapper.scrollWidth - chartWrapper.clientWidth;
    }
  }, 50);
}

function openSettingsModal(){
  document.getElementById('settingsModal').style.display = 'flex';
}
function closeSettingsModal(){
  document.getElementById('settingsModal').style.display = 'none';
}

function clearAll(){
    if(confirm('Are you absolutely sure you want to clear ALL data (entries and repeating entries)? This cannot be undone.')){
        entries = [];
        repeatingEntries = [];
        localStorage.removeItem('budgetEntries');
        localStorage.removeItem('budgetRepeats');
        
        if (currentUser) {
            const docRef = doc(db, "budgets", currentUser.uid);
            setDoc(docRef, { 
              entries: [], 
              repeatingEntries: [],
              lastUpdated: new Date().toISOString()
            }, { merge: true }) 
            .catch(error => console.error("Error clearing Firestore data:", error));
        }
        
        alert('All data cleared.');
        renderEntries();
        closeSettingsModal();
    }
}

function exportData(){
    const data = { 
        entries: entries, 
        repeatingEntries: repeatingEntries,
        currency: currency,
        exportedAt: new Date().toISOString()
    };
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget_tracker_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(event){
    const file = event.target.files[0];
    if(!file) return;

    if(!confirm('Importing data will OVERWRITE your current budget data. Continue?')){
        event.target.value = null; 
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e){
        try {
            const importedData = JSON.parse(e.target.result);

            if(importedData.entries && Array.isArray(importedData.entries)){
                entries = assignMissingIds(importedData.entries);
            }
            if(importedData.repeatingEntries && Array.isArray(importedData.repeatingEntries)){
                repeatingEntries = assignMissingIds(importedData.repeatingEntries);
            }
            if(importedData.currency){
                currency = importedData.currency;
                const currencyEl = document.getElementById('currency');
                if(currencyEl) currencyEl.value = currency;
            }
            
            saveData();
            saveRepeats();
            alert('Data imported successfully!');
            renderEntries();
            closeSettingsModal();

        } catch(error) {
            alert('Error processing file: Invalid JSON format or missing data.');
            console.error('Import Error:', error);
        }
    };
    reader.onerror = function(e) {
        alert('Error reading file.');
    };
    reader.readAsText(file);
    event.target.value = null; 
}


// --- EXPOSE NECESSARY FUNCTIONS TO GLOBAL WINDOW SCOPE (for onclick in index.html) ---
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
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.toggleRepeat = toggleRepeat;
window.deleteEntry = deleteEntry;
window.closeMonthlyBalanceModal = closeMonthlyBalanceModal;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.openActionModal = openActionModal;
window.handleActionClick = handleActionClick;