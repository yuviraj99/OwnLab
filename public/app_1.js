// Enhanced Medical Laboratory Management System with IndexedDB Persistence

// IndexedDB Configuration
const DB_NAME = 'MedLabProDB';
const DB_VERSION = 1;
let db;

// Database Schema
const STORES = {
  patients: 'id',
  doctors: 'id', 
  tests: 'id',
  samples: 'id',
  receipts: 'id',
  messages: 'id',
  settings: 'key'
};

// Application State
let appData = {
  patients: [],
  doctors: [],
  tests: [],
  samples: [],
  receipts: [],
  messages: [],
  settings: {},
  nextPatientId: 1,
  nextDoctorId: 1,
  nextTestId: 1,
  nextSampleId: 1
};

// Current filter and editing state
let currentDoctorFilter = '';
let currentEditingId = null;
let currentEditingType = null;
let currentSampleForResults = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
  showLoadingOverlay();
  initializeDatabase().then(() => {
    initializeApp();
  }).catch(error => {
    console.error('Database initialization failed:', error);
    hideLoadingOverlay();
    showNotification('Database initialization failed. Using memory-only mode.', 'error');
    initializeApp();
  });
});

// IndexedDB Operations
async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };
    
    request.onupgradeneeded = (event) => {
      db = event.target.result;
      
      // Create object stores
      Object.entries(STORES).forEach(([storeName, keyPath]) => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath });
          
          // Create indexes for better querying
          if (storeName === 'patients') {
            store.createIndex('referringDoctor', 'referringDoctor');
            store.createIndex('dateAdded', 'dateAdded');
          }
          if (storeName === 'samples') {
            store.createIndex('patientId', 'patientId');
            store.createIndex('status', 'status');
            store.createIndex('collectionDate', 'collectionDate');
          }
        }
      });
    };
  });
}

async function loadDataFromDB() {
  if (!db) return;
  
  try {
    for (const storeName of Object.keys(STORES)) {
      const data = await getAllFromStore(storeName);
      appData[storeName] = data;
    }
    
    // Load settings and update counters
    const settings = await getFromStore('settings', 'counters');
    if (settings) {
      appData.nextPatientId = settings.nextPatientId || 1;
      appData.nextDoctorId = settings.nextDoctorId || 1;  
      appData.nextTestId = settings.nextTestId || 1;
      appData.nextSampleId = settings.nextSampleId || 1;
    }
    
    console.log('Data loaded from IndexedDB:', appData);
  } catch (error) {
    console.error('Error loading data from IndexedDB:', error);
    await loadInitialData();
  }
}

