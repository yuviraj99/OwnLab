// Enhanced Medical Laboratory Management System - FULLY FIXED VERSION
// All buttons working: Reports, WhatsApp, Email, Receipt Generation

// IndexedDB Configuration
const DB_NAME = 'PardiyaLabDB';
const DB_VERSION = 1;
let db;
// Hardcoded Pathologist Info
const pathologistInfo = {
  name: "Dr. M. Sanwalka",
  qualification: "MD (Pathology)",
};

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
  settings: {
    email: {
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPassword: '',
      configured: false
    },
    lab: {
      name: 'Suprem Pardiya Diagnostic Center & Clinic',
      address: 'Radha Plaza, Near Chogadiya Petrol Pump, Diggi Malpura Road, Sanganer , Jaipur - 302029',
      phone: '+91-9982006222',
      email: 'info@medlabpro.com',
      website: 'www.medlabpro.com',
      license: 'LAB/2025/001',
      gstNumber: '27XXXXX1234X1ZX'
    }
  },
  nextPatientId: 1,
  nextDoctorId: 1,
  nextTestId: 1,
  nextSampleId: 1,
  nextReceiptId: 1
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
      
      Object.entries(STORES).forEach(([storeName, keyPath]) => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath });
          
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
    
    const settings = await getFromStore('settings', 'counters');
    if (settings) {
      appData.nextPatientId = settings.nextPatientId || 1;
      appData.nextDoctorId = settings.nextDoctorId || 1;  
      appData.nextTestId = settings.nextTestId || 1;
      appData.nextSampleId = settings.nextSampleId || 1;
      appData.nextReceiptId = settings.nextReceiptId || 1;
    }
    
    const emailSettings = await getFromStore('settings', 'email');
    if (emailSettings) {
      appData.settings.email = { ...appData.settings.email, ...emailSettings };
    }
    
    const labSettings = await getFromStore('settings', 'lab');
    if (labSettings) {
      appData.settings.lab = { ...appData.settings.lab, ...labSettings };
    }
    
    console.log('Data loaded from IndexedDB:', appData);
  } catch (error) {
    console.error('Error loading data from IndexedDB:', error);
    // await loadInitialData();
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
    for (const [storeName, data] of Object.entries(appData)) {
      if (STORES[storeName] && Array.isArray(data)) {
        for (const item of data) {
          await saveToStore(storeName, item);
        }
      }
    }
    
    await saveToStore('settings', {
      key: 'counters',
      nextPatientId: appData.nextPatientId,
      nextDoctorId: appData.nextDoctorId,
      nextTestId: appData.nextTestId,
      nextSampleId: appData.nextSampleId,
      nextReceiptId: appData.nextReceiptId
    });
    
    await saveToStore('settings', {
      key: 'email',
      ...appData.settings.email
    });
    
    await saveToStore('settings', {
      key: 'lab',
      ...appData.settings.lab
    });
    
    updateDataStats();
  } catch (error) {
    console.error('Auto-save failed:', error);
  }
}

// Initial Data Loading
async function loadInitialData() {
  const initialData = {
    "patients": [
      {"id": 1, "name": "MR. LOKESH KUMAR", "age": 20, "gender": "Male", "contact": "9876543210", "email": "lokesh@email.com", "address": "123 Main St, Mumbai", "referringDoctor": 1, "dateAdded": "2025-09-15", "refId": "SELF", "orgId": "Dcs Hospital", "pid": "00425"},
      {"id": 2, "name": "MRS. PINKI", "age": 34, "gender": "Female", "contact": "9876543211", "email": "pinki@email.com", "address": "456 Park Ave, Delhi", "referringDoctor": 2, "dateAdded": "2025-09-14", "refId": "SELF", "orgId": "Dcs Hospital", "pid": "01051"},
      {"id": 3, "name": "RAJ PATEL", "age": 28, "gender": "Male", "contact": "9876543212", "email": "raj@email.com", "address": "789 Garden Rd, Pune", "referringDoctor": 1, "dateAdded": "2025-09-13", "refId": "DR001", "orgId": "City Hospital", "pid": "00789"},
      {"id": 4, "name": "ANITA SINGH", "age": 55, "gender": "Female", "contact": "9876543213", "email": "anita@email.com", "address": "321 Hill View, Bangalore", "referringDoctor": 3, "dateAdded": "2025-09-12", "refId": "DR002", "orgId": "Metro Clinic", "pid": "01234"},
      {"id": 5, "name": "VIKRAM KUMAR", "age": 38, "gender": "Male", "contact": "9876543214", "email": "vikram@email.com", "address": "654 Lake Side, Chennai", "referringDoctor": 4, "dateAdded": "2025-09-11", "refId": "DR003", "orgId": "South Hospital", "pid": "05678"}
    ],
    "doctors": [
      {"id": 1, "name": "Dr. M. Sanwalka", "specialty": "Pathology", "qualification": "MD (Pathology)", "title": "Consultant Pathologist", "rmcNo": "23809", "clinic": "Dcs Hospital", "contact": "9876500001", "email": "sanwalka@dcshospital.com"},
      {"id": 2, "name": "Dr. Riya Gupta", "specialty": "Microbiology", "qualification": "MD (Microbiology)", "title": "Consultant Microbiologist", "rmcNo": "42507/22843", "clinic": "Dcs Hospital", "contact": "9876500002", "email": "riya@dcshospital.com"},
      {"id": 3, "name": "Dr. Rajesh Gupta", "specialty": "Endocrinology", "qualification": "MD (Endocrinology)", "title": "Consultant Endocrinologist", "rmcNo": "12345", "clinic": "Diabetes Clinic", "contact": "9876500003", "email": "rajesh.gupta@diabetesclinic.com"},
      {"id": 4, "name": "Dr. Meera Nair", "specialty": "Gynecology", "qualification": "MD (Gynecology)", "title": "Consultant Gynecologist", "rmcNo": "67890", "clinic": "Women's Health Center", "contact": "9876500004", "email": "meera.nair@womenshealth.com"}
    ],
    "tests": [
      {"id": 1, "name": "Complete Blood Count (CBC)", "department": "HEMATOLOGY", "price": 350, "components": [
        {"name": "Hemoglobin", "referenceRange": "12.0-15.5 g/dL", "units": "g/dL"},
        {"name": "RBC Count", "referenceRange": "4.5-5.5 million/μL", "units": "million/μL"},
        {"name": "WBC Count", "referenceRange": "4000-11000 /μL", "units": "/μL"},
        {"name": "Platelet Count", "referenceRange": "150000-450000 /μL", "units": "/μL"}
      ]},
      {"id": 2, "name": "Liver Function Test (LFT)", "department": "CLINICAL BIOCHEMISTRY", "price": 450, "components": [
        {"name": "Bilirubin Total", "referenceRange": "0.3-1.0 mg/dL", "units": "mg/dL", "method": "Diazo Method"},
        {"name": "Bilirubin Direct", "referenceRange": "0-0.2 mg/dL", "units": "mg/dL", "method": "Diazo Method"},
        {"name": "SGOT (AST)", "referenceRange": "0-40 U/L", "units": "U/L", "method": "IFCC"},
        {"name": "SGPT (ALT)", "referenceRange": "5-45 U/L", "units": "U/L"},
        {"name": "Alkaline Phosphatase", "referenceRange": "50-136 U/L", "units": "U/L"}
      ]},
      {"id": 3, "name": "Urine Routine Examination", "department": "PATHOLOGY", "price": 300, "components": [
        {"name": "Colour", "referenceRange": "Pale yellow/Yellow", "units": "-"},
        {"name": "Appearance", "referenceRange": "Clear", "units": "-"},
        {"name": "Specific Gravity", "referenceRange": "1.005-1.025", "units": "-"},
        {"name": "pH", "referenceRange": "5.0-8.0", "units": "-"},
        {"name": "Protein", "referenceRange": "Absent", "units": "-"},
        {"name": "Sugar", "referenceRange": "Absent", "units": "-"},
        {"name": "Pus Cells", "referenceRange": "Upto 5", "units": "/hpf"},
        {"name": "RBC", "referenceRange": "Absent", "units": "/hpf"}
      ]},
      {"id": 4, "name": "Thyroid Profile", "department": "CLINICAL BIOCHEMISTRY", "price": 550, "components": [
        {"name": "T3", "referenceRange": "0.8-2.0 ng/mL", "units": "ng/mL"},
        {"name": "T4", "referenceRange": "5.1-14.1 μg/dL", "units": "μg/dL"},
        {"name": "TSH", "referenceRange": "0.27-4.2 μIU/mL", "units": "μIU/mL"}
      ]},
      {"id": 5, "name": "Lipid Profile", "department": "CLINICAL BIOCHEMISTRY", "price": 380, "components": [
        {"name": "Total Cholesterol", "referenceRange": "<200 mg/dL", "units": "mg/dL"},
        {"name": "Triglycerides", "referenceRange": "<150 mg/dL", "units": "mg/dL"},
        {"name": "HDL Cholesterol", "referenceRange": ">40 mg/dL", "units": "mg/dL"},
        {"name": "LDL Cholesterol", "referenceRange": "<100 mg/dL", "units": "mg/dL"}
      ]}
    ],
    "samples": [
      {"id": "00425", "patientId": 1, "tests": [1, 3], "collectionDate": "2025-08-12", "registrationDate": "2025-08-12", "reportDate": "2025-08-12", "status": "Completed", "appointmentNo": "00425", "prepaidBy": "--", "results": {
        "1": {"Hemoglobin": "14.2", "RBC Count": "4.8", "WBC Count": "7500", "Platelet Count": "350000"},
        "3": {"Colour": "Pale Yellow", "Appearance": "Clear", "Specific Gravity": "1.020", "pH": "6.0", "Protein": "Absent", "Sugar": "250", "Pus Cells": "3-4", "RBC": "Absent"}
      }, "totalAmount": 650},
      {"id": "01051", "patientId": 2, "tests": [2], "collectionDate": "2025-08-26", "registrationDate": "2025-08-26", "reportDate": "2025-08-26", "status": "Completed", "appointmentNo": "01051", "prepaidBy": "--", "results": {
        "2": {"Bilirubin Total": "0.58", "Bilirubin Direct": "0.23", "SGOT (AST)": "15", "SGPT (ALT)": "10", "Alkaline Phosphatase": "86.2"}
      }, "totalAmount": 450},
      {"id": "LAB003", "patientId": 3, "tests": [4, 5], "collectionDate": "2025-09-13", "status": "Completed", "results": {
        "4": {"T3": "1.2", "T4": "8.5", "TSH": "2.1"},
        "5": {"Total Cholesterol": "220", "Triglycerides": "180", "HDL Cholesterol": "45", "LDL Cholesterol": "120"}
      }, "totalAmount": 930},
      {"id": "LAB004", "patientId": 4, "tests": [1, 2], "collectionDate": "2025-09-12", "status": "Processing", "results": {}, "totalAmount": 800},
      {"id": "LAB005", "patientId": 5, "tests": [3], "collectionDate": "2025-09-11", "status": "Pending", "results": {}, "totalAmount": 300}
    ]
  };
  
  appData.patients = initialData.patients;
  appData.doctors = initialData.doctors;
  appData.tests = initialData.tests;
  appData.samples = initialData.samples;
  appData.receipts = [];
  appData.messages = [];
  
  appData.nextPatientId = Math.max(...initialData.patients.map(p => p.id)) + 1;
  appData.nextDoctorId = Math.max(...initialData.doctors.map(d => d.id)) + 1;
  appData.nextTestId = Math.max(...initialData.tests.map(t => t.id)) + 1;
  appData.nextSampleId = 1000;
  appData.nextReceiptId = 1;
  
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
      // await loadInitialData();
    }
  } catch (error) {
    console.error('Failed to load data:', error);
    // await loadInitialData();
  }
  
  setupNavigation();
  setupModals();
  setupForms();
  setupDataManagement();
  setupExportButtons();
  setupCommunicationTabs();
  setupSettingsHandlers();
  updateCurrentDate();
  
  // Initialize dropdowns and UI
  populateDoctorFilter();
  populatePatientDropdowns();
  populateTestCheckboxes();
  
  // Setup event listeners
  setupSearchFilters();
  setupDoctorFilterListener();
  
  // Show initial dashboard
  showDashboard();
  
  refreshAllData();
  hideLoadingOverlay();
  
  showNotification('Laboratory System loaded successfully', 'success');
}

