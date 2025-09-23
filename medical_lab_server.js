
// Medical Laboratory Management System Backend Server
// File: server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files

// Initialize SQLite Database
const dbPath = path.join(__dirname, 'medical_lab.db');
const db = new sqlite3.Database(dbPath);

// Create tables if they don't exist
db.serialize(() => {
  // Patients table
  db.run(`CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    age INTEGER,
    gender TEXT,
    contact TEXT,
    address TEXT,
    referring_doctor INTEGER,
    ref_id TEXT,
    org_id TEXT,
    pid TEXT UNIQUE,
    date_added DATE DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (referring_doctor) REFERENCES doctors(id)
  )`);

  // Doctors table
  db.run(`CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    specialty TEXT,
    qualification TEXT,
    title TEXT,
    rmc_no TEXT,
    clinic TEXT,
    contact TEXT,
    email TEXT
  )`);

  // Tests table
  db.run(`CREATE TABLE IF NOT EXISTS tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    department TEXT,
    price REAL,
    components TEXT, -- JSON string
    created_date DATE DEFAULT (datetime('now', 'localtime'))
  )`);

  // Samples table
  db.run(`CREATE TABLE IF NOT EXISTS samples (
    id TEXT PRIMARY KEY,
    patient_id INTEGER,
    tests TEXT, -- JSON array of test IDs
    collection_date DATE,
    registration_date DATE,
    report_date DATE,
    status TEXT DEFAULT 'Pending',
    appointment_no TEXT,
    prepaid_by TEXT,
    results TEXT, -- JSON object
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`);

  // Reports table
  db.run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id TEXT,
    generated_date DATE DEFAULT (datetime('now', 'localtime')),
    report_data TEXT, -- JSON object
    delivered BOOLEAN DEFAULT 0,
    FOREIGN KEY (sample_id) REFERENCES samples(id)
  )`);

  // Receipts table
  db.run(`CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    sample_id TEXT,
    amount REAL,
    payment_method TEXT,
    receipt_date DATE DEFAULT (datetime('now', 'localtime')),
    receipt_data TEXT, -- JSON object
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (sample_id) REFERENCES samples(id)
  )`);
});

// Helper function to run database queries with promises
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// API Routes

// Patients Routes
app.get('/api/patients', async (req, res) => {
  try {
    const patients = await dbAll('SELECT * FROM patients ORDER BY date_added DESC');
    res.json(patients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/patients', async (req, res) => {
  try {
    const { name, age, gender, contact, address, referring_doctor, ref_id, org_id, pid } = req.body;
    const result = await dbRun(
      'INSERT INTO patients (name, age, gender, contact, address, referring_doctor, ref_id, org_id, pid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, age, gender, contact, address, referring_doctor, ref_id, org_id, pid]
    );
    res.json({ id: result.id, message: 'Patient created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/patients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, age, gender, contact, address, referring_doctor, ref_id, org_id, pid } = req.body;
    await dbRun(
      'UPDATE patients SET name = ?, age = ?, gender = ?, contact = ?, address = ?, referring_doctor = ?, ref_id = ?, org_id = ?, pid = ? WHERE id = ?',
      [name, age, gender, contact, address, referring_doctor, ref_id, org_id, pid, id]
    );
    res.json({ message: 'Patient updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/patients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun('DELETE FROM patients WHERE id = ?', [id]);
    res.json({ message: 'Patient deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Doctors Routes
app.get('/api/doctors', async (req, res) => {
  try {
    const doctors = await dbAll('SELECT * FROM doctors ORDER BY name');
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/doctors', async (req, res) => {
  try {
    const { name, specialty, qualification, title, rmc_no, clinic, contact, email } = req.body;
    const result = await dbRun(
      'INSERT INTO doctors (name, specialty, qualification, title, rmc_no, clinic, contact, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, specialty, qualification, title, rmc_no, clinic, contact, email]
    );
    res.json({ id: result.id, message: 'Doctor created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tests Routes
app.get('/api/tests', async (req, res) => {
  try {
    const tests = await dbAll('SELECT * FROM tests ORDER BY name');
    // Parse JSON components for each test
    const testsWithComponents = tests.map(test => ({
      ...test,
      components: JSON.parse(test.components || '[]')
    }));
    res.json(testsWithComponents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tests', async (req, res) => {
  try {
    const { name, department, price, components } = req.body;
    const result = await dbRun(
      'INSERT INTO tests (name, department, price, components) VALUES (?, ?, ?, ?)',
      [name, department, price, JSON.stringify(components || [])]
    );
    res.json({ id: result.id, message: 'Test created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Samples Routes
app.get('/api/samples', async (req, res) => {
  try {
    const samples = await dbAll('SELECT * FROM samples ORDER BY collection_date DESC');
    // Parse JSON fields
    const samplesWithParsedData = samples.map(sample => ({
      ...sample,
      tests: JSON.parse(sample.tests || '[]'),
      results: JSON.parse(sample.results || '{}')
    }));
    res.json(samplesWithParsedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/samples', async (req, res) => {
  try {
    const { id, patient_id, tests, collection_date, registration_date, report_date, status, appointment_no, prepaid_by, results } = req.body;
    await dbRun(
      'INSERT OR REPLACE INTO samples (id, patient_id, tests, collection_date, registration_date, report_date, status, appointment_no, prepaid_by, results) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, patient_id, JSON.stringify(tests), collection_date, registration_date, report_date, status, appointment_no, prepaid_by, JSON.stringify(results || {})]
    );
    res.json({ message: 'Sample saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reports Routes
app.get('/api/reports', async (req, res) => {
  try {
    const reports = await dbAll(`
      SELECT r.*, s.patient_id, p.name as patient_name 
      FROM reports r 
      JOIN samples s ON r.sample_id = s.id 
      JOIN patients p ON s.patient_id = p.id
      ORDER BY r.generated_date DESC
    `);
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reports', async (req, res) => {
  try {
    const { sample_id, report_data } = req.body;
    const result = await dbRun(
      'INSERT INTO reports (sample_id, report_data) VALUES (?, ?)',
      [sample_id, JSON.stringify(report_data)]
    );
    res.json({ id: result.id, message: 'Report generated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Receipts Routes
app.get('/api/receipts', async (req, res) => {
  try {
    const receipts = await dbAll(`
      SELECT r.*, p.name as patient_name 
      FROM receipts r 
      JOIN patients p ON r.patient_id = p.id
      ORDER BY r.receipt_date DESC
    `);
    res.json(receipts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/receipts', async (req, res) => {
  try {
    const { patient_id, sample_id, amount, payment_method, receipt_data } = req.body;
    const result = await dbRun(
      'INSERT INTO receipts (patient_id, sample_id, amount, payment_method, receipt_data) VALUES (?, ?, ?, ?, ?)',
      [patient_id, sample_id, amount, payment_method, JSON.stringify(receipt_data)]
    );
    res.json({ id: result.id, message: 'Receipt created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Data Export/Import Routes
app.get('/api/export', async (req, res) => {
  try {
    const patients = await dbAll('SELECT * FROM patients');
    const doctors = await dbAll('SELECT * FROM doctors');
    const tests = await dbAll('SELECT * FROM tests');
    const samples = await dbAll('SELECT * FROM samples');
    const reports = await dbAll('SELECT * FROM reports');
    const receipts = await dbAll('SELECT * FROM receipts');

    const exportData = {
      patients,
      doctors,
      tests: tests.map(test => ({
        ...test,
        components: JSON.parse(test.components || '[]')
      })),
      samples: samples.map(sample => ({
        ...sample,
        tests: JSON.parse(sample.tests || '[]'),
        results: JSON.parse(sample.results || '{}')
      })),
      reports,
      receipts,
      exportDate: new Date().toISOString()
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=medlab_backup.json');
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/import', async (req, res) => {
  try {
    const { patients, doctors, tests, samples, reports, receipts } = req.body;

    // Clear existing data (optional - you might want to merge instead)
    await dbRun('DELETE FROM receipts');
    await dbRun('DELETE FROM reports');
    await dbRun('DELETE FROM samples');
    await dbRun('DELETE FROM tests');
    await dbRun('DELETE FROM doctors');
    await dbRun('DELETE FROM patients');

    // Import doctors first (referenced by patients)
    for (const doctor of doctors || []) {
      await dbRun(
        'INSERT INTO doctors (id, name, specialty, qualification, title, rmc_no, clinic, contact, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [doctor.id, doctor.name, doctor.specialty, doctor.qualification, doctor.title, doctor.rmc_no, doctor.clinic, doctor.contact, doctor.email]
      );
    }

    // Import patients
    for (const patient of patients || []) {
      await dbRun(
        'INSERT INTO patients (id, name, age, gender, contact, address, referring_doctor, ref_id, org_id, pid, date_added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [patient.id, patient.name, patient.age, patient.gender, patient.contact, patient.address, patient.referring_doctor, patient.ref_id, patient.org_id, patient.pid, patient.date_added]
      );
    }

    // Import tests
    for (const test of tests || []) {
      await dbRun(
        'INSERT INTO tests (id, name, department, price, components) VALUES (?, ?, ?, ?, ?)',
        [test.id, test.name, test.department, test.price, JSON.stringify(test.components || [])]
      );
    }

    // Import samples
    for (const sample of samples || []) {
      await dbRun(
        'INSERT INTO samples (id, patient_id, tests, collection_date, registration_date, report_date, status, appointment_no, prepaid_by, results) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [sample.id, sample.patient_id, JSON.stringify(sample.tests), sample.collection_date, sample.registration_date, sample.report_date, sample.status, sample.appointment_no, sample.prepaid_by, JSON.stringify(sample.results || {})]
      );
    }

    // Import reports
    for (const report of reports || []) {
      await dbRun(
        'INSERT INTO reports (id, sample_id, generated_date, report_data, delivered) VALUES (?, ?, ?, ?, ?)',
        [report.id, report.sample_id, report.generated_date, report.report_data, report.delivered]
      );
    }

    // Import receipts
    for (const receipt of receipts || []) {
      await dbRun(
        'INSERT INTO receipts (id, patient_id, sample_id, amount, payment_method, receipt_date, receipt_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [receipt.id, receipt.patient_id, receipt.sample_id, receipt.amount, receipt.payment_method, receipt.receipt_date, receipt.receipt_data]
      );
    }

    res.json({ message: 'Data imported successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve the frontend application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Medical Lab Management System Server running on port ${PORT}`);
  console.log(`Access the application at: http://localhost:${PORT}`);
  console.log(`API endpoints available at: http://localhost:${PORT}/api/`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});