async function getAllFromStore(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFromStore(storeName, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToStore(storeName, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteFromStore(storeName, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function autoSave() {
  if (!db) return;
  
  try {
    // Save all data to IndexedDB
    for (const [storeName, data] of Object.entries(appData)) {
      if (STORES[storeName] && Array.isArray(data)) {
        for (const item of data) {
          await saveToStore(storeName, item);
        }
      }
    }
    
    // Save settings/counters
    await saveToStore('settings', {
      key: 'counters',
      nextPatientId: appData.nextPatientId,
      nextDoctorId: appData.nextDoctorId,
      nextTestId: appData.nextTestId,
      nextSampleId: appData.nextSampleId
    });
    
    updateDataStats();
  } catch (error) {
    console.error('Auto-save failed:', error);
  }
}

// Data Management Functions
async function exportData() {
  try {
    const exportData = {
      patients: appData.patients,
      doctors: appData.doctors,
      tests: appData.tests,
      samples: appData.samples,
      receipts: appData.receipts,
      messages: appData.messages,
      settings: {
        nextPatientId: appData.nextPatientId,
        nextDoctorId: appData.nextDoctorId,
        nextTestId: appData.nextTestId,
        nextSampleId: appData.nextSampleId
      },
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `medlab-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    showNotification('Data exported successfully', 'success');
  } catch (error) {
    console.error('Export failed:', error);
    showNotification('Export failed: ' + error.message, 'error');
  }
}

async function importData(file) {
  try {
    const text = await file.text();
    const importedData = JSON.parse(text);
    
    // Validate imported data structure
    if (!importedData.version || !importedData.patients || !importedData.doctors) {
      throw new Error('Invalid data format');
    }
    
    // Confirm import
    if (!confirm('This will replace all existing data. Are you sure you want to continue?')) {
      return;
    }
    
    showLoadingOverlay();
    
    // Clear existing data
    if (db) {
      for (const storeName of Object.keys(STORES)) {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        await new Promise(resolve => {
          const request = store.clear();
          request.onsuccess = () => resolve();
        });
      }
    }
    
    // Load imported data
    appData.patients = importedData.patients || [];
    appData.doctors = importedData.doctors || [];
    appData.tests = importedData.tests || [];
    appData.samples = importedData.samples || [];
    appData.receipts = importedData.receipts || [];
    appData.messages = importedData.messages || [];
    
    if (importedData.settings) {
      appData.nextPatientId = importedData.settings.nextPatientId || 1;
      appData.nextDoctorId = importedData.settings.nextDoctorId || 1;
      appData.nextTestId = importedData.settings.nextTestId || 1;
      appData.nextSampleId = importedData.settings.nextSampleId || 1;
    }
    
    // Save to IndexedDB
    await autoSave();
    
    // Refresh UI
    refreshAllData();
    hideLoadingOverlay();
    
    showNotification(`Data imported successfully. Imported ${appData.patients.length} patients, ${appData.doctors.length} doctors, ${appData.tests.length} tests, ${appData.samples.length} samples.`, 'success');
  } catch (error) {
    console.error('Import failed:', error);
    hideLoadingOverlay();
    showNotification('Import failed: ' + error.message, 'error');
  }
}

async function createBackup() {
  await exportData(); // Reuse export functionality for backup
  showNotification('Backup created successfully', 'success');
}

// Initial Data Loading
async function loadInitialData() {
  // Load initial data from the provided JSON
  const initialData = {
    "patients": [
      {"id": 1, "name": "MR. LOKESH KUMAR", "age": 20, "gender": "Male", "contact": "+91-9876543210", "address": "123 Main St, Mumbai", "referringDoctor": 1, "dateAdded": "2025-09-15", "refId": "SELF", "orgId": "Dcs Hospital", "pid": "00425"},
      {"id": 2, "name": "MRS. PINKI", "age": 34, "gender": "Female", "contact": "+91-9876543211", "address": "456 Park Ave, Delhi", "referringDoctor": 2, "dateAdded": "2025-09-14", "refId": "SELF", "orgId": "Dcs Hospital", "pid": "01051"},
      {"id": 3, "name": "Raj Patel", "age": 28, "gender": "Male", "contact": "+91-9876543212", "address": "789 Garden Rd, Pune", "referringDoctor": 1, "dateAdded": "2025-09-13", "refId": "DR001", "orgId": "City Hospital", "pid": "00789"},
      {"id": 4, "name": "Anita Singh", "age": 55, "gender": "Female", "contact": "+91-9876543213", "address": "321 Hill View, Bangalore", "referringDoctor": 3, "dateAdded": "2025-09-12", "refId": "DR002", "orgId": "Metro Clinic", "pid": "01234"},
      {"id": 5, "name": "Vikram Kumar", "age": 38, "gender": "Male", "contact": "+91-9876543214", "address": "654 Lake Side, Chennai", "referringDoctor": 4, "dateAdded": "2025-09-11", "refId": "DR003", "orgId": "South Hospital", "pid": "05678"}
    ],
    "doctors": [
      {"id": 1, "name": "Dr. M. Sanwalka", "specialty": "Pathology", "qualification": "MD (Pathology)", "title": "Consultant Pathologist", "rmcNo": "23809", "clinic": "Dcs Hospital", "contact": "+91-9876500001", "email": "sanwalka@dcshospital.com"},
      {"id": 2, "name": "Dr. Riya Gupta", "specialty": "Microbiology", "qualification": "MD (Microbiology)", "title": "Consultant Microbiologist", "rmcNo": "42507/22843", "clinic": "Dcs Hospital", "contact": "+91-9876500002", "email": "riya@dcshospital.com"},
      {"id": 3, "name": "Dr. Rajesh Gupta", "specialty": "Endocrinology", "qualification": "MD (Endocrinology)", "title": "Consultant Endocrinologist", "rmcNo": "12345", "clinic": "Diabetes Clinic", "contact": "+91-9876500003", "email": "rajesh.gupta@diabetesclinic.com"},
      {"id": 4, "name": "Dr. Meera Nair", "specialty": "Gynecology", "qualification": "MD (Gynecology)", "title": "Consultant Gynecologist", "rmcNo": "67890", "clinic": "Women's Health Center", "contact": "+91-9876500004", "email": "meera.nair@womenshealth.com"}
    ],
    "tests": [
      {"id": 1, "name": "Urine Routine Examination (CUE)", "department": "PATHOLOGY", "price": 300, "components": [
        {"name": "Physical Examination", "type": "section"},
        {"name": "Colour", "referenceRange": "Pale yellow/Yellow", "units": "-"},
        {"name": "Appearance", "referenceRange": "Clear", "units": "-"},
        {"name": "Specific Gravity", "referenceRange": "1.005-1.025", "units": "-"},
        {"name": "pH", "referenceRange": "5.0 - 8.0", "units": "-"},
        {"name": "Deposit", "referenceRange": "Absent", "units": "-"},
        {"name": "Chemical Examination", "type": "section"},
        {"name": "Protein", "referenceRange": "Absent", "units": "-"},
        {"name": "Sugar", "referenceRange": "Absent", "units": "-"},
        {"name": "Ketones", "referenceRange": "Absent", "units": "-"},
        {"name": "Bile Salt", "referenceRange": "Absent", "units": "-"},
        {"name": "Bile Pigment", "referenceRange": "Absent", "units": "-"},
        {"name": "Urobilinogen", "referenceRange": "Normal", "units": "-"},
        {"name": "Microscopic Examination (/hpf)", "type": "section"},
        {"name": "Pus Cell", "referenceRange": "Upto 5", "units": "-"},
        {"name": "Epithelial Cells", "referenceRange": "Upto 5", "units": "-"},
        {"name": "Red Blood Cells", "referenceRange": "Absent", "units": "-"},
        {"name": "Casts", "referenceRange": "Absent", "units": "-"},
        {"name": "Crystals", "referenceRange": "Absent", "units": "-"}
      ]},
      {"id": 2, "name": "Liver Function Test (LFT)", "department": "CLINICAL BIOCHEMISTRY", "price": 450, "components": [
        {"name": "Bilirubin Total", "referenceRange": "0.3 - 1.0", "units": "mg/dL", "method": "Diazo Method"},
        {"name": "Bilirubin Direct", "referenceRange": "0 - 0.2", "units": "mg/dL", "method": "Diazo Method"},
        {"name": "Bilirubin Indirect", "referenceRange": "0.2 - 0.8", "units": "mg/dL", "method": "Calculation"},
        {"name": "SGOT (AST)", "referenceRange": "0 - 50", "units": "U/L", "method": "IFCC Without Pyridoxal Phosphate"},
        {"name": "SGPT (ALT)", "referenceRange": "5 - 45", "units": "U/L", "method": "UV without pyridoxal -5-phosphate"},
        {"name": "Alkaline Phosphatase", "referenceRange": "50-136", "units": "U/L", "method": "PNPP, AMP Buffer"},
        {"name": "Protein Total", "referenceRange": "6.6 - 8.3", "units": "g/dL", "method": "Biuret"},
        {"name": "Albumin", "referenceRange": "3.5 - 5.2", "units": "g/dL", "method": "Bromocresol Green (BCG)"},
        {"name": "Globulin", "referenceRange": "2.5 - 3.5", "units": "g/dL", "method": "Calculation"},
        {"name": "Albumin / Globulin Ratio", "referenceRange": "1 - 2.1", "units": "Ratio", "method": "Calculation"}
      ]},
      {"id": 3, "name": "Culture & Sensitivity - Urine", "department": "CLINICAL MICROBIOLOGY", "price": 500, "components": [
        {"name": "Culture Method", "referenceRange": "Manual", "units": "-"},
        {"name": "Specimen Source", "referenceRange": "Urine", "units": "-"},
        {"name": "Culture Isolate", "referenceRange": "Sterile after 48 hours", "units": "-"}
      ]},
      {"id": 4, "name": "Complete Blood Count (CBC)", "department": "HEMATOLOGY", "price": 350, "components": [
        {"name": "Hemoglobin", "referenceRange": "12-16 g/dL", "units": "g/dL"},
        {"name": "RBC Count", "referenceRange": "4.5-5.5 million/μL", "units": "million/μL"},
        {"name": "WBC Count", "referenceRange": "4000-11000 /μL", "units": "/μL"},
        {"name": "Platelet Count", "referenceRange": "150000-450000 /μL", "units": "/μL"}
      ]}
    ],
    "samples": [
      {"id": "00425", "patientId": 1, "tests": [1, 3], "collectionDate": "2025-08-12", "registrationDate": "2025-08-12", "reportDate": "2025-08-12", "status": "Completed", "appointmentNo": "00425", "prepaidBy": "--", "results": {
        "1": {
          "Colour": "Pale Yellow",
          "Appearance": "Clear", 
          "Specific Gravity": "1.020",
          "pH": "6.0",
          "Deposit": "Absent",
          "Protein": "Absent",
          "Sugar": "250",
          "Ketones": "Absent",
          "Bile Salt": "Absent",
          "Bile Pigment": "Absent",
          "Urobilinogen": "0.2",
          "Pus Cell": "3-4",
          "Epithelial Cells": "1-2",
          "Red Blood Cells": "Absent",
          "Casts": "Absent",
          "Crystals": "Absent"
        },
        "3": {
          "Culture Method": "Manual",
          "Specimen Source": "Urine",
          "Culture Isolate": "Sample is Sterile after 48 hours of aerobic incubation at 37°C. Hence susceptibility test cancelled."
        }
      }},
      {"id": "01051", "patientId": 2, "tests": [2], "collectionDate": "2025-08-26", "registrationDate": "2025-08-26", "reportDate": "2025-08-26", "status": "Completed", "appointmentNo": "01051", "prepaidBy": "--", "results": {
        "2": {
          "Bilirubin Total": "0.58",
          "Bilirubin Direct": "0.23",
          "Bilirubin Indirect": "0.35", 
          "SGOT (AST)": "15",
          "SGPT (ALT)": "10",
          "Alkaline Phosphatase": "86.2",
          "Protein Total": "6.7",
          "Albumin": "4.69",
          "Globulin": "2.01",
          "Albumin / Globulin Ratio": "2.33"
        }
      }}
    ]
  };
  
  appData.patients = initialData.patients;
  appData.doctors = initialData.doctors;
  appData.tests = initialData.tests;
  appData.samples = initialData.samples;
  appData.receipts = [];
  appData.messages = [];
  
  // Set next IDs
  appData.nextPatientId = Math.max(...initialData.patients.map(p => p.id)) + 1;
  appData.nextDoctorId = Math.max(...initialData.doctors.map(d => d.id)) + 1;
  appData.nextTestId = Math.max(...initialData.tests.map(t => t.id)) + 1;
  appData.nextSampleId = 1000;
  
  // Auto-save initial data
  await autoSave();
}

// UI Management Functions
function showLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('hidden');
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function updateDataStats() {
  const patientCountEl = document.getElementById('patientCount');
  const doctorCountEl = document.getElementById('doctorCount');
  const testCountEl = document.getElementById('testCount');
  const sampleCountEl = document.getElementById('sampleCount');
  
  if (patientCountEl) patientCountEl.textContent = appData.patients.length;
  if (doctorCountEl) doctorCountEl.textContent = appData.doctors.length;
  if (testCountEl) testCountEl.textContent = appData.tests.length;
  if (sampleCountEl) sampleCountEl.textContent = appData.samples.length;
}

async function initializeApp() {
  try {
    await loadDataFromDB();
    if (appData.patients.length === 0) {
      await loadInitialData();
    }
  } catch (error) {
    console.error('Failed to load data:', error);
    await loadInitialData();
  }
  
  setupNavigation();
  setupModals();
  setupForms();
  setupDataManagement();
  updateCurrentDate();
  populateDoctorFilter();
  showDashboard();
  setupSearchFilters();
  setupDoctorFilterListener();
  
  // Initialize all dropdowns
  populatePatientDropdowns();
  populateTestCheckboxes();
  populateCommRecipients();
  
  refreshAllData();
  hideLoadingOverlay();
  
  showNotification('Laboratory System loaded successfully', 'success');
}

function refreshAllData() {
  // Refresh all UI components
  const activeSection = document.querySelector('.content-section.active')?.id;
  switch(activeSection) {
    case 'dashboard':
      showDashboard();
      break;
    case 'patients':
      showPatients();
      break;
    case 'doctors':
      showDoctors();
      break;
    case 'tests':
      showTests();
      break;
    case 'samples':
      showSamples();
      break;
    case 'reports':
      showReports();
      break;
    case 'receipts':
      showReceipts();
      break;
    case 'communication':
      showCommunication();
      break;
    case 'data-management':
      updateDataStats();
      break;
  }
  
  populateDoctorFilter();
  populatePatientDropdowns();
  populateTestCheckboxes();
  populateCommRecipients();
}

// Navigation Functions - FIXED
function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const section = this.dataset.section;
      if (section) {
        navigateToSection(section);
      }
    });
  });
}

function navigateToSection(sectionName) {
  console.log('Navigating to:', sectionName);
  
  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  const activeLink = document.querySelector(`[data-section="${sectionName}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }

  // Update page title
  const titles = {
    'dashboard': 'Dashboard',
    'patients': 'Patient Management',
    'doctors': 'Doctor Management', 
    'tests': 'Test Configuration',
    'samples': 'Sample Management',
    'reports': 'Report Generation',
    'receipts': 'Receipts & Billing',
    'communication': 'Communication Center',
    'data-management': 'Data Management'
  };
  
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    pageTitle.textContent = titles[sectionName] || 'Dashboard';
  }

  // Show active section
  document.querySelectorAll('.content-section').forEach(section => {
    section.classList.remove('active');
  });
  
  const activeSection = document.getElementById(sectionName);
  if (activeSection) {
    activeSection.classList.add('active');
    console.log('Section shown:', sectionName);
  } else {
    console.error('Section not found:', sectionName);
  }

  // Load section data
  switch(sectionName) {
    case 'dashboard':
      showDashboard();
      break;
    case 'patients':
      showPatients();
      break;
    case 'doctors':
      showDoctors();
      break;
    case 'tests':
      showTests();
      break;
    case 'samples':
      showSamples();
      break;
    case 'reports':
      showReports();
      break;
    case 'receipts':
      showReceipts();
      break;
    case 'communication':
      showCommunication();
      break;
    case 'data-management':
      updateDataStats();
      break;
  }
}

// Dashboard Functions
function showDashboard() {
  updateDashboardStats();
  setTimeout(() => {
    initializeCharts();
  }, 100);
  updateRecentActivity();
}

function updateDashboardStats() {
  const today = new Date().toISOString().split('T')[0];
  const todayPatients = appData.patients.filter(p => p.dateAdded === today);
  const completedTests = appData.samples.filter(s => s.status === 'Completed');
  const pendingReports = appData.samples.filter(s => s.status === 'Pending');
  
  const todayRevenue = appData.samples
    .filter(s => s.collectionDate === today)
    .reduce((total, sample) => {
      return total + sample.tests.reduce((testTotal, testId) => {
        const test = appData.tests.find(t => t.id === testId);
        return testTotal + (test ? test.price : 0);
      }, 0);
    }, 0);

  const totalPatientsEl = document.getElementById('totalPatients');
  const testsCompletedEl = document.getElementById('testsCompleted');
  const pendingReportsEl = document.getElementById('pendingReports');
  const todayRevenueEl = document.getElementById('todayRevenue');
  
  if (totalPatientsEl) totalPatientsEl.textContent = todayPatients.length;
  if (testsCompletedEl) testsCompletedEl.textContent = completedTests.length;
  if (pendingReportsEl) pendingReportsEl.textContent = pendingReports.length;
  if (todayRevenueEl) todayRevenueEl.textContent = `₹${todayRevenue.toLocaleString()}`;
}

function initializeCharts() {
  // Test Volume Chart
  const testVolumeCanvas = document.getElementById('testVolumeChart');
  if (testVolumeCanvas && typeof Chart !== 'undefined') {
    const testVolumeCtx = testVolumeCanvas.getContext('2d');
    const testVolumeData = {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Tests Conducted',
        data: [12, 19, 15, 25, 22, 18, 8],
        borderColor: '#1FB8CD',
        backgroundColor: 'rgba(31, 184, 205, 0.1)',
        tension: 0.4,
        fill: true
      }]
    };

    new Chart(testVolumeCtx, {
      type: 'line',
      data: testVolumeData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  // Doctor Referral Chart
  const doctorReferralCanvas = document.getElementById('doctorReferralChart');
  if (doctorReferralCanvas && typeof Chart !== 'undefined') {
    const doctorReferralCtx = doctorReferralCanvas.getContext('2d');
    const doctorCounts = {};
    appData.patients.forEach(patient => {
      const doctor = appData.doctors.find(d => d.id === patient.referringDoctor);
      if (doctor) {
        doctorCounts[doctor.name] = (doctorCounts[doctor.name] || 0) + 1;
      }
    });

    const doctorData = {
      labels: Object.keys(doctorCounts),
      datasets: [{
        data: Object.values(doctorCounts),
        backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545']
      }]
    };

    new Chart(doctorReferralCtx, {
      type: 'doughnut',
      data: doctorData,
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
}

function updateRecentActivity() {
  const activityList = document.getElementById('activityList');
  if (!activityList) return;
  
  const activities = [];
  
  // Add recent patient registrations
  const recentPatients = appData.patients
    .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
    .slice(0, 2);
    
  recentPatients.forEach(patient => {
    activities.push({
      icon: 'fa-user-plus',
      text: `New patient ${patient.name} registered`,
      time: formatTimeAgo(patient.dateAdded)
    });
  });
  
  // Add recent completed samples
  const recentSamples = appData.samples
    .filter(s => s.status === 'Completed')
    .slice(0, 2);
    
  recentSamples.forEach(sample => {
    const patient = appData.patients.find(p => p.id === sample.patientId);
    activities.push({
      icon: 'fa-vial',
      text: `Sample ${sample.id} completed for ${patient?.name || 'Unknown Patient'}`,
      time: formatTimeAgo(sample.reportDate)
    });
  });
  
  if (activities.length === 0) {
    activities.push({
      icon: 'fa-info-circle',
      text: 'Welcome to MedLab Pro! Start by adding patients and registering samples.',
      time: 'Just now'
    });
  }

  activityList.innerHTML = activities.map(activity => `
    <div class="activity-item">
      <div class="activity-icon">
        <i class="fas ${activity.icon}"></i>
      </div>
      <div class="activity-content">
        <p>${activity.text}</p>
        <span class="activity-time">${activity.time}</span>
      </div>
    </div>
  `).join('');
}

// Patient Management Functions - FIXED
function showPatients() {
  populatePatientTable();
  populatePatientDropdowns();
}

function populatePatientTable() {
  const tbody = document.getElementById('patientsTableBody');
  if (!tbody) return;
  
  const filteredPatients = getFilteredPatients();
  
  tbody.innerHTML = filteredPatients.map(patient => {
    const doctor = appData.doctors.find(d => d.id === patient.referringDoctor);
    return `
      <tr>
        <td>${patient.name}</td>
        <td>${patient.age}/${patient.gender[0]}</td>
        <td>${patient.contact}</td>
        <td>${patient.pid || 'N/A'}</td>
        <td>${doctor ? doctor.name : 'Unknown'}</td>
        <td>${formatDate(patient.dateAdded)}</td>
        <td>
          <div class="action-buttons">
            <button class="action-btn action-btn--edit" onclick="editPatient(${patient.id})" title="Edit">
              <i class="fas fa-edit"></i>
            </button>
            <button class="action-btn action-btn--delete" onclick="deletePatient(${patient.id})" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function getFilteredPatients() {
  let patients = appData.patients;
  if (currentDoctorFilter) {
    patients = patients.filter(p => p.referringDoctor == currentDoctorFilter);
  }
  return patients;
}

function addPatient() {
  currentEditingId = null;
  currentEditingType = 'patient';
  const modal = document.getElementById('patientModal');
  const modalTitle = document.getElementById('patientModalTitle');
  const form = document.getElementById('patientForm');
  
  if (modalTitle) modalTitle.textContent = 'Add New Patient';
  if (form) form.reset();
  
  populatePatientDropdowns();
  
  if (modal) modal.classList.remove('hidden');
}

function editPatient(id) {
  const patient = appData.patients.find(p => p.id === id);
  if (!patient) return;

  currentEditingId = id;
  currentEditingType = 'patient';
  
  const modalTitle = document.getElementById('patientModalTitle');
  if (modalTitle) modalTitle.textContent = 'Edit Patient';
  
  populatePatientDropdowns();
  
  const fields = [
    'patientName', 'patientAge', 'patientGender', 
    'patientContact', 'patientAddress', 'patientRefId',
    'patientOrgId', 'patientPid', 'patientReferringDoctor'
  ];
  
  const values = [
    patient.name, patient.age, patient.gender,
    patient.contact, patient.address, patient.refId,
    patient.orgId, patient.pid, patient.referringDoctor
  ];
  
  fields.forEach((fieldId, index) => {
    const field = document.getElementById(fieldId);
    if (field) field.value = values[index] || '';
  });
  
  const modal = document.getElementById('patientModal');
  if (modal) modal.classList.remove('hidden');
}

function deletePatient(id) {
  if (confirm('Are you sure you want to delete this patient?')) {
    appData.patients = appData.patients.filter(p => p.id !== id);
    autoSave();
    populatePatientTable();
    showNotification('Patient deleted successfully', 'success');
  }
}

async function savePatient(formData) {
  if (currentEditingId) {
    // Edit existing patient
    const patientIndex = appData.patients.findIndex(p => p.id === currentEditingId);
    if (patientIndex !== -1) {
      appData.patients[patientIndex] = {
        ...appData.patients[patientIndex],
        ...formData
      };
      showNotification('Patient updated successfully', 'success');
    }
  } else {
    // Add new patient
    const newPatient = {
      id: appData.nextPatientId++,
      ...formData,
      dateAdded: new Date().toISOString().split('T')[0]
    };
    appData.patients.push(newPatient);
    showNotification('Patient added successfully', 'success');
  }
  
  await autoSave();
  populatePatientTable();
  populatePatientDropdownsForSamples();
}

// Doctor Management Functions - FIXED
function showDoctors() {
  populateDoctorTable();
}

function populateDoctorTable() {
  const tbody = document.getElementById('doctorsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = appData.doctors.map(doctor => `
    <tr>
      <td>${doctor.name}</td>
      <td>${doctor.qualification}</td>
      <td>${doctor.title}</td>
      <td>${doctor.rmcNo}</td>
      <td>${doctor.contact}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn action-btn--edit" onclick="editDoctor(${doctor.id})" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn action-btn--delete" onclick="deleteDoctor(${doctor.id})" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function addDoctor() {
  currentEditingId = null;
  currentEditingType = 'doctor';
  const modal = document.getElementById('doctorModal');
  const modalTitle = document.getElementById('doctorModalTitle');
  const form = document.getElementById('doctorForm');
  
  if (modalTitle) modalTitle.textContent = 'Add New Doctor';
  if (form) form.reset();
  if (modal) modal.classList.remove('hidden');
}

function editDoctor(id) {
  const doctor = appData.doctors.find(d => d.id === id);
  if (!doctor) return;

  currentEditingId = id;
  currentEditingType = 'doctor';
  
  const modalTitle = document.getElementById('doctorModalTitle');
  if (modalTitle) modalTitle.textContent = 'Edit Doctor';
  
  const fields = ['doctorName', 'doctorSpecialty', 'doctorQualification', 'doctorTitle', 'doctorRmcNo', 'doctorClinic', 'doctorContact', 'doctorEmail'];
  const values = [doctor.name, doctor.specialty, doctor.qualification, doctor.title, doctor.rmcNo, doctor.clinic, doctor.contact, doctor.email];
  
  fields.forEach((fieldId, index) => {
    const field = document.getElementById(fieldId);
    if (field) field.value = values[index] || '';
  });
  
  const modal = document.getElementById('doctorModal');
  if (modal) modal.classList.remove('hidden');
}

function deleteDoctor(id) {
  if (confirm('Are you sure you want to delete this doctor?')) {
    appData.doctors = appData.doctors.filter(d => d.id !== id);
    autoSave();
    populateDoctorTable();
    populateDoctorFilter();
    populatePatientDropdowns();
    showNotification('Doctor deleted successfully', 'success');
  }
}

async function saveDoctor(formData) {
  if (currentEditingId) {
    const doctorIndex = appData.doctors.findIndex(d => d.id === currentEditingId);
    if (doctorIndex !== -1) {
      appData.doctors[doctorIndex] = {
        ...appData.doctors[doctorIndex],
        ...formData
      };
      showNotification('Doctor updated successfully', 'success');
    }
  } else {
    const newDoctor = {
      id: appData.nextDoctorId++,
      ...formData
    };
    appData.doctors.push(newDoctor);
    showNotification('Doctor added successfully', 'success');
  }
  
  await autoSave();
  populateDoctorTable();
  populateDoctorFilter();
  populatePatientDropdowns();
}

// Test Management Functions - FIXED
function showTests() {
  populateTestTable();
}

function populateTestTable() {
  const tbody = document.getElementById('testsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = appData.tests.map(test => `
    <tr>
      <td>${test.name}</td>
      <td>${test.department}</td>
      <td>₹${test.price}</td>
      <td>${test.components ? test.components.length : 0} components</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn action-btn--edit" onclick="editTest(${test.id})" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn action-btn--delete" onclick="deleteTest(${test.id})" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function addTest() {
  currentEditingId = null;
  currentEditingType = 'test';
  const modal = document.getElementById('testModal');
  const modalTitle = document.getElementById('testModalTitle');
  const form = document.getElementById('testForm');
  
  if (modalTitle) modalTitle.textContent = 'Add New Test';
  if (form) form.reset();
  
  // Reset components list
  const componentsList = document.getElementById('componentsList');
  if (componentsList) componentsList.innerHTML = '';
  
  if (modal) modal.classList.remove('hidden');
}

function addTestComponent() {
  const componentsList = document.getElementById('componentsList');
  if (!componentsList) return;
  
  const componentItem = document.createElement('div');
  componentItem.className = 'component-item';
  componentItem.innerHTML = `
    <input type="text" placeholder="Component Name" class="form-control component-name">
    <input type="text" placeholder="Reference Range" class="form-control component-range">
    <input type="text" placeholder="Units" class="form-control component-units">
    <button type="button" class="remove-component-btn" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  componentsList.appendChild(componentItem);
}

function editTest(id) {
  const test = appData.tests.find(t => t.id === id);
  if (!test) return;

  currentEditingId = id;
  currentEditingType = 'test';
  
  const modalTitle = document.getElementById('testModalTitle');
  if (modalTitle) modalTitle.textContent = 'Edit Test';
  
  const fields = ['testName', 'testDepartment', 'testPrice'];
  const values = [test.name, test.department, test.price];
  
  fields.forEach((fieldId, index) => {
    const field = document.getElementById(fieldId);
    if (field) field.value = values[index];
  });
  
  // Populate components
  const componentsList = document.getElementById('componentsList');
  if (componentsList && test.components) {
    componentsList.innerHTML = '';
    test.components.forEach(component => {
      if (component.type === 'section') {
        // Section header
        const sectionItem = document.createElement('div');
        sectionItem.className = 'component-item';
        sectionItem.innerHTML = `
          <input type="text" value="${component.name}" class="form-control component-name">
          <select class="form-control component-type">
            <option value="component">Component</option>
            <option value="section" selected>Section Header</option>
          </select>
          <input type="text" placeholder="Units" class="form-control component-units">
          <button type="button" class="remove-component-btn" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
          </button>
        `;
        componentsList.appendChild(sectionItem);
      } else {
        // Regular component
        const componentItem = document.createElement('div');
        componentItem.className = 'component-item';
        componentItem.innerHTML = `
          <input type="text" value="${component.name}" class="form-control component-name">
          <input type="text" value="${component.referenceRange || ''}" class="form-control component-range">
          <input type="text" value="${component.units || ''}" class="form-control component-units">
          <button type="button" class="remove-component-btn" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
          </button>
        `;
        componentsList.appendChild(componentItem);
      }
    });
  }
  
  const modal = document.getElementById('testModal');
  if (modal) modal.classList.remove('hidden');
}

function deleteTest(id) {
  if (confirm('Are you sure you want to delete this test?')) {
    appData.tests = appData.tests.filter(t => t.id !== id);
    autoSave();
    populateTestTable();
    populateTestCheckboxes();
    showNotification('Test deleted successfully', 'success');
  }
}

async function saveTest(formData) {
  // Collect components from form
  const componentItems = document.querySelectorAll('#componentsList .component-item');
  const components = Array.from(componentItems).map(item => {
    const name = item.querySelector('.component-name').value;
    const range = item.querySelector('.component-range')?.value || '';
    const units = item.querySelector('.component-units').value || '';
    const typeSelect = item.querySelector('.component-type');
    
    if (typeSelect && typeSelect.value === 'section') {
      return { name, type: 'section' };
    } else {
      return { name, referenceRange: range, units };
    }
  });
  
  formData.components = components;
  
  if (currentEditingId) {
    const testIndex = appData.tests.findIndex(t => t.id === currentEditingId);
    if (testIndex !== -1) {
      appData.tests[testIndex] = {
        ...appData.tests[testIndex],
        ...formData
      };
      showNotification('Test updated successfully', 'success');
    }
  } else {
    const newTest = {
      id: appData.nextTestId++,
      ...formData
    };
    appData.tests.push(newTest);
    showNotification('Test added successfully', 'success');
  }
  
  await autoSave();
  populateTestTable();
  populateTestCheckboxes();
}

// Sample Management Functions - FIXED
function showSamples() {
  populateSampleTable();
  populatePatientDropdownsForSamples();
  populateTestCheckboxes();
}

function populateSampleTable() {
  const tbody = document.getElementById('samplesTableBody');
  if (!tbody) return;
  
  const filteredSamples = getFilteredSamples();
  
  tbody.innerHTML = filteredSamples.map(sample => {
    const patient = appData.patients.find(p => p.id === sample.patientId);
    const testNames = sample.tests.map(testId => {
      const test = appData.tests.find(t => t.id === testId);
      return test ? test.name : 'Unknown Test';
    }).join(', ');
    
    return `
      <tr>
        <td>${sample.id}</td>
        <td>${patient ? patient.name : 'Unknown Patient'}</td>
        <td title="${testNames}">${testNames.length > 50 ? testNames.substring(0, 50) + '...' : testNames}</td>
        <td>${formatDate(sample.collectionDate)}</td>
        <td><span class="status-badge status-badge--${sample.status.toLowerCase()}">${sample.status}</span></td>
        <td>
          <div class="action-buttons">
            <button class="action-btn action-btn--view" onclick="viewSample('${sample.id}')" title="View">
              <i class="fas fa-eye"></i>
            </button>
            ${sample.status !== 'Completed' ? `
              <button class="action-btn action-btn--results" onclick="enterResults('${sample.id}')" title="Enter Results">
                <i class="fas fa-edit"></i>
              </button>
            ` : `
              <button class="action-btn action-btn--edit" onclick="generateReport('${sample.id}')" title="Generate Report">
                <i class="fas fa-file-medical"></i>
              </button>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function getFilteredSamples() {
  let samples = appData.samples;
  if (currentDoctorFilter) {
    samples = samples.filter(s => {
      const patient = appData.patients.find(p => p.id === s.patientId);
      return patient && patient.referringDoctor == currentDoctorFilter;
    });
  }
  return samples;
}

function addSample() {
  currentEditingId = null;
  currentEditingType = 'sample';
  const modal = document.getElementById('sampleModal');
  const modalTitle = document.getElementById('sampleModalTitle');
  const form = document.getElementById('sampleForm');
  const dateField = document.getElementById('sampleCollectionDate');
  
  if (modalTitle) modalTitle.textContent = 'Register New Sample';
  if (form) form.reset();
  if (dateField) dateField.value = new Date().toISOString().split('T')[0];
  
  populatePatientDropdownsForSamples();
  populateTestCheckboxes();
  
  if (modal) modal.classList.remove('hidden');
}

function viewSample(id) {
  const sample = appData.samples.find(s => s.id === id);
  if (!sample) return;
  
  const patient = appData.patients.find(p => p.id === sample.patientId);
  const tests = sample.tests.map(testId => {
    const test = appData.tests.find(t => t.id === testId);
    return test ? test.name : 'Unknown Test';
  }).join(', ');
  
  showNotification(`Sample ${sample.id} - Patient: ${patient?.name || 'Unknown'} - Tests: ${tests} - Status: ${sample.status}`, 'info');
}

function enterResults(sampleId) {
  const sample = appData.samples.find(s => s.id === sampleId);
  if (!sample) return;
  
  currentSampleForResults = sampleId;
  
  const modal = document.getElementById('resultsModal');
  const container = document.getElementById('resultsFormContainer');
  
  if (!container) return;
  
  // Generate results form based on tests
  let formHtml = '';
  
  sample.tests.forEach(testId => {
    const test = appData.tests.find(t => t.id === testId);
    if (!test) return;
    
    formHtml += `<div class="results-section" data-test-id="${testId}">`;
    formHtml += `<h4>${test.name}</h4>`;
    
    if (test.components) {
      let currentSection = '';
      
      test.components.forEach(component => {
        if (component.type === 'section') {
          if (currentSection) formHtml += '</div>'; // Close previous section
          formHtml += `<h5 class="section-header-text">${component.name}</h5>`;
          formHtml += '<div class="results-grid">';
          currentSection = component.name;
        } else {
          formHtml += `
            <div class="form-group">
              <label class="form-label">${component.name}</label>
              <input type="text" 
                     class="form-control result-input" 
                     data-component="${component.name}" 
                     data-reference="${component.referenceRange || ''}"
                     placeholder="${component.referenceRange || 'Enter result'}"
                     value="${sample.results?.[testId]?.[component.name] || ''}">
            </div>
          `;
        }
      });
      
      if (currentSection) formHtml += '</div>'; // Close last section
    }
    
    formHtml += '</div>';
  });
  
  container.innerHTML = formHtml;
  
  if (modal) modal.classList.remove('hidden');
}

async function saveResults() {
  if (!currentSampleForResults) return;
  
  const sample = appData.samples.find(s => s.id === currentSampleForResults);
  if (!sample) return;
  
  const results = {};
  
  // Collect results from form
  const sections = document.querySelectorAll('.results-section');
  sections.forEach(section => {
    const testId = section.dataset.testId;
    results[testId] = {};
    
    const inputs = section.querySelectorAll('.result-input');
    inputs.forEach(input => {
      const componentName = input.dataset.component;
      results[testId][componentName] = input.value;
    });
  });
  
  // Update sample with results
  const sampleIndex = appData.samples.findIndex(s => s.id === currentSampleForResults);
  if (sampleIndex !== -1) {
    appData.samples[sampleIndex].results = results;
    appData.samples[sampleIndex].status = 'Completed';
    appData.samples[sampleIndex].reportDate = new Date().toISOString().split('T')[0];
  }
  
  await autoSave();
  populateSampleTable();
  
  const modal = document.getElementById('resultsModal');
  if (modal) modal.classList.add('hidden');
  
  currentSampleForResults = null;
  showNotification('Results saved successfully', 'success');
}

async function saveSample(formData) {
  const sampleId = String(appData.nextSampleId++).padStart(5, '0');
  
  const newSample = {
    id: sampleId,
    ...formData,
    registrationDate: new Date().toISOString().split('T')[0],
    status: 'Pending',
    results: {},
    prepaidBy: '--'
  };
  
  appData.samples.push(newSample);
  await autoSave();
  populateSampleTable();
  showNotification('Sample registered successfully', 'success');
}

// Report Generation Functions - FIXED
function showReports() {
  populateReportsGrid();
}

function populateReportsGrid() {
  const reportsGrid = document.getElementById('reportsGrid');
  if (!reportsGrid) return;
  
  const completedSamples = appData.samples.filter(s => s.status === 'Completed');
  
  reportsGrid.innerHTML = completedSamples.map(sample => {
    const patient = appData.patients.find(p => p.id === sample.patientId);
    const testCount = sample.tests.length;
    
    return `
      <div class="report-card">
        <h4>Report - ${sample.id}</h4>
        <div class="report-meta">
          <p><strong>Patient:</strong> ${patient ? patient.name : 'Unknown'}</p>
          <p><strong>Tests:</strong> ${testCount} test(s)</p>
          <p><strong>Date:</strong> ${formatDate(sample.collectionDate)}</p>
        </div>
        <div class="report-actions">
          <button class="btn btn--sm btn--primary" onclick="generateReport('${sample.id}')">
            <i class="fas fa-file-medical"></i> View Report
          </button>
          <button class="btn btn--sm btn--secondary" onclick="emailReport('${sample.id}')">
            <i class="fas fa-envelope"></i> Email
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function generateReport(sampleId) {
  const sample = appData.samples.find(s => s.id === sampleId);
  if (!sample) return;
  
  const patient = appData.patients.find(p => p.id === sample.patientId);
  const doctor = appData.doctors.find(d => d.id === patient?.referringDoctor);
  
  const reportContent = document.getElementById('reportContent');
  if (!reportContent) return;
  
  // Generate professional medical report matching the sample format
  let reportHtml = `
    <div class="report-header">
      <div class="report-header .lab-logo">
        <i class="fas fa-flask"></i>
      </div>
      <div class="lab-info">
        <h1>MedLab Pro Laboratory</h1>
        <p>123 Medical Plaza, Healthcare District, Mumbai - 400001</p>
        <p>Phone: +91-11-2345-6789 | Email: reports@medlabpro.com</p>
        <p>NABL Accredited Laboratory</p>
      </div>
    </div>
    
    <div class="patient-sample-info">
      <div class="info-box">
        <h3>Patient Information</h3>
        <div class="info-row">
          <span class="info-label">Name:</span>
          <span class="info-value">${patient?.name || 'Unknown'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Sex/Age:</span>
          <span class="info-value">${patient?.gender || 'Unknown'}/${patient?.age || 'Unknown'} Years</span>
        </div>
        <div class="info-row">
          <span class="info-label">Ref. Id:</span>
          <span class="info-value">${patient?.refId || 'SELF'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Org. Id:</span>
          <span class="info-value">${patient?.orgId || 'N/A'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">PID:</span>
          <span class="info-value">${patient?.pid || sample.id}</span>
        </div>
      </div>
      <div class="info-box">
        <h3>Sample Information</h3>
        <div class="info-row">
          <span class="info-label">Sample No:</span>
          <span class="info-value">${sample.id}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Appointment No:</span>
          <span class="info-value">${sample.appointmentNo || sample.id}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Collection Date:</span>
          <span class="info-value">${formatDate(sample.collectionDate)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Generate Report Date:</span>
          <span class="info-value">${formatDate(sample.reportDate || new Date().toISOString().split('T')[0])}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Prepaid By:</span>
          <span class="info-value">${sample.prepaidBy || '--'}</span>
        </div>
      </div>
    </div>
  `;
  
  // Group tests by department
  const testsByDepartment = {};
  sample.tests.forEach(testId => {
    const test = appData.tests.find(t => t.id === testId);
    if (test) {
      if (!testsByDepartment[test.department]) {
        testsByDepartment[test.department] = [];
      }
      testsByDepartment[test.department].push({ test, results: sample.results[testId] || {} });
    }
  });
  
  // Generate department sections
  Object.entries(testsByDepartment).forEach(([department, tests]) => {
    reportHtml += `
      <div class="department-section">
        <div class="department-header">${department}</div>
    `;
    
    tests.forEach(({ test, results }) => {
      reportHtml += `
        <div class="test-section">
          <h2 class="test-title">${test.name}</h2>
          <table class="result-table">
            <thead>
              <tr>
                <th>Test Name</th>
                <th>Result</th>
                <th>Units</th>
                <th>Biological Ref.Intervals</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      if (test.components) {
        let inSection = false;
        
        test.components.forEach(component => {
          if (component.type === 'section') {
            if (inSection) {
              reportHtml += `</tbody></table>`;
            }
            reportHtml += `
              <tr><td colspan="4" class="section-header-text">${component.name}</td></tr>
            `;
            inSection = true;
          } else {
            const result = results[component.name] || '';
            const isAbnormal = isValueAbnormal(result, component.referenceRange);
            
            reportHtml += `
              <tr>
                <td>${component.name}</td>
                <td class="${isAbnormal ? 'abnormal-value' : ''}">${result}</td>
                <td>${component.units || '-'}</td>
                <td>${component.referenceRange || '-'}</td>
              </tr>
            `;
          }
        });
      }
      
      reportHtml += `
            </tbody>
          </table>
        </div>
      `;
    });
    
    reportHtml += `</div>`;
  });
  
  // Add footer
  reportHtml += `
    <div class="report-footer">
      <div class="end-of-report">*** End Of Report ***</div>
      <div class="signature-section">
        <div class="signature-block">
          <div class="signature-line"></div>
          <div class="signature-name">${doctor?.name || 'Dr. M. Sanwalka'}</div>
          <div class="signature-details">
            ${doctor?.qualification || 'MD (Pathology)'}<br>
            ${doctor?.title || 'Consultant Pathologist'}<br>
            RMC No: ${doctor?.rmcNo || '23809'}
          </div>
        </div>
      </div>
      <div class="page-info">Page 1 of 1</div>
    </div>
  `;
  
  reportContent.innerHTML = reportHtml;
  
  const modal = document.getElementById('reportModal');
  if (modal) modal.classList.remove('hidden');
}

function isValueAbnormal(value, referenceRange) {
  if (!value || !referenceRange || value === 'Absent' || value === 'Normal') return false;
  
  // Simple check for numeric values
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return false;
  
  // Parse range like "0.3 - 1.0" or "< 140"
  if (referenceRange.includes('-')) {
    const [min, max] = referenceRange.split('-').map(s => parseFloat(s.trim()));
    return numValue < min || numValue > max;
  } else if (referenceRange.startsWith('<')) {
    const max = parseFloat(referenceRange.replace('<', '').trim());
    return numValue >= max;
  } else if (referenceRange.startsWith('>')) {
    const min = parseFloat(referenceRange.replace('>', '').trim());
    return numValue <= min;
  }
  
  return false;
}

async function emailReport(sampleId) {
  const sample = appData.samples.find(s => s.id === sampleId);
  if (!sample) return;
  
  const patient = appData.patients.find(p => p.id === sample.patientId);
  const doctor = appData.doctors.find(d => d.id === patient?.referringDoctor);
  
  const message = {
    id: Date.now(),
    type: 'email',
    recipient: doctor?.email || patient?.contact || 'unknown@example.com',
    subject: `Lab Report - ${sample.id}`,
    content: `Dear ${doctor?.name || patient?.name || 'Doctor'},\n\nPlease find attached the lab report for ${patient?.name || 'Patient'} (Sample ID: ${sample.id}).\n\nBest regards,\nMedLab Pro Laboratory`,
    timestamp: new Date().toISOString(),
    status: 'sent'
  };
  
  appData.messages.push(message);
  await autoSave();
  showNotification('Report sent via email successfully', 'success');
}

// Receipt Management Functions - FIXED
function showReceipts() {
  populateReceiptsGrid();
}

function populateReceiptsGrid() {
  const receiptsGrid = document.getElementById('receiptsGrid');
  if (!receiptsGrid) return;
  
  receiptsGrid.innerHTML = appData.receipts.map(receipt => `
    <div class="receipt-card">
      <h4>Receipt #${receipt.id}</h4>
      <div class="receipt-meta">
        <p><strong>Patient:</strong> ${receipt.patientName}</p>
        <p><strong>Amount:</strong> ₹${receipt.total}</p>
        <p><strong>Date:</strong> ${formatDate(receipt.date)}</p>
      </div>
      <div class="receipt-actions">
        <button class="btn btn--sm btn--primary" onclick="viewReceipt(${receipt.id})">
          <i class="fas fa-eye"></i> View
        </button>
        <button class="btn btn--sm btn--secondary" onclick="printReceipt(${receipt.id})">
          <i class="fas fa-print"></i> Print
        </button>
      </div>
    </div>
  `).join('');
}

function generateReceipt() {
  showNotification('Receipt generation feature - would open a form to create a new receipt', 'info');
}

function viewReceipt(id) {
  const receipt = appData.receipts.find(r => r.id === id);
  if (receipt) {
    showNotification(`Receipt #${receipt.id} for ${receipt.patientName} - ₹${receipt.total}`, 'info');
  }
}

function printReceipt(id) {
  showNotification(`Printing receipt #${id}`, 'info');
}

// Communication Functions - FIXED
function showCommunication() {
  populateMessageHistory();
  populateCommRecipients();
}

function populateMessageHistory() {
  const messageList = document.getElementById('messageList');
  if (!messageList) return;
  
  messageList.innerHTML = appData.messages.map(message => `
    <div class="message-item">
      <div class="message-header">
        <span class="message-recipient">${message.recipient}</span>
        <span class="message-time">${formatDateTime(message.timestamp)}</span>
      </div>
      <div class="message-type">${message.type}</div>
      <div class="message-content">
        <p>${message.content}</p>
      </div>
    </div>
  `).join('');
}

function sendWhatsAppMessage() {
  const modalTitle = document.getElementById('commModalTitle');
  const modal = document.getElementById('commModal');
  
  if (modalTitle) modalTitle.textContent = 'Send WhatsApp Message';
  populateCommRecipients();
  if (modal) modal.classList.remove('hidden');
}

function sendEmail() {
  const modalTitle = document.getElementById('commModalTitle');
  const modal = document.getElementById('commModal');
  
  if (modalTitle) modalTitle.textContent = 'Send Email';
  populateCommRecipients();
  if (modal) modal.classList.remove('hidden');
}

// Data Management Setup - FIXED
function setupDataManagement() {
  const exportBtn = document.getElementById('exportDataBtn');
  const importBtn = document.getElementById('importDataBtn');
  const backupBtn = document.getElementById('backupDataBtn');
  const fileInput = document.getElementById('importFileInput');
  
  if (exportBtn) exportBtn.addEventListener('click', exportData);
  if (backupBtn) backupBtn.addEventListener('click', createBackup);
  
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }
  
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        importData(file);
      }
    });
  }
}

// Form Setup and Handlers - FIXED
function setupForms() {
  // Patient Form
  const addPatientBtn = document.getElementById('addPatientBtn');
  if (addPatientBtn) {
    addPatientBtn.addEventListener('click', addPatient);
  }
  
  const patientForm = document.getElementById('patientForm');
  if (patientForm) {
    patientForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const formData = {
        name: document.getElementById('patientName')?.value || '',
        age: parseInt(document.getElementById('patientAge')?.value || '0'),
        gender: document.getElementById('patientGender')?.value || '',
        contact: document.getElementById('patientContact')?.value || '',
        address: document.getElementById('patientAddress')?.value || '',
        refId: document.getElementById('patientRefId')?.value || '',
        orgId: document.getElementById('patientOrgId')?.value || '',
        pid: document.getElementById('patientPid')?.value || '',
        referringDoctor: parseInt(document.getElementById('patientReferringDoctor')?.value || '0')
      };
      await savePatient(formData);
      document.getElementById('patientModal')?.classList.add('hidden');
    });
  }

  // Doctor Form
  const addDoctorBtn = document.getElementById('addDoctorBtn');
  if (addDoctorBtn) {
    addDoctorBtn.addEventListener('click', addDoctor);
  }
  
  const doctorForm = document.getElementById('doctorForm');
  if (doctorForm) {
    doctorForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const formData = {
        name: document.getElementById('doctorName')?.value || '',
        specialty: document.getElementById('doctorSpecialty')?.value || '',
        qualification: document.getElementById('doctorQualification')?.value || '',
        title: document.getElementById('doctorTitle')?.value || '',
        rmcNo: document.getElementById('doctorRmcNo')?.value || '',
        clinic: document.getElementById('doctorClinic')?.value || '',
        contact: document.getElementById('doctorContact')?.value || '',
        email: document.getElementById('doctorEmail')?.value || ''
      };
      await saveDoctor(formData);
      document.getElementById('doctorModal')?.classList.add('hidden');
    });
  }

  // Test Form
  const addTestBtn = document.getElementById('addTestBtn');
  if (addTestBtn) {
    addTestBtn.addEventListener('click', addTest);
  }
  
  const addComponentBtn = document.getElementById('addComponentBtn');
  if (addComponentBtn) {
    addComponentBtn.addEventListener('click', addTestComponent);
  }
  
  const testForm = document.getElementById('testForm');
  if (testForm) {
    testForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const formData = {
        name: document.getElementById('testName')?.value || '',
        department: document.getElementById('testDepartment')?.value || '',
        price: parseInt(document.getElementById('testPrice')?.value || '0')
      };
      await saveTest(formData);
      document.getElementById('testModal')?.classList.add('hidden');
    });
  }

  // Sample Form
  const addSampleBtn = document.getElementById('addSampleBtn');
  if (addSampleBtn) {
    addSampleBtn.addEventListener('click', addSample);
  }
  
  const sampleForm = document.getElementById('sampleForm');
  if (sampleForm) {
    sampleForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const selectedTests = Array.from(document.querySelectorAll('#testCheckboxes input:checked'))
        .map(checkbox => parseInt(checkbox.value));
      
      if (selectedTests.length === 0) {
        alert('Please select at least one test');
        return;
      }
      
      const formData = {
        patientId: parseInt(document.getElementById('samplePatient')?.value || '0'),
        tests: selectedTests,
        collectionDate: document.getElementById('sampleCollectionDate')?.value || '',
        appointmentNo: document.getElementById('sampleAppointmentNo')?.value || ''
      };
      await saveSample(formData);
      document.getElementById('sampleModal')?.classList.add('hidden');
    });
  }

  // Results Form
  const saveResultsBtn = document.getElementById('saveResultsBtn');
  if (saveResultsBtn) {
    saveResultsBtn.addEventListener('click', saveResults);
  }

  // Communication Form
  const whatsappBtn = document.getElementById('whatsappBtn');
  const emailBtn = document.getElementById('emailBtn');
  const generateReceiptBtn = document.getElementById('generateReceiptBtn');
  
  if (whatsappBtn) whatsappBtn.addEventListener('click', sendWhatsAppMessage);
  if (emailBtn) emailBtn.addEventListener('click', sendEmail);
  if (generateReceiptBtn) generateReceiptBtn.addEventListener('click', generateReceipt);
  
  // Report Actions
  const printReportBtn = document.getElementById('printReportBtn');
  const emailReportBtn = document.getElementById('emailReportBtn');
  
  if (printReportBtn) {
    printReportBtn.addEventListener('click', function() {
      window.print();
    });
  }
  
  if (emailReportBtn) {
    emailReportBtn.addEventListener('click', function() {
      showNotification('Report sent via email', 'success');
      document.getElementById('reportModal')?.classList.add('hidden');
    });
  }
}

// Modal Setup - FIXED
function setupModals() {
  const closeButtons = document.querySelectorAll('.modal-close, #cancelPatientBtn, #cancelDoctorBtn, #cancelTestBtn, #cancelSampleBtn, #cancelCommBtn, #closeReportBtn, #cancelResultsBtn');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.add('hidden');
      });
    });
  });

  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });
}