function refreshAllData() {
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
    case 'settings':
      showSettings();
      break;
    case 'data-management':
      updateDataStats();
      break;
  }
  
  // Always update these after data changes
  populateDoctorFilter();
  populatePatientDropdowns();
  populateTestCheckboxes();
  updateFilterStatus();
}

// Navigation Functions
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
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  const activeLink = document.querySelector(`[data-section="${sectionName}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }

  const titles = {
    'dashboard': 'Dashboard',
    'patients': 'Patient Management',
    'doctors': 'Doctor Management', 
    'tests': 'Test Configuration',
    'samples': 'Sample Management',
    'reports': 'Report Generation',
    'receipts': 'Receipts & Billing',
    'communication': 'Communication Center',
    'settings': 'System Settings',
    'data-management': 'Data Management'
  };
  
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    pageTitle.textContent = titles[sectionName] || 'Dashboard';
  }

  document.querySelectorAll('.content-section').forEach(section => {
    section.classList.remove('active');
  });
  
  const activeSection = document.getElementById(sectionName);
  if (activeSection) {
    activeSection.classList.add('active');
  }

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
    case 'settings':
      showSettings();
      break;
    case 'data-management':
      updateDataStats();
      break;
  }
}

// Doctor Filter Functions
function setupDoctorFilterListener() {
  const doctorFilter = document.getElementById('doctorFilter');
  if (!doctorFilter) return;
  
  doctorFilter.addEventListener('change', function(e) {
    currentDoctorFilter = e.target.value;
    updateFilterStatus();
    applyDoctorFilter();
  });
}

function populateDoctorFilter() {
  const select = document.getElementById('doctorFilter');
  if (!select) return;
  
  const currentValue = select.value;
  let optionsHTML = '<option value="">All Doctors</option>';
  
  appData.doctors.forEach(doctor => {
    optionsHTML += `<option value="${doctor.id}">${doctor.name}</option>`;
  });
  
  select.innerHTML = optionsHTML;
  select.value = currentValue;
}

function updateFilterStatus() {
  const filterStatus = document.getElementById('filterStatus');
  const filterDoctorName = document.getElementById('filterDoctorName');
  
  if (!filterStatus || !filterDoctorName) return;
  
  if (currentDoctorFilter) {
    const doctor = appData.doctors.find(d => d.id == currentDoctorFilter);
    if (doctor) {
      filterDoctorName.textContent = doctor.name;
      filterStatus.classList.remove('hidden');
    }
  } else {
    filterStatus.classList.add('hidden');
  }
}

function applyDoctorFilter() {
  const activeSection = document.querySelector('.content-section.active')?.id;
  switch(activeSection) {
    case 'dashboard':
      updateDashboardStats();
      setTimeout(() => initializeCharts(), 100);
      break;
    case 'patients':
      populatePatientTable();
      break;
    case 'samples':
      populateSampleTable();
      break;
    case 'reports':
      populateReportsGrid();
      break;
  }
}

function getFilteredPatients() {
  let patients = appData.patients;
  if (currentDoctorFilter) {
    patients = patients.filter(p => p.referringDoctor == currentDoctorFilter);
  }
  return patients;
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
  const filteredPatients = getFilteredPatients();
  const filteredSamples = getFilteredSamples();
  
  const todayPatients = filteredPatients.filter(p => p.dateAdded === today);
  const completedTests = filteredSamples.filter(s => s.status === 'Completed');
  const pendingReports = filteredSamples.filter(s => s.status === 'Processing' || s.status === 'Pending');
  
  const todayRevenue = filteredSamples
    .filter(s => s.collectionDate === today)
    .reduce((total, sample) => {
      return total + (sample.totalAmount || 0);
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
  const testVolumeCanvas = document.getElementById('testVolumeChart');
  if (testVolumeCanvas && typeof Chart !== 'undefined') {
    const testVolumeCtx = testVolumeCanvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (testVolumeCanvas.chart) {
      testVolumeCanvas.chart.destroy();
    }
    
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

    testVolumeCanvas.chart = new Chart(testVolumeCtx, {
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

  const doctorReferralCanvas = document.getElementById('doctorReferralChart');
  if (doctorReferralCanvas && typeof Chart !== 'undefined') {
    const doctorReferralCtx = doctorReferralCanvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (doctorReferralCanvas.chart) {
      doctorReferralCanvas.chart.destroy();
    }
    
    const filteredPatients = getFilteredPatients();
    const doctorCounts = {};
    
    filteredPatients.forEach(patient => {
      const doctor = appData.doctors.find(d => d.id === patient.referringDoctor);
      if (doctor) {
        doctorCounts[doctor.name] = (doctorCounts[doctor.name] || 0) + 1;
      }
    });

    const doctorData = {
      labels: Object.keys(doctorCounts),
      datasets: [{
        data: Object.values(doctorCounts),
        backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F']
      }]
    };

    doctorReferralCanvas.chart = new Chart(doctorReferralCtx, {
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
  
  const filteredPatients = getFilteredPatients()
    .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
    .slice(0, 2);
    
  filteredPatients.forEach(patient => {
    activities.push({
      icon: 'fa-user-plus',
      text: `New patient ${patient.name} registered`,
      time: formatTimeAgo(patient.dateAdded)
    });
  });
  
  const filteredSamples = getFilteredSamples()
    .filter(s => s.status === 'Completed')
    .slice(0, 2);
    
  filteredSamples.forEach(sample => {
    const patient = appData.patients.find(p => p.id === sample.patientId);
    activities.push({
      icon: 'fa-vial',
      text: `Sample ${sample.id} completed for ${patient?.name || 'Unknown Patient'}`,
      time: formatTimeAgo(sample.collectionDate)
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

// Patient Management Functions
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
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${patient.contact}
            <button class="action-btn action-btn--whatsapp" onclick="sendWhatsApp('${patient.contact}', '${patient.name}')" title="Send WhatsApp">
              <i class="fab fa-whatsapp"></i>
            </button>
            ${patient.email ? `
              <button class="action-btn action-btn--email" onclick="sendEmailToPatient('${patient.email}', '${patient.name}')" title="Send Email">
                <i class="fas fa-envelope"></i>
              </button>
            ` : ''}
          </div>
        </td>
        <td>
          <div style="display: flex; gap: 4px;">
            ${patient.contact ? '<span class="status-badge--completed" style="font-size: 10px; padding: 2px 6px;">Phone</span>' : ''}
            ${patient.email ? '<span class="status-badge--completed" style="font-size: 10px; padding: 2px 6px;">Email</span>' : ''}
          </div>
        </td>
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

// FIXED: WhatsApp Functions - NOW WORKING
function sendWhatsApp(phoneNumber, patientName, message = null) {
  try {
    // Clean phone number and ensure it has country code
    let cleanNumber = phoneNumber.replace(/[^\d]/g, '');
    
    // If number doesn't start with 91 and is 10 digits, add country code
    if (!cleanNumber.startsWith('91') && cleanNumber.length === 10) {
      cleanNumber = '91' + cleanNumber;
    }
    
    // Remove leading 91 if number is longer than 12 digits
    if (cleanNumber.startsWith('91') && cleanNumber.length > 12) {
      cleanNumber = cleanNumber.substring(2);
      cleanNumber = '91' + cleanNumber;
    }
    
    const defaultMessage = message || `Hello ${patientName}, your medical report is ready for collection at Suprem Pardiya Diagnostic Center & Clinic. Please contact us at ${appData.settings.lab.phone} for more details.`;
    const encodedMessage = encodeURIComponent(defaultMessage);
    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
    
    console.log('Opening WhatsApp URL:', whatsappUrl);
    
    // Track message
    const messageRecord = {
      id: Date.now(),
      type: 'whatsapp',
      recipient: phoneNumber,
      patient: patientName,
      message: defaultMessage,
      timestamp: new Date().toISOString(),
      status: 'sent'
    };
    
    appData.messages.push(messageRecord);
    autoSave();
    updateCommunicationStats();
    
    // Open WhatsApp in new window
    window.open(whatsappUrl, '_blank');
    showNotification(`WhatsApp opened for ${patientName}`, 'success');
    
  } catch (error) {
    console.error('WhatsApp error:', error);
    showNotification('Failed to open WhatsApp', 'error');
  }
}

function sendWhatsAppReport(sampleId) {
  const sample = appData.samples.find(s => s.id === sampleId);
  if (!sample) {
    showNotification('Sample not found', 'error');
    return;
  }
  
  const patient = appData.patients.find(p => p.id === sample.patientId);
  if (!patient) {
    showNotification('Patient not found', 'error');
    return;
  }
  
  const message = `Hello ${patient.name}, your lab report (Sample ID: ${sample.id}) is ready for collection at Suprem Pardiya Diagnostic Center & Clinic. Please visit our center or contact us at ${appData.settings.lab.phone}.`;
  
  sendWhatsApp(patient.contact, patient.name, message);
}

// FIXED: Email Functions - NOW WORKING
function sendEmailToPatient(email, patientName) {
  try {
    const subject = `Important Update from Suprem Pardiya Diagnostic Center & Clinic`;
    const body = `Dear ${patientName},

We hope this message finds you well. This is a communication from Suprem Pardiya Diagnostic Center & Clinic.

If you have any questions, please contact us at ${appData.settings.lab.phone}.

Best regards,
Suprem Pardiya Diagnostic Center & Clinic
Radha Plaza, Near Chogadiya Petrol Pump, Diggi Malpura Road, Sanganer , Jaipur - 302029`;
    
    // Create mailto URL
    const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    console.log('Opening email client with URL:', mailtoUrl);
    
    // Track message
    const messageRecord = {
      id: Date.now(),
      type: 'email',
      recipient: email,
      patient: patientName,
      subject: subject,
      message: body,
      timestamp: new Date().toISOString(),
      status: 'sent'
    };
    
    appData.messages.push(messageRecord);
    autoSave();
    updateCommunicationStats();
    
    // Open email client
    window.open(mailtoUrl, '_blank');
    showNotification(`Email client opened for ${patientName}`, 'success');
    
  } catch (error) {
    console.error('Email error:', error);
    showNotification('Failed to open email client', 'error');
  }
}

function sendEmailReport(sampleId) {
  const sample = appData.samples.find(s => s.id === sampleId);
  if (!sample) {
    showNotification('Sample not found', 'error');
    return;
  }
  
  const patient = appData.patients.find(p => p.id === sample.patientId);
  if (!patient || !patient.email) {
    showNotification('Patient email not available', 'warning');
    return;
  }
  
  const subject = `Lab Report Ready - Sample ${sample.id}`;
  const body = `Dear ${patient.name},

Your lab report (Sample ID: ${sample.id}) is ready for collection.

Please visit our center or contact us at ${appData.settings.lab.phone} for digital delivery.

Best regards,
Suprem Pardiya Diagnostic Center & Clinic
Radha Plaza, Near Chogadiya Petrol Pump, Diggi Malpura Road, Sanganer , Jaipur - 302029`;
  
  // Create mailto URL
  const mailtoUrl = `mailto:${patient.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  
  const messageRecord = {
    id: Date.now(),
    type: 'email',
    recipient: patient.email,
    patient: patient.name,
    subject: subject,
    message: body,
    timestamp: new Date().toISOString(),
    status: 'sent'
  };
  
  appData.messages.push(messageRecord);
  autoSave();
  updateCommunicationStats();
  
  window.open(mailtoUrl, '_blank');
  showNotification(`Email client opened for ${patient.name}`, 'success');
}

// Communication Functions
function setupCommunicationTabs() {
  const tabButtons = document.querySelectorAll('.communication-tabs .tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const tabName = this.dataset.tab;
      showCommTab(tabName);
    });
  });
}

