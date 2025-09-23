
// Enhanced Medical Laboratory Management System Backend with Email Integration
// File: enhanced_server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// File upload configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});
const upload = multer({ storage: storage });

// Initialize SQLite Database
const dbPath = path.join(__dirname, 'medical_lab.db');
const db = new sqlite3.Database(dbPath);

// Email configuration (will be stored in database)
let emailConfig = {
  host: '',
  port: 587,
  secure: false,
  auth: {
    user: '',
    pass: ''
  }
};

// Create tables
db.serialize(() => {
  // ... (previous table creation code) ...

  // Email settings table
  db.run(`CREATE TABLE IF NOT EXISTS email_settings (
    id INTEGER PRIMARY KEY,
    smtp_host TEXT,
    smtp_port INTEGER DEFAULT 587,
    smtp_user TEXT,
    smtp_password TEXT,
    from_name TEXT DEFAULT 'MedLab Pro',
    from_email TEXT,
    is_configured BOOLEAN DEFAULT 0,
    created_date DATE DEFAULT (datetime('now', 'localtime'))
  )`);

  // Message templates table
  db.run(`CREATE TABLE IF NOT EXISTS message_templates (
    id INTEGER PRIMARY KEY,
    template_name TEXT UNIQUE,
    template_type TEXT, -- 'email' or 'whatsapp'
    subject TEXT,
    message_body TEXT,
    variables TEXT, -- JSON array of available variables
    created_date DATE DEFAULT (datetime('now', 'localtime'))
  )`);

  // Communication log table
  db.run(`CREATE TABLE IF NOT EXISTS communication_log (
    id INTEGER PRIMARY KEY,
    patient_id INTEGER,
    communication_type TEXT, -- 'email', 'whatsapp', 'sms'
    recipient TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending', -- 'sent', 'failed', 'pending'
    sent_date DATE DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`);
});

// Helper functions
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