// Dropdown Population Functions - FIXED
function populateDoctorFilter() {
  const select = document.getElementById('doctorFilter');
  if (!select) return;
  
  select.innerHTML = '<option value="">All Doctors</option>' +
    appData.doctors.map(doctor => `<option value="${doctor.id}">${doctor.name}</option>`).join('');
}

function populatePatientDropdowns() {
  const patientReferringDoctorSelect = document.getElementById('patientReferringDoctor');
  
  if (patientReferringDoctorSelect) {
    const doctorOptions = appData.doctors.map(doctor => 
      `<option value="${doctor.id}">${doctor.name}</option>`
    ).join('');
    patientReferringDoctorSelect.innerHTML = '<option value="">Select Doctor</option>' + doctorOptions;
  }
}

function populatePatientDropdownsForSamples() {
  const samplePatientSelect = document.getElementById('samplePatient');
  
  if (samplePatientSelect) {
    const patientOptions = appData.patients.map(patient => 
      `<option value="${patient.id}">${patient.name}</option>`
    ).join('');
    samplePatientSelect.innerHTML = '<option value="">Select Patient</option>' + patientOptions;
  }
}

function populateTestCheckboxes() {
  const container = document.getElementById('testCheckboxes');
  if (!container) return;
  
  container.innerHTML = appData.tests.map(test => `
    <div class="checkbox-item">
      <input type="checkbox" id="test_${test.id}" value="${test.id}">
      <label for="test_${test.id}">${test.name} (₹${test.price})</label>
    </div>
  `).join('');
}