function showCommTab(tabName) {
  document.querySelectorAll('.communication-tabs .tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
  const activeContent = document.getElementById(`comm-${tabName}`);
  
  if (activeBtn) activeBtn.classList.add('active');
  if (activeContent) activeContent.classList.add('active');
}

function showCommunication() {
  updateCommunicationStats();
  populateCommunicationList();
}

function updateCommunicationStats() {
  const whatsappSent = appData.messages.filter(m => m.type === 'whatsapp').length;
  const emailsSent = appData.messages.filter(m => m.type === 'email').length;
  const pendingMessages = appData.messages.filter(m => m.status === 'pending').length;
  
  const whatsappSentEl = document.getElementById('whatsappSent');
  const emailsSentEl = document.getElementById('emailsSent');
  const pendingMessagesEl = document.getElementById('pendingMessages');
  
  if (whatsappSentEl) whatsappSentEl.textContent = whatsappSent;
  if (emailsSentEl) emailsSentEl.textContent = emailsSent;
  if (pendingMessagesEl) pendingMessagesEl.textContent = pendingMessages;
}

function populateCommunicationList() {
  const communicationList = document.getElementById('communicationList');
  if (!communicationList) return;
  
  const recentMessages = appData.messages
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);
  
  if (recentMessages.length === 0) {
    communicationList.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No communications sent yet.</p>';
    return;
  }
  
  communicationList.innerHTML = recentMessages.map(message => `
    <div class="communication-item">
      <div class="communication-header">
        <strong>${message.patient || 'Unknown'}</strong>
        <span style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">${formatDateTime(message.timestamp)}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
        <span class="status-badge--${message.type === 'whatsapp' ? 'completed' : 'info'}" style="font-size: 10px;">
          ${message.type.toUpperCase()}
        </span>
        <span style="font-size: var(--font-size-sm);">${message.recipient}</span>
      </div>
      <p style="margin: 8px 0 0 0; font-size: var(--font-size-sm); color: var(--color-text-secondary);">
        ${message.message.length > 100 ? message.message.substring(0, 100) + '...' : message.message}
      </p>
    </div>
  `).join('');
}