// Email configuration endpoints
app.get('/api/email-settings', async (req, res) => {
  try {
    const settings = await dbGet('SELECT * FROM email_settings ORDER BY id DESC LIMIT 1');
    if (settings) {
      // Don't send password to client
      const { smtp_password, ...safeSettings } = settings;
      res.json(safeSettings);
    } else {
      res.json({ is_configured: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/email-settings', async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_password, from_name, from_email } = req.body;

    // Clear existing settings
    await dbRun('DELETE FROM email_settings');

    // Insert new settings
    await dbRun(
      'INSERT INTO email_settings (smtp_host, smtp_port, smtp_user, smtp_password, from_name, from_email, is_configured) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [smtp_host, smtp_port, smtp_user, smtp_password, from_name, from_email]
    );

    // Update email config for nodemailer
    emailConfig = {
      host: smtp_host,
      port: smtp_port,
      secure: smtp_port === 465,
      auth: {
        user: smtp_user,
        pass: smtp_password
      }
    };

    res.json({ message: 'Email settings saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
  try {
    const { to_email, test_message } = req.body;
    const settings = await dbGet('SELECT * FROM email_settings ORDER BY id DESC LIMIT 1');

    if (!settings || !settings.is_configured) {
      return res.status(400).json({ error: 'Email not configured. Please configure SMTP settings first.' });
    }

    const transporter = nodemailer.createTransporter({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_port === 465,
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_password
      }
    });

    const mailOptions = {
      from: `"${settings.from_name}" <${settings.from_email}>`,
      to: to_email,
      subject: 'Test Email from MedLab Pro',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Test Email - MedLab Pro</h2>
          <p>This is a test email to verify your SMTP configuration.</p>
          <p><strong>Message:</strong> ${test_message || 'Email configuration is working correctly!'}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            Sent from MedLab Pro Laboratory Management System<br>
            ${new Date().toLocaleString()}
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    // Log the communication
    await dbRun(
      'INSERT INTO communication_log (communication_type, recipient, message, status) VALUES (?, ?, ?, ?)',
      ['email', to_email, 'Test email', 'sent']
    );

    res.json({ message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ error: `Failed to send email: ${error.message}` });
  }
});

// Send report via email
app.post('/api/send-report-email', async (req, res) => {
  try {
    const { patient_id, sample_id, to_email, patient_name, report_data } = req.body;
    const settings = await dbGet('SELECT * FROM email_settings ORDER BY id DESC LIMIT 1');

    if (!settings || !settings.is_configured) {
      return res.status(400).json({ error: 'Email not configured' });
    }

    const transporter = nodemailer.createTransporter({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_port === 465,
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_password
      }
    });

    const mailOptions = {
      from: `"${settings.from_name}" <${settings.from_email}>`,
      to: to_email,
      subject: `Medical Report - ${patient_name} - ${sample_id}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Medical Laboratory Report</h2>
          <p>Dear ${patient_name},</p>
          <p>Your medical test results are ready. Please find the details below:</p>

          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Report Details</h3>
            <p><strong>Sample ID:</strong> ${sample_id}</p>
            <p><strong>Report Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>

          <p>For detailed results and consultation, please contact our laboratory:</p>
          <ul>
            <li>Phone: +91-11-2345-6789</li>
            <li>Email: reports@medlabpro.com</li>
            <li>Address: 123 Medical Plaza, Healthcare District</li>
          </ul>

          <p style="color: #dc2626; font-weight: bold;">
            Important: This report is for your reference. Please consult with your referring physician for proper interpretation.
          </p>

          <hr>
          <p style="color: #666; font-size: 12px;">
            MedLab Pro - Professional Laboratory Services<br>
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    // Log the communication
    await dbRun(
      'INSERT INTO communication_log (patient_id, communication_type, recipient, message, status) VALUES (?, ?, ?, ?, ?)',
      [patient_id, 'email', to_email, `Report sent for sample ${sample_id}`, 'sent']
    );

    res.json({ message: 'Report sent via email successfully!' });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ error: `Failed to send report: ${error.message}` });
  }
});

// Excel export endpoint
app.post('/api/export-excel', async (req, res) => {
  try {
    const { export_type, filters } = req.body;

    let workbook = XLSX.utils.book_new();

    if (export_type === 'summary' || export_type === 'all') {
      // Export summary data
      const patients = await dbAll('SELECT * FROM patients');
      const doctors = await dbAll('SELECT * FROM doctors');
      const samples = await dbAll('SELECT * FROM samples');
      const tests = await dbAll('SELECT * FROM tests');

      // Create summary worksheet
      const summaryData = [
        ['MedLab Pro - Laboratory Summary Report'],
        ['Generated on:', new Date().toLocaleString()],
        [''],
        ['Statistics'],
        ['Total Patients:', patients.length],
        ['Total Doctors:', doctors.length],
        ['Total Samples:', samples.length],
        ['Total Tests Available:', tests.length],
        [''],
        ['Sample Status Breakdown'],
        ['Completed:', samples.filter(s => JSON.parse(s.status || '""') === 'Completed').length],
        ['Pending:', samples.filter(s => JSON.parse(s.status || '""') === 'Pending').length],
        ['Processing:', samples.filter(s => JSON.parse(s.status || '""') === 'Processing').length]
      ];

      const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summaryWS, 'Summary');
    }

    if (export_type === 'patients' || export_type === 'all') {
      // Export patients data
      let patientsQuery = 'SELECT p.*, d.name as doctor_name FROM patients p LEFT JOIN doctors d ON p.referring_doctor = d.id';
      const patients = await dbAll(patientsQuery);

      const patientsWS = XLSX.utils.json_to_sheet(patients.map(p => ({
        'PID': p.pid,
        'Name': p.name,
        'Age': p.age,
        'Gender': p.gender,
        'Contact': p.contact,
        'Address': p.address,
        'Referring Doctor': p.doctor_name,
        'Date Added': p.date_added
      })));
      XLSX.utils.book_append_sheet(workbook, patientsWS, 'Patients');
    }

    if (export_type === 'doctors' || export_type === 'all') {
      // Export doctors data
      const doctors = await dbAll('SELECT * FROM doctors');
      const doctorsWS = XLSX.utils.json_to_sheet(doctors.map(d => ({
        'Name': d.name,
        'Specialty': d.specialty,
        'Qualification': d.qualification,
        'Clinic': d.clinic,
        'Contact': d.contact,
        'Email': d.email,
        'RMC No': d.rmc_no
      })));
      XLSX.utils.book_append_sheet(workbook, doctorsWS, 'Doctors');
    }

    if (export_type === 'samples' || export_type === 'all') {
      // Export samples data
      const samples = await dbAll(`
        SELECT s.*, p.name as patient_name, p.contact as patient_contact 
        FROM samples s 
        LEFT JOIN patients p ON s.patient_id = p.id
      `);

      const samplesWS = XLSX.utils.json_to_sheet(samples.map(s => ({
        'Sample ID': s.id,
        'Patient Name': s.patient_name,
        'Patient Contact': s.patient_contact,
        'Collection Date': s.collection_date,
        'Status': JSON.parse(s.status || '""'),
        'Tests': JSON.parse(s.tests || '[]').join(', ')
      })));
      XLSX.utils.book_append_sheet(workbook, samplesWS, 'Samples');
    }

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=MedLab_Export_${Date.now()}.xlsx`);
    res.send(excelBuffer);

  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// WhatsApp message generation endpoint
app.post('/api/generate-whatsapp-link', (req, res) => {
  try {
    const { phone_number, patient_name, message_type, sample_id } = req.body;

    // Clean phone number (remove +91 if present, spaces, dashes)
    let cleanPhone = phone_number.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
      cleanPhone = cleanPhone.substring(2);
    }

    // Generate message based on type
    let message = '';
    switch (message_type) {
      case 'report_ready':
        message = `Hello ${patient_name}, your medical report is ready for collection at MedLab Pro. Report ID: ${sample_id}. Contact: +91-11-2345-6789`;
        break;
      case 'appointment_reminder':
        message = `Dear ${patient_name}, this is a reminder for your appointment at MedLab Pro. Contact: +91-11-2345-6789`;
        break;
      case 'result_inquiry':
        message = `Hello ${patient_name}, regarding your test results. Please contact MedLab Pro at +91-11-2345-6789 for details.`;
        break;
      default:
        message = `Hello ${patient_name}, this is a message from MedLab Pro. Contact: +91-11-2345-6789`;
    }

    // Create WhatsApp URL
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/91${cleanPhone}?text=${encodedMessage}`;

    res.json({
      whatsapp_url: whatsappUrl,
      formatted_phone: `+91-${cleanPhone}`,
      message: message
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Communication log endpoints
app.get('/api/communication-log', async (req, res) => {
  try {
    const logs = await dbAll(`
      SELECT c.*, p.name as patient_name 
      FROM communication_log c 
      LEFT JOIN patients p ON c.patient_id = p.id 
      ORDER BY c.sent_date DESC 
      LIMIT 100
    `);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ... (previous API endpoints remain the same) ...

// Enhanced health check with system status
app.get('/health', async (req, res) => {
  try {
    const patientCount = await dbGet('SELECT COUNT(*) as count FROM patients');
    const sampleCount = await dbGet('SELECT COUNT(*) as count FROM samples');
    const emailSettings = await dbGet('SELECT is_configured FROM email_settings ORDER BY id DESC LIMIT 1');

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: 'Connected',
      statistics: {
        patients: patientCount?.count || 0,
        samples: sampleCount?.count || 0
      },
      email_configured: emailSettings?.is_configured || false
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n=== MedLab Pro Enhanced Server ===`);
  console.log(`Server running on port ${PORT}`);
  console.log(`Web Interface: http://localhost:${PORT}`);
  console.log(`API Base URL: http://localhost:${PORT}/api`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log(`\nFeatures Available:`);
  console.log(`✓ Complete Laboratory Management`);
  console.log(`✓ Email Integration with SMTP`);
  console.log(`✓ WhatsApp Link Generation`);
  console.log(`✓ Excel Export Functionality`);
  console.log(`✓ Data Persistence with SQLite`);
  console.log(`✓ Communication Logging`);
  console.log(`=====================================\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down MedLab Pro server...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});