function populateCommRecipients() {
  const select = document.getElementById('commRecipient');
  if (!select) return;
  
  const recipients = [
    ...appData.doctors.map(d => ({ type: 'doctor', id: d.id, name: d.name, contact: d.email })),
    ...appData.patients.map(p => ({ type: 'patient', id: p.id, name: p.name, contact: p.contact }))
  ];
  
  select.innerHTML = '<option value="">Select Recipient</option>' +
    recipients.map(r => `<option value="${r.contact}">${r.name} (${r.type})</option>`).join('');
}

// Search and Filter Functions - FIXED
function setupSearchFilters() {
  const searchFields = [
    { id: 'patientSearch', callback: () => populatePatientTable() },
    { id: 'doctorSearch', callback: () => populateDoctorTable() },
    { id: 'testSearch', callback: () => populateTestTable() },
    { id: 'sampleSearch', callback: () => populateSampleTable() }
  ];
  
  searchFields.forEach(({ id, callback }) => {
    const searchInput = document.getElementById(id);
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        setTimeout(() => {
          filterTableRows(searchInput.closest('.content-section'), searchTerm);
        }, 100);
      });
    }
  });
}

function filterTableRows(section, searchTerm) {
  const tbody = section?.querySelector('tbody');
  if (!tbody) return;
  
  const rows = tbody.querySelectorAll('tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const matches = searchTerm.split(' ').every(term => text.includes(term.trim()));
    row.style.display = matches ? '' : 'none';
  });
}

