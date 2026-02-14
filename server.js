const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || '');
    cb(null, `upi-${unique}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only image files are allowed for UPI image.'));
  }
});

const DB_PATH = path.join(__dirname, 'db.sqlite');
const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      role TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      track_size TEXT NOT NULL,
      jersey_size TEXT NOT NULL,
      jersey_number INTEGER NOT NULL,
      payment_option TEXT NOT NULL,
      upi_image_path TEXT,
      created_at TEXT NOT NULL,
      collected INTEGER NOT NULL DEFAULT 0
    )`
  );
  db.all(`PRAGMA table_info(players)`, [], (err, rows) => {
    if (err) return;
    const hasCollected = Array.isArray(rows) && rows.some(r => r.name === 'collected');
    if (!hasCollected) {
      db.run(`ALTER TABLE players ADD COLUMN collected INTEGER NOT NULL DEFAULT 0`);
    }
  });
});

app.use('/uploads', express.static(UPLOAD_DIR));

function basicAuth(req, res, next) {
  const adminUser = process.env.ADMIN_USER || 'Admin123';
  const adminPass = process.env.ADMIN_PASSWORD || 'justAdmin@CK';
  const hdr = req.headers['authorization'] || '';
  const prefix = 'Basic ';
  if (!hdr.startsWith(prefix)) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }
  const decoded = Buffer.from(hdr.slice(prefix.length), 'base64').toString();
  const [user, pass] = decoded.split(':');
  if (user === adminUser && pass === adminPass) {
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Invalid credentials');
}

function sendFile(res, file) {
  res.sendFile(path.join(PUBLIC_DIR, file));
}

app.get('/', (req, res) => sendFile(res, 'index.html'));
app.get('/admin', basicAuth, (req, res) => sendFile(res, 'admin.html'));
app.get('/admin.html', basicAuth, (req, res) => sendFile(res, 'admin.html'));
app.use(express.static(PUBLIC_DIR));

function sanitizeString(s) {
  return String(s || '').trim();
}

function badRequest(res, msg) {
  return res.status(400).json({ ok: false, error: msg });
}

app.post('/api/register', upload.single('upiImage'), (req, res) => {
  try {
    const {
      name,
      age,
      role,
      contactNumber,
      trackSize,
      jerseySize,
      jerseyNumber,
      paymentOption
    } = req.body;

    const vName = sanitizeString(name);
    const vRole = sanitizeString(role).toLowerCase();
    const vContact = sanitizeString(contactNumber);
    const vTrack = sanitizeString(trackSize);
    const vJerseySize = sanitizeString(jerseySize);
    const vPayment = sanitizeString(paymentOption).toLowerCase();

    const vAge = Number(age);
    const vJerseyNo = Number(jerseyNumber);

    if (!vName) return badRequest(res, 'Player name is required.');
    if (!Number.isInteger(vAge) || vAge <= 0) return badRequest(res, 'Valid age is required.');
    if (!['batsman', 'bowler', 'all-rounder'].includes(vRole))
      return badRequest(res, 'Role must be Batsman, Bowler, or All-Rounder.');
    if (!vContact || !/^\d{7,15}$/.test(vContact))
      return badRequest(res, 'Valid contact number (digits only) is required.');
    if (!vTrack) return badRequest(res, 'Track size is required.');
    if (!vJerseySize) return badRequest(res, 'Jersey size is required.');
    if (!Number.isInteger(vJerseyNo) || vJerseyNo < 0)
      return badRequest(res, 'Valid jersey number is required.');
    if (!['cash', 'upi'].includes(vPayment))
      return badRequest(res, 'Payment option must be Cash or UPI.');

    let upiPath = null;
    if (vPayment === 'upi') {
      upiPath = req.file ? `/uploads/${path.basename(req.file.path)}` : null;
    } else {
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, () => {});
      }
    }

    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO players
        (name, age, role, contact_number, track_size, jersey_size, jersey_number, payment_option, upi_image_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      vName,
      vAge,
      vRole,
      vContact,
      vTrack,
      vJerseySize,
      vJerseyNo,
      vPayment,
      upiPath,
      now,
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ ok: false, error: 'Database error.' });
        }
        return res.json({ ok: true, id: this.lastID });
      }
    );
    stmt.finalize();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'Unexpected server error.' });
  }
});

app.get('/api/players', basicAuth, (req, res) => {
  db.all('SELECT * FROM players ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ ok: false, error: 'Database error.' });
    }
    res.json({ ok: true, players: rows });
  });
});

app.patch('/api/players/:id/collected', basicAuth, (req, res) => {
  const id = Number(req.params.id);
  const val = req.body && (req.body.collected === true || req.body.collected === 1 || req.body.collected === '1');
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Invalid id' });
  db.run('UPDATE players SET collected = ? WHERE id = ?', [val ? 1 : 0, id], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ ok: false, error: 'Database error.' });
    }
    res.json({ ok: true, updated: this.changes });
  });
});

app.delete('/api/players/:id', basicAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Invalid id' });
  db.get('SELECT upi_image_path FROM players WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ ok: false, error: 'Database error.' });
    }
    db.run('DELETE FROM players WHERE id = ?', [id], function (err2) {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ ok: false, error: 'Database error.' });
      }
      if (row && row.upi_image_path) {
        const abs = path.join(__dirname, row.upi_image_path.replace(/^\//, ''));
        fs.unlink(abs, () => {});
      }
      res.json({ ok: true, deleted: this.changes });
    });
  });
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