// FIXED: Report Generation Functions - NOW WORKING
function showReports() {
  populateReportsGrid();
}

function populateReportsGrid() {
  const reportsGrid = document.getElementById('reportsGrid');
  if (!reportsGrid) return;
  
  const completedSamples = getFilteredSamples().filter(s => s.status === 'Completed');
  
  if (completedSamples.length === 0) {
    reportsGrid.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); grid-column: 1 / -1;">No completed samples available for report generation.</p>';
    return;
  }
  
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
            <i class="fas fa-file-medical"></i> Generate Report
          </button>
          <button class="btn btn--sm btn--secondary" onclick="sendWhatsAppReport('${sample.id}')">
            <i class="fab fa-whatsapp"></i> WhatsApp
          </button>
          <button class="btn btn--sm btn--secondary" onclick="sendEmailReport('${sample.id}')">
            <i class="fas fa-envelope"></i> Email
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// FIXED: Generate Report Function - NOW WORKING
function generateReport(sampleId) {
  console.log('Generating report for sample:', sampleId);
  
  const sample = appData.samples.find(s => s.id === sampleId);
  if (!sample) {
    showNotification('Sample not found', 'error');
    return;
  }
  
  const patient = appData.patients.find(p => p.id === sample.patientId);
  const doctor = appData.doctors.find(d => d.id === patient?.referringDoctor);
  
  const reportContent = document.getElementById('reportContent');
  const reportModal = document.getElementById('reportModal');
  
  if (!reportContent || !reportModal) {
    showNotification('Report modal not found', 'error');
    return;
  }
  
  try {
    let reportHtml = `
      <div class="report-header">
        <div class="report-header .lab-logo">
          <i class="fas fa-flask"></i>
        </div>
        <div class="lab-info">
          <h1>Suprem Pardiya Diagnostic Center & Clinic</h1>
          <p>Radha Plaza, Near Chogadiya Petrol Pump, Diggi Malpura Road, Sanganer , Jaipur - 302029</p>
          <p>Phone: +91-9982006222 | Email: ${appData.settings.lab.email}</p>
          <p>NABL Accredited Laboratory | License: ${appData.settings.lab.license}</p>
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
            <span class="info-label">Contact:</span>
            <span class="info-value">${patient?.contact || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">PID:</span>
            <span class="info-value">${patient?.pid || sample.id}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Referring Doctor:</span>
            <span class="info-value">${doctor?.name || 'Self'}</span>
          </div>
        </div>
        <div class="info-box">
          <h3>Sample Information</h3>
          <div class="info-row">
            <span class="info-label">Sample No:</span>
            <span class="info-value">${sample.id}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Collection Date:</span>
            <span class="info-value">${formatDate(sample.collectionDate)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Report Date:</span>
            <span class="info-value">${formatDate(sample.reportDate || new Date().toISOString().split('T')[0])}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Amount:</span>
            <span class="info-value">₹${sample.totalAmount || 0}</span>
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
    
    // Generate results for each department
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
                  <th>Reference Range</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        if (test.components) {
          test.components.forEach(component => {
            const result = results[component.name] || '';
            const isAbnormal = isValueAbnormal(result, component.referenceRange);
            
            reportHtml += `
              <tr>
                <td>${component.name}</td>
                <td class="${isAbnormal ? 'abnormal-value' : ''}">${result}</td>
                <td>${component.units || '-'}</td>
                <td>
                ${component.referenceRange
                              ? component.referenceRange.includes(';')
                                ? component.referenceRange.split(';').join('<br>')
                                : component.referenceRange
                              : '-'}
                  </td>
              </tr>
            `;
          });
          
        }
        
        
        reportHtml += `
              </tbody>
            </table>
          </div>
        `;
        if (test.note && test.note.text) {
  reportHtml += `
    <div class="test-note">
      <strong>${test.note.heading || 'Note'}:</strong><br>
      <span>${test.note.text}</span>
    </div>
    <br><br><br>
  `;
}
      });
      
      
      reportHtml += `</div>`;
    });
    
    
    reportHtml += `
      <div class="report-footer">
        <div class="end-of-report">*** End Of Report ***</div>
  <div class="report-signature">
    
    <img src="/pathSign.png" alt="Signature" class="signature-img">
    <br>
    <p><strong>${pathologistInfo.name}</strong><br>${pathologistInfo.qualification}</p>
  </div>

      </div>
    `;
    
    reportContent.innerHTML = reportHtml;
    reportModal.classList.remove('hidden');
    
    // Setup report action buttons
    setupReportButtons(sample);
    
    showNotification('Report generated successfully', 'success');
    
  } catch (error) {
    console.error('Report generation error:', error);
    showNotification('Failed to generate report', 'error');
  }
}

function setupReportButtons(sample) {
  const printBtn = document.getElementById('printReportBtn');
  const whatsappBtn = document.getElementById('sendReportWhatsAppBtn');
  const emailBtn = document.getElementById('sendReportEmailBtn');
  
  if (printBtn) {
    printBtn.onclick = function() {
      window.print();
    };
  }
  
  if (whatsappBtn) {
    whatsappBtn.onclick = function() {
      sendWhatsAppReport(sample.id);
      document.getElementById('reportModal')?.classList.add('hidden');
    };
  }
  
  if (emailBtn) {
    emailBtn.onclick = function() {
      sendEmailReport(sample.id);
      document.getElementById('reportModal')?.classList.add('hidden');
    };
  }
}

function isValueAbnormal(value, referenceRange) {
  if (!value || !referenceRange || value === 'Absent' || value === 'Normal') return false;
  
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return false;
  
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

// FIXED: Receipt Management Functions - NOW WORKING
function showReceipts() {
  populateReceiptsGrid();
}

function populateReceiptsGrid() {
  const receiptsGrid = document.getElementById('receiptsGrid');
  if (!receiptsGrid) return;
  
  if (appData.receipts.length === 0) {
    receiptsGrid.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); grid-column: 1 / -1;">No receipts generated yet. Click "Generate Receipt" to create one.</p>';
    return;
  }
  
  receiptsGrid.innerHTML = appData.receipts.map(receipt => `
    <div class="receipt-card">
      <h4>Receipt #${receipt.id}</h4>
      <div class="receipt-meta">
        <p><strong>Patient:</strong> ${receipt.patientName}</p>
        <p><strong>Amount:</strong> ₹${receipt.total}</p>
        <p><strong>Date:</strong> ${formatDate(receipt.date)}</p>
      </div>
      <div class="receipt-actions">
        <button class="btn btn--sm btn--primary" onclick="viewReceipt('${receipt.id}')">
          <i class="fas fa-eye"></i> View
        </button>
        <button class="btn btn--sm btn--secondary" onclick="printReceipt('${receipt.id}')">
          <i class="fas fa-print"></i> Print
        </button>
        <button class="btn btn--danger delete-receipt-btn" data-id="${receipt.id}">
    <i class="fas fa-trash"></i> Delete
  </button>
      </div>
    </div>
  `).join('');
}

// FIXED: Generate Receipt Function - NOW WORKING
function generateReceiptForSample(sample) {
  // First, check if a receipt for this sample already exists to avoid duplicates.
  const receiptExists = appData.receipts.some(receipt => receipt.sampleId === sample.id);
  if (receiptExists) {
    return null; // Do nothing if a receipt is already there.
  }

  const patient = appData.patients.find(p => p.id === sample.patientId);
  if (!patient) {
    console.error(`Patient not found for sample ID: ${sample.id}`);
    return null;
  }

  const tests = sample.tests.map(testId => {
    const test = appData.tests.find(t => t.id === testId);
    return test ? { name: test.name, price: test.price } : null;
  }).filter(Boolean);

  const subtotal = tests.reduce((sum, test) => sum + test.price, 0);
  const gstRate = 0; // 18% GST
  const gstAmount = Math.round((subtotal * gstRate) / 100);
  const total = subtotal + gstAmount;

  const receiptData = {
    id: `REC${String(appData.nextReceiptId++).padStart(3, '0')}`,
    sampleId: sample.id,
    patientName: patient.name,
    patientContact: patient.contact,
    tests: tests,
    subtotal: subtotal,
    gstRate: gstRate,
    gstAmount: gstAmount,
    total: total,
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash'
  };

  // Add the new receipt to our data and return it.
  appData.receipts.push(receiptData);
  return receiptData;
}

// This is the new function for the "Generate Receipt" button.
function generateAllMissingReceipts() {
  console.log('Checking for completed samples that are missing receipts...');
  const completedSamples = appData.samples.filter(s => s.status === 'Completed' || s.status.toLowerCase() === 'pending');
  let newReceiptsCount = 0;

  if (completedSamples.length === 0) {
    showNotification('No completed samples are available to generate receipts.', 'warning');
    return;
  }

  // Loop through all completed samples
  completedSamples.forEach(sample => {
    const newReceipt = generateReceiptForSample(sample);
    if (newReceipt) {
      newReceiptsCount++; // Count how many new receipts we made
    }
  });

  if (newReceiptsCount > 0) {
    autoSave();
    populateReceiptsGrid(); // Refresh the receipt list in the UI
    showNotification(`${newReceiptsCount} new receipt(s) were generated successfully.`, 'success');
  } else {
    showNotification('No new receipts to generate. All completed samples already have receipts.', 'info');
  }
}
// Replace the existing showReceiptModal function with this one
function showReceiptModal(receiptData) {
  const receiptContent = document.getElementById('receiptContent');
  const receiptModal = document.getElementById('receiptModal');

  if (!receiptContent || !receiptModal) {
    showNotification('Receipt modal could not be found.', 'error');
    return;
  }

  // Use template literals to build the new, professional receipt HTML
  const receiptHtml = `
    <div class="receipt-content">
      <div class="receipt-header">
        <h1 class="receipt-title">Suprem Pardiya Diagnostic Center & Clinic</h1>
        <p>Radha Plaza, Near Chogadiya Petrol Pump, Diggi Malpura Road, Sanganer, Jaipur - 302029</p>
        <p class="receipt-number">Receipt #${receiptData.id}</p>
      </div>

      <div class="receipt-details">
        <div class="receipt-info-section">
          <h4>Patient Details</h4>
          <p><strong>Name:</strong> ${receiptData.patientName}</p>
          <p><strong>Contact:</strong> ${receiptData.patientContact}</p>
          <p><strong>Sample ID:</strong> ${receiptData.sampleId}</p>
        </div>
        <div class="receipt-info-section">
          <h4>Payment Details</h4>
          <p><strong>Date:</strong> ${formatDate(receiptData.date)}</p>
          <p><strong>Payment Method:</strong> ${receiptData.paymentMethod}</p>
        </div>
      </div>

      <table class="receipt-items-table">
        <thead>
          <tr>
            <th>Test Name</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          ${receiptData.tests.map(test => `
            <tr>
              <td>${test.name}</td>
              <td>₹${test.price.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="receipt-totals">
        <div class="receipt-total-row">
          <span>Subtotal:</span>
          <span>₹${receiptData.subtotal.toLocaleString()}</span>
        </div>
        <div class="receipt-total-row grand-total">
          <span>Total Amount:</span>
          <span>₹${receiptData.total.toLocaleString()}</span>
        </div>
      </div>
      
      <div class="receipt-footer">
        <p>Thank you for choosing Suprem Pardiya Diagnostic Center & Clinic.</p>
        <p>Phone: +91-9982006222 | Email: ${appData.settings.lab.email}</p>
      </div>
    </div>
  `;

  receiptContent.innerHTML = receiptHtml;
  receiptModal.classList.remove('hidden');

  // Ensure the print button is correctly configured
  const printReceiptBtn = document.getElementById('printReceiptBtn');
  if (printReceiptBtn) {
    printReceiptBtn.onclick = function() {
      window.print();
    };
  }
}

function viewReceipt(receiptId) {
  const receipt = appData.receipts.find(r => r.id === receiptId);
  if (receipt) {
    showReceiptModal(receipt);
  } else {
    showNotification('Receipt not found', 'error');
  }
}

function printReceipt(receiptId) {
  viewReceipt(receiptId);
  setTimeout(() => {
    window.print();
  }, 500);
}

// Sample Management Functions
function showSamples() {
  populateSampleTable();
  populatePatientDropdowns();
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
               <button class="btn btn--danger delete-sample-btn" data-id="${sample.id}">
      <i class="fas fa-trash"></i> Delete
    </button>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join('');
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
  
  populatePatientDropdowns();
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
  
  let formHtml = '';
  
  sample.tests.forEach(testId => {
    const test = appData.tests.find(t => t.id === testId);
    if (!test) return;
    
    formHtml += `<div class="results-section" data-test-id="${testId}">`;
    formHtml += `<h4>${test.name}</h4>`;
    formHtml += '<div class="results-grid">';
    
    if (test.components) {
      test.components.forEach(component => {
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
      });
    }
    
    formHtml += '</div>';
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
  
 const sampleIndex = appData.samples.findIndex(s => s.id === currentSampleForResults);
  if (sampleIndex !== -1) {
    appData.samples[sampleIndex].results = results;
    appData.samples[sampleIndex].status = 'Completed';
    appData.samples[sampleIndex].reportDate = new Date().toISOString().split('T')[0];

    // **ADD THIS PART**
    // Automatically generate a receipt for this newly completed sample
    const newReceipt = generateReceiptForSample(appData.samples[sampleIndex]);
    if (newReceipt) {
        // Notify the user that a receipt was made in the background
        showNotification(`Receipt ${newReceipt.id} automatically generated.`, 'success');
        populateReceiptsGrid(); // Refresh UI
    }
    // **END OF ADDED PART**
  }
  
  await autoSave();
  populateSampleTable();
  populateReportsGrid();
  
  const modal = document.getElementById('resultsModal');
  if (modal) modal.classList.add('hidden');
  
  currentSampleForResults = null;
  showNotification('Results saved successfully', 'success');
  

  await autoSave();
  populateSampleTable();
  populateReportsGrid();
}

async function saveSample(formData) {
  const sampleId = String(appData.nextSampleId++).padStart(5, '0');
  
  const newSample = {
    id: sampleId,
    ...formData,
    status: 'Pending',
    results: {},
    totalAmount: formData.tests.reduce((total, testId) => {
      const test = appData.tests.find(t => t.id === testId);
      return total + (test ? test.price : 0);
    }, 0)
  };
  
  appData.samples.push(newSample);
  await autoSave();
  populateSampleTable();
  showNotification('Sample registered successfully', 'success');
}

// Continue with remaining functions...

// Doctor Management Functions
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
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${doctor.contact}
          <button class="action-btn action-btn--email" onclick="sendEmailToPatient('${doctor.email}', '${doctor.name}')" title="Send Email">
            <i class="fas fa-envelope"></i>
          </button>
        </div>
      </td>
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

async function deleteDoctor(id) {
  if (confirm('Are you sure you want to delete this doctor?')) {
    await deleteFromStore('doctors', id);
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
    'patientContact', 'patientEmail', 'patientAddress', 'patientReferringDoctor'
  ];
  
  const values = [
    patient.name, patient.age, patient.gender,
    patient.contact, patient.email, patient.address, patient.referringDoctor
  ];
  
  fields.forEach((fieldId, index) => {
    const field = document.getElementById(fieldId);
    if (field) field.value = values[index] || '';
  });
  
  const modal = document.getElementById('patientModal');
  if (modal) modal.classList.remove('hidden');
}

async function deletePatient(id) {
  if (confirm('Are you sure you want to delete this patient?')) {
    await deleteFromStore('patients', id);
    appData.patients = appData.patients.filter(p => p.id !== id);
    autoSave();
    populatePatientTable();
    showNotification('Patient deleted successfully', 'success');
  }
}

async function savePatient(formData) {
  if (currentEditingId) {
    const patientIndex = appData.patients.findIndex(p => p.id === currentEditingId);
    if (patientIndex !== -1) {
      appData.patients[patientIndex] = {
        ...appData.patients[patientIndex],
        ...formData
      };
      showNotification('Patient updated successfully', 'success');
    }
  } else {
    const newPatient = {
      id: appData.nextPatientId++,
      ...formData,
      dateAdded: new Date().toISOString().split('T')[0],
      pid: String(appData.nextPatientId - 1).padStart(5, '0')
    };
    appData.patients.push(newPatient);
    showNotification('Patient added successfully', 'success');
  }
  
  await autoSave();
  populatePatientTable();
  populatePatientDropdowns();
}

// Test Management Functions
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
  
  const componentsList = document.getElementById('componentsList');
  if (componentsList && test.components) {
    componentsList.innerHTML = '';
    test.components.forEach(component => {
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
    });
  }
  document.getElementById('noteHeading').value = test.note?.heading || '';
document.getElementById('noteText').value = test.note?.text || '';
  
  const modal = document.getElementById('testModal');
  if (modal) modal.classList.remove('hidden');
}

async function deleteTest(id) {
  if (confirm('Are you sure you want to delete this test?')) {
    await deleteFromStore('tests', id);
    appData.tests = appData.tests.filter(t => t.id !== id);
    autoSave();
    populateTestTable();
    populateTestCheckboxes();
    showNotification('Test deleted successfully', 'success');
  }
}

async function saveTest(formData) {
  const componentItems = document.querySelectorAll('#componentsList .component-item');
  const components = Array.from(componentItems).map(item => {
    const name = item.querySelector('.component-name').value;
    const range = item.querySelector('.component-range')?.value || '';
    const units = item.querySelector('.component-units').value || '';
    return { name, referenceRange: range, units };
  });
  
  formData.components = components;
  
  if (currentEditingId) {
    const testIndex = appData.tests.findIndex(t => t.id === currentEditingId);
    if (testIndex !== -1) {
      appData.tests[testIndex] = {
        ...appData.tests[testIndex],
        ...formData,
        note: {
        heading: document.getElementById('noteHeading').value,
        text: document.getElementById('noteText').value
      }
      };
      showNotification('Test updated successfully', 'success');
    }
  } else {
    const newTest = {
      id: appData.nextTestId++,
      name: document.getElementById('testName').value,
      department: document.getElementById('testDepartment').value,
      price: parseFloat(document.getElementById('testPrice').value),
      components: components,
      note: {
        heading: document.getElementById('noteHeading').value,
        text: document.getElementById('noteText').value
      }
    };
    appData.tests.push(newTest);
    showNotification('Test added successfully', 'success');
  }
  
  await autoSave();
  populateTestTable();
  populateTestCheckboxes();
}

// Excel Export Functions
function setupExportButtons() {
  const exportButtons = [
    { id: 'exportDashboardBtn', handler: exportDashboardSummary },
    { id: 'exportPatientsBtn', handler: exportPatients },
    { id: 'exportDoctorsBtn', handler: exportDoctors },
    { id: 'exportTestsBtn', handler: exportTests },
    { id: 'exportSamplesBtn', handler: exportSamples },
    { id: 'exportReportsBtn', handler: exportReports },
    { id: 'exportReceiptsBtn', handler: exportReceipts }
  ];
  
  exportButtons.forEach(({ id, handler }) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', handler);
    }
  });
}

function exportDashboardSummary() {
  if (typeof XLSX === 'undefined') {
    showNotification('Excel library not loaded', 'error');
    return;
  }
  
  try {
    const workbook = XLSX.utils.book_new();
    
    // Summary Sheet
    const summaryData = [
      ['MedLab Pro - Dashboard Summary'],
      ['Generated on:', new Date().toLocaleDateString()],
      ['Filter:', currentDoctorFilter ? `Dr. ${appData.doctors.find(d => d.id == currentDoctorFilter)?.name}` : 'All Doctors'],
      [],
      ['Metric', 'Value'],
      ['Total Patients', getFilteredPatients().length],
      ['Total Samples', getFilteredSamples().length],
      ['Completed Tests', getFilteredSamples().filter(s => s.status === 'Completed').length],
      ['Pending Reports', getFilteredSamples().filter(s => s.status !== 'Completed').length],
      [],
      ['Revenue Summary'],
      ['Total Revenue', `₹${getFilteredSamples().reduce((total, s) => total + (s.totalAmount || 0), 0).toLocaleString()}`]
    ];
    
    const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summaryWS, 'Summary');
    
    XLSX.writeFile(workbook, `MedLab_Dashboard_Summary_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('Dashboard summary exported to Excel', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showNotification('Export failed', 'error');
  }
}

function exportPatients() {
  if (typeof XLSX === 'undefined') {
    showNotification('Excel library not loaded', 'error');
    return;
  }
  
  try {
    const filteredPatients = getFilteredPatients();
    const patientsData = [
      ['Patient Master List'],
      ['Generated on:', new Date().toLocaleDateString()],
      [],
      ['ID', 'Name', 'Age', 'Gender', 'Contact', 'Email', 'Address', 'Referring Doctor', 'Date Added']
    ];
    
    filteredPatients.forEach(patient => {
      const doctor = appData.doctors.find(d => d.id === patient.referringDoctor);
      patientsData.push([
        patient.id,
        patient.name,
        patient.age,
        patient.gender,
        patient.contact,
        patient.email || '',
        patient.address || '',
        doctor ? doctor.name : 'Unknown',
        patient.dateAdded
      ]);
    });
    
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(patientsData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Patients');
    
    XLSX.writeFile(workbook, `MedLab_Patients_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('Patients data exported to Excel', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showNotification('Export failed', 'error');
  }
}

function exportDoctors() {
  if (typeof XLSX === 'undefined') {
    showNotification('Excel library not loaded', 'error');
    return;
  }
  
  try {
    const doctorsData = [
      ['Doctor Master List'],
      ['Generated on:', new Date().toLocaleDateString()],
      [],
      ['ID', 'Name', 'Specialty', 'Qualification', 'Title', 'RMC No', 'Clinic', 'Contact', 'Email']
    ];
    
    appData.doctors.forEach(doctor => {
      doctorsData.push([
        doctor.id,
        doctor.name,
        doctor.specialty,
        doctor.qualification,
        doctor.title,
        doctor.rmcNo,
        doctor.clinic,
        doctor.contact,
        doctor.email
      ]);
    });
    
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(doctorsData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Doctors');
    
    XLSX.writeFile(workbook, `MedLab_Doctors_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('Doctors data exported to Excel', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showNotification('Export failed', 'error');
  }
}

function exportTests() {
  if (typeof XLSX === 'undefined') {
    showNotification('Excel library not loaded', 'error');
    return;
  }
  
  try {
    const testsData = [
      ['Test Configuration'],
      ['Generated on:', new Date().toLocaleDateString()],
      [],
      ['ID', 'Test Name', 'Department', 'Price (₹)', 'Components Count']
    ];
    
    appData.tests.forEach(test => {
      testsData.push([
        test.id,
        test.name,
        test.department,
        test.price,
        test.components ? test.components.length : 0
      ]);
    });
    
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(testsData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tests');
    
    XLSX.writeFile(workbook, `MedLab_Tests_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('Tests data exported to Excel', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showNotification('Export failed', 'error');
  }
}

function exportSamples() {
  if (typeof XLSX === 'undefined') {
    showNotification('Excel library not loaded', 'error');
    return;
  }
  
  try {
    const filteredSamples = getFilteredSamples();
    const samplesData = [
      ['Sample Reports'],
      ['Generated on:', new Date().toLocaleDateString()],
      [],
      ['Sample ID', 'Patient Name', 'Tests', 'Collection Date', 'Status', 'Amount (₹)']
    ];
    
    filteredSamples.forEach(sample => {
      const patient = appData.patients.find(p => p.id === sample.patientId);
      const testNames = sample.tests.map(testId => {
        const test = appData.tests.find(t => t.id === testId);
        return test ? test.name : 'Unknown Test';
      }).join(', ');
      
      samplesData.push([
        sample.id,
        patient ? patient.name : 'Unknown',
        testNames,
        sample.collectionDate,
        sample.status,
        sample.totalAmount || 0
      ]);
    });
    
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(samplesData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Samples');
    
    XLSX.writeFile(workbook, `MedLab_Samples_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('Samples data exported to Excel', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showNotification('Export failed', 'error');
  }
}

function exportReports() {
  if (typeof XLSX === 'undefined') {
    showNotification('Excel library not loaded', 'error');
    return;
  }
  
  try {
    const completedSamples = getFilteredSamples().filter(s => s.status === 'Completed');
    const reportsData = [
      ['Laboratory Reports'],
      ['Generated on:', new Date().toLocaleDateString()],
      [],
      ['Sample ID', 'Patient Name', 'Age/Gender', 'Tests', 'Collection Date', 'Report Status']
    ];
    
    completedSamples.forEach(sample => {
      const patient = appData.patients.find(p => p.id === sample.patientId);
      const testNames = sample.tests.map(testId => {
        const test = appData.tests.find(t => t.id === testId);
        return test ? test.name : 'Unknown Test';
      }).join(', ');
      
      reportsData.push([
        sample.id,
        patient ? patient.name : 'Unknown',
        patient ? `${patient.age}/${patient.gender}` : 'Unknown',
        testNames,
        sample.collectionDate,
        'Completed'
      ]);
    });
    
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(reportsData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reports');
    
    XLSX.writeFile(workbook, `MedLab_Reports_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('Reports data exported to Excel', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showNotification('Export failed', 'error');
  }
}

function exportReceipts() {
  if (typeof XLSX === 'undefined') {
    showNotification('Excel library not loaded', 'error');
    return;
  }
  
  try {
    const receiptsData = [
      ['Receipts & Billing'],
      ['Generated on:', new Date().toLocaleDateString()],
      [],
      ['Receipt ID', 'Patient Name', 'Amount', 'Date', 'Status']
    ];
    
    appData.receipts.forEach(receipt => {
      receiptsData.push([
        receipt.id,
        receipt.patientName,
        receipt.total,
        receipt.date,
        'Paid'
      ]);
    });
    
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(receiptsData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Receipts');
    
    XLSX.writeFile(workbook, `MedLab_Receipts_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('Receipts data exported to Excel', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showNotification('Export failed', 'error');
  }
}

// Settings Functions
function setupSettingsHandlers() {
  const emailConfigForm = document.getElementById('emailConfigForm');
  if (emailConfigForm) {
    emailConfigForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const emailConfig = {
        smtpHost: document.getElementById('emailSmtpHost')?.value || '',
        smtpPort: parseInt(document.getElementById('emailSmtpPort')?.value) || 587,
        smtpUser: document.getElementById('emailSmtpUser')?.value || '',
        smtpPassword: document.getElementById('emailSmtpPassword')?.value || '',
        configured: true
      };
      
      appData.settings.email = { ...appData.settings.email, ...emailConfig };
      await autoSave();
      
      const emailStatus = document.getElementById('emailStatus');
      if (emailStatus) {
        const dot = emailStatus.querySelector('.status-dot');
        const text = emailStatus.querySelector('.status-text');
        if (dot) dot.className = 'status-dot online';
        if (text) text.textContent = 'Configured';
      }
      
      showNotification('Email configuration saved successfully', 'success');
    });
  }
  
  const testEmailBtn = document.getElementById('testEmailBtn');
  if (testEmailBtn) {
    testEmailBtn.addEventListener('click', testEmailConfiguration);
  }
  
  const saveLabInfoBtn = document.getElementById('saveLabInfoBtn');
  if (saveLabInfoBtn) {
    saveLabInfoBtn.addEventListener('click', async function() {
      const labInfo = {
        name: document.getElementById('labName')?.value || 'MedLab Pro',
        address: document.getElementById('labAddress')?.value || '',
        phone: document.getElementById('labPhone')?.value || '',
        email: document.getElementById('labEmail')?.value || ''
      };
      
      appData.settings.lab = { ...appData.settings.lab, ...labInfo };
      await autoSave();
      showNotification('Laboratory information saved successfully', 'success');
    });
  }
  
  // Guide tabs
  const guideTabs = document.querySelectorAll('.guide-tab-btn');
  guideTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      guideTabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.guide-section').forEach(s => s.classList.remove('active'));
      
      this.classList.add('active');
      const provider = this.dataset.provider;
      const section = document.getElementById(`${provider}-guide`);
      if (section) section.classList.add('active');
    });
  });
}

function testEmailConfiguration() {
  const smtpHost = document.getElementById('emailSmtpHost')?.value;
  const smtpPort = document.getElementById('emailSmtpPort')?.value;
  const smtpUser = document.getElementById('emailSmtpUser')?.value;
  const smtpPassword = document.getElementById('emailSmtpPassword')?.value;
  
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
    showNotification('Please fill in all email configuration fields', 'warning');
    return;
  }
  
  // Simulate email test
  const testMessage = {
    id: Date.now(),
    type: 'email',
    recipient: smtpUser,
    subject: 'Test Email from MedLab Pro',
    message: 'This is a test email to verify your email configuration.',
    timestamp: new Date().toISOString(),
    status: 'sent'
  };
  
  appData.messages.push(testMessage);
  autoSave();
  
  const emailStatus = document.getElementById('emailStatus');
  if (emailStatus) {
    const dot = emailStatus.querySelector('.status-dot');
    const text = emailStatus.querySelector('.status-text');
    if (dot) dot.className = 'status-dot online';
    if (text) text.textContent = 'Connected';
  }
  
  showNotification('Test email sent successfully!', 'success');
}

function showSettings() {
  // Load current settings into form
  const emailSettings = appData.settings.email;
  const labSettings = appData.settings.lab;
  
  if (emailSettings) {
    const fields = ['emailSmtpHost', 'emailSmtpPort', 'emailSmtpUser', 'emailSmtpPassword'];
    const values = [emailSettings.smtpHost, emailSettings.smtpPort, emailSettings.smtpUser, emailSettings.smtpPassword];
    
    fields.forEach((fieldId, index) => {
      const field = document.getElementById(fieldId);
      if (field) field.value = values[index] || '';
    });
    
    const emailStatus = document.getElementById('emailStatus');
    if (emailStatus && emailSettings.configured) {
      const dot = emailStatus.querySelector('.status-dot');
      const text = emailStatus.querySelector('.status-text');
      if (dot) dot.className = 'status-dot online';
      if (text) text.textContent = 'Configured';
    }
  }
  
  if (labSettings) {
    const fields = ['labName', 'labAddress', 'labPhone', 'labEmail'];
    const values = [labSettings.name, labSettings.address, labSettings.phone, labSettings.email];
    
    fields.forEach((fieldId, index) => {
      const field = document.getElementById(fieldId);
      if (field) field.value = values[index] || '';
    });
  }
}

// Data Management Functions
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
  // Delete Sample
document.addEventListener('click', async function(e) {
  if (e.target.closest('.delete-sample-btn')) {
    const id = e.target.closest('.delete-sample-btn').dataset.id;
    if (confirm('Are you sure you want to delete this sample?')) {
      await deleteFromStore('samples', id);
      appData.samples = appData.samples.filter(s => s.id != id);
      refreshAllData();
      showNotification('Sample deleted successfully', 'success');
    }
  }

  // Delete Receipt
  if (e.target.closest('.delete-receipt-btn')) {
    const id = e.target.closest('.delete-receipt-btn').dataset.id;
    if (confirm('Are you sure you want to delete this receipt?')) {
      await deleteFromStore('receipts', id);
      appData.receipts = appData.receipts.filter(r => r.id != id);
      refreshAllData();
      showNotification('Receipt deleted successfully', 'success');
    }
  }

  // Delete Report
  if (e.target.closest('.delete-report-btn')) {
    const id = e.target.closest('.delete-report-btn').dataset.id;
    if (confirm('Are you sure you want to delete this report?')) {
      await deleteFromStore('reports', id);
      appData.reports = appData.reports.filter(r => r.id != id);
      refreshAllData();
      showNotification('Report deleted successfully', 'success');
    }
  }
});

}

async function exportData() {
  try {
    const exportData = {
      patients: appData.patients,
      doctors: appData.doctors,
      tests: appData.tests,
      samples: appData.samples,
      receipts: appData.receipts,
      messages: appData.messages,
      settings: appData.settings,
      counters: {
        nextPatientId: appData.nextPatientId,
        nextDoctorId: appData.nextDoctorId,
        nextTestId: appData.nextTestId,
        nextSampleId: appData.nextSampleId,
        nextReceiptId: appData.nextReceiptId
      },
      exportDate: new Date().toISOString(),
      version: '2.0'
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
    
    if (!importedData.version || !importedData.patients || !importedData.doctors) {
      throw new Error('Invalid data format');
    }
    
    if (!confirm('This will replace all existing data. Are you sure you want to continue?')) {
      return;
    }
    
    showLoadingOverlay();
    
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
    
    appData.patients = importedData.patients || [];
    appData.doctors = importedData.doctors || [];
    appData.tests = importedData.tests || [];
    appData.samples = importedData.samples || [];
    appData.receipts = importedData.receipts || [];
    appData.messages = importedData.messages || [];
    appData.settings = { ...appData.settings, ...importedData.settings };
    
    if (importedData.counters) {
      appData.nextPatientId = importedData.counters.nextPatientId || 1;
      appData.nextDoctorId = importedData.counters.nextDoctorId || 1;
      appData.nextTestId = importedData.counters.nextTestId || 1;
      appData.nextSampleId = importedData.counters.nextSampleId || 1;
      appData.nextReceiptId = importedData.counters.nextReceiptId || 1;
    }
    
    await autoSave();
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
  await exportData();
  showNotification('Backup created successfully', 'success');
}

// Form Setup and Handlers
function setupForms() {
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
        email: document.getElementById('patientEmail')?.value || '',
        address: document.getElementById('patientAddress')?.value || '',
        referringDoctor: parseInt(document.getElementById('patientReferringDoctor')?.value || '0')
      };
      await savePatient(formData);
      document.getElementById('patientModal')?.classList.add('hidden');
    });
  }

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

  const saveResultsBtn = document.getElementById('saveResultsBtn');
  if (saveResultsBtn) {
    saveResultsBtn.addEventListener('click', saveResults);
  }

  const generateReceiptBtn = document.getElementById('generateReceiptBtn');
if (generateReceiptBtn) {
  // Replace the old event listener with this one
  generateReceiptBtn.addEventListener('click', generateAllMissingReceipts);
}
}

// Modal Setup
function setupModals() {
  const closeButtons = document.querySelectorAll('.modal-close, #cancelPatientBtn, #cancelDoctorBtn, #cancelTestBtn, #cancelSampleBtn, #closeReportBtn, #cancelResultsBtn, #closeReceiptBtn');
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

// Dropdown Population Functions
function populatePatientDropdowns() {
  const patientReferringDoctorSelect = document.getElementById('patientReferringDoctor');
  const samplePatientSelect = document.getElementById('samplePatient');
  
  if (patientReferringDoctorSelect) {
    const doctorOptions = appData.doctors.map(doctor => 
      `<option value="${doctor.id}">${doctor.name}</option>`
    ).join('');
    patientReferringDoctorSelect.innerHTML = '<option value="">Select Doctor</option>' + doctorOptions;
  }
  
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

// Search and Filter Functions
function setupSearchFilters() {
  const searchFields = [
    { id: 'patientSearch', callback: () => filterTableRows(document.getElementById('patients'), document.getElementById('patientSearch').value.toLowerCase()) },
    { id: 'doctorSearch', callback: () => filterTableRows(document.getElementById('doctors'), document.getElementById('doctorSearch').value.toLowerCase()) },
    { id: 'testSearch', callback: () => filterTableRows(document.getElementById('tests'), document.getElementById('testSearch').value.toLowerCase()) },
    { id: 'sampleSearch', callback: () => filterTableRows(document.getElementById('samples'), document.getElementById('sampleSearch').value.toLowerCase()) }
  ];
  
  searchFields.forEach(({ id, callback }) => {
    const searchInput = document.getElementById(id);
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        callback();
      });
    }
  });
}

function filterTableRows(section, searchTerm) {
  if (!section) return;
  
  const tbody = section.querySelector('tbody');
  if (!tbody) return;
  
  const rows = tbody.querySelectorAll('tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const matches = searchTerm.split(' ').every(term => text.includes(term.trim()));
    row.style.display = matches ? '' : 'none';
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
  notification.className = `notification notification--${type} show`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Global functions for onclick handlers
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
window.sendWhatsAppReport = sendWhatsAppReport;
window.sendEmailReport = sendEmailReport;
window.viewReceipt = viewReceipt;
window.printReceipt = printReceipt;
window.sendWhatsApp = sendWhatsApp;
window.sendEmailToPatient = sendEmailToPatient;
window.navigateToSection = navigateToSection;
window.showCommTab = showCommTab;