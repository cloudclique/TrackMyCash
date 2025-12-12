/* ---------------------------------------------------------------------- */
/* --- 1. FIREBASE SETUP & IMPORTS -------------------------------------- */
/* ---------------------------------------------------------------------- */

import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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
export { initializeApp, getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, getFirestore, doc, setDoc, getDoc, sendEmailVerification }; // EXPORTED

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

const default_grapgh_days = 14;

export let entries = []; // EXPORTED
export let repeatingEntries = []; // EXPORTED
let editIndex = null;
let actionId = null; 
let currency = "$";
let selectedMonth = null;
let chart = null;
let monthlyChart = null;
let dailyChart = null; 
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

/**
 * Sends an email verification to the currently logged-in user.
 */
export async function sendVerificationEmail() { // EXPORTED
    const user = auth.currentUser;
    if (!user) {
        alert("No user is currently logged in.");
        return;
    }

    if (user.emailVerified) {
        alert("Your email is already verified.");
        return;
    }

    try {
        await sendEmailVerification(user);
        alert(`Verification email sent to ${user.email}! Please check your inbox.`);
    } catch (error) {
        console.error("Error sending verification email:", error);
        alert(`Failed to send verification email. Error: ${error.message}`);
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
  if (authStatusDiv && authStatusDiv.closest('.top-bar').querySelector('h1').innerText === '') {
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
      
      // --- START ADDED CODE: Clear Local Storage on Sign Out ---
      localStorage.removeItem('budgetEntries');
      localStorage.removeItem('budgetRepeats');
      // --- END ADDED CODE ---

      // If local storage has a currency setting, maintain that (This section now reads the cleared storage)
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
    // Re-render handled by the window-level call in the other script.
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
 * Calculates all specific dates within an arbitrary date range (start/end inclusive) for a single repeating entry.
 */
function getRepeatDatesForPeriod(entry, periodStartStr, periodEndStr) {
  const dates = [];
  const periodStartDate = new Date(periodStartStr + 'T00:00:00');
  const periodEndDate = new Date(periodEndStr + 'T00:00:00');
  
  const startDate = new Date(entry.start + 'T00:00:00');
  const endDate = entry.end ? new Date(entry.end + 'T00:00:00') : null;

  const interval = Number(entry.interval) || 1;
  const frequency = entry.frequency || 'months';

  let repeatCheckDate = new Date(startDate);
  
  // Find the first occurrence of the repeat entry that is >= periodStartDate
  while (repeatCheckDate < periodStartDate) {
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

      if (nextDate.getTime() <= repeatCheckDate.getTime()) break; 
      repeatCheckDate = nextDate;
  }
  
  // Now, iterate from the first occurrence within the period
  while (repeatCheckDate <= periodEndDate) {
    if (endDate && repeatCheckDate > endDate) break;

    const dateStr = `${repeatCheckDate.getFullYear()}-${String(repeatCheckDate.getMonth() + 1).padStart(2, '0')}-${String(repeatCheckDate.getDate()).padStart(2, '0')}`;
    dates.push(dateStr);

    // Calculate the next date
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
    
    if (nextDate.getTime() <= repeatCheckDate.getTime()) break;
    repeatCheckDate = nextDate;
  }
  
  return dates.filter(d => d >= periodStartStr && d <= periodEndStr).sort();
}


/**
 * Calculates all specific dates within a month (ym) for a single repeating entry.
 */
function getRepeatDatesForMonth(entry, ym) {
  const targetDateStart = ym + '-01';
  const targetDateEnd = new Date(new Date(ym.slice(0, 4), ym.slice(5, 7), 0));
  const targetDateEndStr = `${targetDateEnd.getFullYear()}-${String(targetDateEnd.getMonth() + 1).padStart(2, '0')}-${String(targetDateEnd.getDate()).padStart(2, '0')}`;
  
  return getRepeatDatesForPeriod(entry, targetDateStart, targetDateEndStr);
}

/* --- Repeats expanded for a selected month --- */
function getRepeatsForMonth(ym){
  if(!ym) return [];
  const monthStr = ym; 

  return repeatingEntries.flatMap(entry => {
    const startMonth = entry.start.slice(0,7);
    const endMonth = entry.end ? entry.end.slice(0,7) : null;
    
    // Check if the repeating entry is even valid for this month
    if(monthStr < startMonth) return [];
    if(endMonth && monthStr > endMonth) return [];

    const datesInMonth = getRepeatDatesForMonth(entry, ym);

    return datesInMonth.map(date => ({ 
      ...entry, 
      date: date, 
      isRepeat: true, 
      // Set 'excluded' flag based on the entry's excludeMonths array
      excluded: (entry.excludeMonths || []).includes(monthStr)
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
  const repeats = getRepeatsForMonth(selectedMonth); // Repeats now includes excluded entries with the 'excluded: true' flag
  
  // Calculate total balance up to today's date
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  totalBalance = getRunningBalanceUpToDate(todayStr);

  
  const combinedEntries = [...filteredEntries, ...repeats].sort((a, b) => {
      // Sort by date descending (most recent first: b.date > a.date)
      if (a.date < b.date) return 1; // b is newer, so b comes first
      if (a.date > b.date) return -1; // a is newer, so a comes first
      
      // Secondary sort: Non-repeats before repeats on the same day
      if (a.isRepeat && !b.isRepeat) return 1;
      if (!a.isRepeat && b.isRepeat) return -1;
      return 0;
  });

  combinedEntries.forEach(entry => {
    // Only count entries that are NOT excluded toward the displayed monthly balance
    if(!entry.excluded) monthlyBalance += (entry.type === 'income' ? entry.amount : -entry.amount);

    const tr = document.createElement('tr');
    // Use the excluded flag to style the row
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
  setDailyChartDefaultRange(); // NEW: Call the function to set default range and update chart
}

/* ---------------------------------------------------------------------- */
/* --- NEW: GENERAL BALANCE FUNCTIONALITY ------------------------------- */
/* ---------------------------------------------------------------------- */

/**
 * Calculates the total balance from all entries and repeats up to (but not including) the target date.
 */
function getRunningBalanceUpToDate(targetDateStr) {
    let balance = 0;
    
    // 1. Tally regular entries before the target date
    const pastEntries = entries.filter(e => e.date < targetDateStr);
    balance += pastEntries.reduce((s, e) => s + (e.type === 'income' ? e.amount : -e.amount), 0);

    // 2. Tally repeating entries before the target date
    const targetDate = new Date(targetDateStr + 'T00:00:00');
    
    const pastRepeats = repeatingEntries.flatMap(entry => {
        const repeats = [];
        let cur = new Date(entry.start + 'T00:00:00');
        const endLimit = entry.end ? new Date(entry.end + 'T00:00:00') : new Date(8640000000000000);
        
        const interval = Number(entry.interval) || 1;
        const frequency = entry.frequency || 'months';

        while (cur < targetDate && cur <= endLimit) { 
            const m = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
            const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
            
            if (!(entry.excludeMonths || []).includes(m)) {
                repeats.push({ ...entry, date: dateStr, isRepeat: true });
            }

            const nextDate = new Date(cur);
            if (frequency === 'days') nextDate.setDate(cur.getDate() + interval);
            else if (frequency === 'weeks') nextDate.setDate(cur.getDate() + interval * 7);
            else if (frequency === 'months') {
                const dayOfMonth = cur.getDate();
                nextDate.setMonth(cur.getMonth() + interval);
                if (nextDate.getDate() < dayOfMonth && nextDate.getMonth() !== (cur.getMonth() + interval) % 12) {
                    // Handle month rollover correctly
                    nextDate.setDate(0); 
                    nextDate.setMonth(cur.getMonth() + interval);
                }
            } else if (frequency === 'years') nextDate.setFullYear(cur.getFullYear() + interval);

            if (nextDate.getTime() <= cur.getTime()) break;
            cur = nextDate;
        }
        return repeats;
    });
    
    const uniquePastRepeats = pastRepeats.filter((r, index, self) => 
        index === self.findIndex((t) => (t.id === r.id && t.date === r.date))
    );

    balance += uniquePastRepeats.reduce((s, e) => s + (e.type === 'income' ? e.amount : -e.amount), 0);
    return balance;
}

/**
 * Calculates the total balance from all entries and repeats up to the day before the target month.
 * (Replaces old logic with a call to the new general function for compatibility with monthly chart)
 */
function getBalanceBeforeMonth(ym) {
    const targetDateStart = ym + '-01'; 
    return getRunningBalanceUpToDate(targetDateStart);
}

/* ---------------------------------------------------------------------- */
/* --- MODIFIED: DAILY BALANCE CHART FUNCTIONALITY (CUSTOM RANGE) ------- */
/* ---------------------------------------------------------------------- */

/**
 * Sets the date inputs and updates the daily chart to the default range (last 30 days).
 */
export function setDailyChartDefaultRange() { // EXPORTED
    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    const endDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (default_grapgh_days-1)); // 30 days including today
    const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
    
    const startInput = document.getElementById('dailyChartStartDate');
    const endInput = document.getElementById('dailyChartEndDate');
    
    if (startInput) startInput.value = startDateStr;
    if (endInput) endInput.value = endDateStr;

    updateDailyBalanceChart(startDateStr, endDateStr);
}

/**
 * Handles the click of the 'Apply' button for the daily chart range.
 */
export function handleDailyChartRangeChange() { // EXPOSED to window
    const startDateStr = document.getElementById('dailyChartStartDate').value;
    const endDateStr = document.getElementById('dailyChartEndDate').value;

    if (!startDateStr || !endDateStr) {
        alert("Please select both a start and an end date.");
        return;
    }

    updateDailyBalanceChart(startDateStr, endDateStr);
}

/**
 * Calculates and displays the cumulative balance for a custom date range.
 */
export function updateDailyBalanceChart(startDateStr, endDateStr){ 
  const chartEl = document.getElementById('dailyBalanceChart'); 
  if (!chartEl) return;
  
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');
  
  // Input validation (should also be checked in handleDailyChartRangeChange, but safe to double check)
  if (start.getTime() > end.getTime()) {
      // If custom dates are invalid, fall back to default
      setDailyChartDefaultRange(); 
      return; 
  }
  
  // Format the final range strings (T00:00:00 ensures correct date handling)
  const finalEndDateStr = endDateStr; 
  const finalStartDateStr = startDateStr;


  // 1. Calculate the starting balance (total balance up to the day before the window)
  const dayBeforeStartDate = new Date(start);
  dayBeforeStartDate.setDate(dayBeforeStartDate.getDate() - 1);
  const dayBeforeStartDateStr = `${dayBeforeStartDate.getFullYear()}-${String(dayBeforeStartDate.getMonth() + 1).padStart(2, '0')}-${String(dayBeforeStartDate.getDate()).padStart(2, '0')}`;
  let runningBalance = getRunningBalanceUpToDate(dayBeforeStartDateStr);

  // 2. Prepare daily data points and labels, and filter entries
  const dailyData = [];
  const dailyLabels = [];
  
  // Filter entries within the period (inclusive)
  const entriesInPeriod = entries.filter(e => e.date >= finalStartDateStr && e.date <= finalEndDateStr);

  // Generate a list of all dates in the range
  const dailyNet = new Map();
  let currentDate = new Date(start);
  currentDate.setHours(0,0,0,0); 

  while (currentDate.getTime() <= end.getTime()) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      dailyNet.set(dateStr, 0);
      currentDate.setDate(currentDate.getDate() + 1);
  }

  // Aggregate regular entries by date
  entriesInPeriod.forEach(e => {
    const net = e.type === 'income' ? e.amount : -e.amount;
    dailyNet.set(e.date, (dailyNet.get(e.date) || 0) + net);
  });

  // Aggregate repeating entries by date (only counting non-excluded ones)
  repeatingEntries.forEach(entry => {
    const datesInPeriod = getRepeatDatesForPeriod(entry, finalStartDateStr, finalEndDateStr);
    datesInPeriod.forEach(date => {
        const month = date.slice(0, 7);
        if (!(entry.excludeMonths || []).includes(month)) {
            const net = entry.type === 'income' ? entry.amount : -entry.amount;
            dailyNet.set(date, (dailyNet.get(date) || 0) + net);
        }
    });
  });

  // 3. Calculate cumulative balance day-by-day
  const sortedDates = Array.from(dailyNet.keys()).sort();
  
  for (const dateStr of sortedDates) {
    const netChange = dailyNet.get(dateStr) || 0;
    runningBalance += netChange;
    dailyData.push(runningBalance);
    // Use the short day/month label for better readability on the chart
    const d = new Date(dateStr + 'T00:00:00');
    dailyLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  
  // 4. Chart rendering
  if (dailyChart) dailyChart.destroy(); 
  
  // Update chart title to reflect the range
  const chartTitle = dailyLabels.length > 0 ? 
    `Cumulative Daily Balance: ${dailyLabels[0]} - ${dailyLabels[dailyLabels.length - 1]}` :
    `Cumulative Daily Balance (No data for selected range)`;

  const chartOptions = {
      responsive: true,
      maintainAspectRatio: true, 
      aspectRatio: 1.5,
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
              display: true,
              text: chartTitle,
              color: '#eee',
              font: { size: 16 }
          },
          tooltip: {
              callbacks: {
                  title: function(context) {
                       return dailyLabels[context[0].dataIndex];
                  },
                  label: function(context) {
                      return ` Balance: ${currency}${context.parsed.y.toFixed(2)}`;
                  }
              }
          }
      }
  };

  dailyChart = new Chart(chartEl, {
      type: 'line',
      data: {
          labels: dailyLabels,
          datasets: [{
              label: 'Cumulative Daily Balance',
              data: dailyData,
              borderColor: '#FFD700', // Gold color
              backgroundColor: 'rgba(255, 215, 0, 0.2)',
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              pointHoverRadius: 5
          }]
      },
      options: chartOptions
  });
}


/* ---------------------------------------------------------------------- */
/* --- MONTHLY BALANCE CHART (ORIGINAL CODE BELOW) ---------------------- */
/* ---------------------------------------------------------------------- */

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

  // Logic for finding the minimum date is complex due to repeats, 
  // we will simplify to start from the earliest entry or the current selected month if no entries exist.
  const allDates = entries.map(e => e.date).concat(repeatingEntries.map(e => e.start));
  const minDate = allDates.length > 0 ? allDates.reduce((min, d) => d < min ? d : min, allDates[0]) : selectedMonth + '-01';
  const firstMonth = minDate.slice(0, 7);
  
  const months = [];
  let currentMonth = new Date(firstMonth + '-01');
  const endMonth = new Date(selectedMonth + '-01');
  
  while (currentMonth <= endMonth) {
    months.push(`${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`);
    
    // Move to next month
    const currentM = currentMonth.getMonth();
    currentMonth.setMonth(currentM + 1);
    // Correct for month rollover if setting date to 1 caused an issue (not typical for setting month+1, but safe guard)
    if (currentMonth.getFullYear() * 12 + currentMonth.getMonth() > endMonth.getFullYear() * 12 + endMonth.getMonth()) {
        break; 
    }
  }
  
  let runningBalance = 0;
  const balanceData = months.map(monthYM => {
    const monthEntries = entries.filter(e => e.date.startsWith(monthYM));
    // Filter out explicitly excluded entries before calculating net
    const monthRepeats = getRepeatsForMonth(monthYM).filter(e => !e.excluded);
    const combined = [...monthEntries, ...monthRepeats];
    
    const monthlyNet = combined.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0);
    
    // The running balance calculation here is purely for the chart data point.
    // The "actual" total balance is calculated in renderEntries() using getRunningBalanceUpToDate().
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
window.closeActionModal = closeActionModal;
// Expose the function needed by the Manage Repeats page script
window.deleteRepeat = deleteRepeat; 
window.updateRepeatField = updateRepeatField;

// NEW EXPOSURES for Daily Chart Range:
window.handleDailyChartRangeChange = handleDailyChartRangeChange; 
window.setDailyChartDefaultRange = setDailyChartDefaultRange;

// EXPOSURE for Email Verification:
window.sendVerificationEmail = sendVerificationEmail;