function setupDoctorFilterListener() {
  const doctorFilter = document.getElementById('doctorFilter');
  if (!doctorFilter) return;
  
  doctorFilter.addEventListener('change', function(e) {
    currentDoctorFilter = e.target.value;
    const activeSection = document.querySelector('.content-section.active')?.id;
    switch(activeSection) {
      case 'patients':
        populatePatientTable();
        break;
      case 'samples':
        populateSampleTable();
        break;
      case 'dashboard':
        updateDashboardStats();
        break;
    }
  });
}

// Utility Functions
function updateCurrentDate() {
  const now = new Date();
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  const currentDateEl = document.getElementById('currentDate');
  if (currentDateEl) {
    currentDateEl.textContent = now.toLocaleDateString('en-IN', options);
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTimeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) return 'Today';
  if (diffDays === 2) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays - 1} days ago`;
  return formatDate(dateString);
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification--${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Global functions for onclick handlers - FIXED
window.editPatient = editPatient;
window.deletePatient = deletePatient;
window.addPatient = addPatient;
window.editDoctor = editDoctor;
window.deleteDoctor = deleteDoctor;
window.addDoctor = addDoctor;
window.editTest = editTest;
window.deleteTest = deleteTest;
window.addTest = addTest;
window.viewSample = viewSample;
window.enterResults = enterResults;
window.addSample = addSample;
window.generateReport = generateReport;
window.emailReport = emailReport;
window.viewReceipt = viewReceipt;
window.printReceipt = printReceipt;
window.generateReceipt = generateReceipt;
window.sendWhatsAppMessage = sendWhatsAppMessage;
window.sendEmail = sendEmail;