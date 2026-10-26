/**
 * ROCKSTAR License Server
 * 1 License Key = 1 Device
 * Admin can generate / ban keys anytime
 *
 * Run: npm install && npm start
 * Default port: 3847
 */

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3847;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "ROCKSTAR_ADMIN_2026"; // CHANGE THIS!

// Data file (simple JSON storage)
const DATA_FILE = path.join(__dirname, "licenses.json");

// Load / Save helpers
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Load error:", e.message);
  }
  return { licenses: {}, adminLog: [] };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Save error:", e.message);
  }
}

let db = loadData();

// Middleware
app.use(cors({ origin: "*" }));
app.use(bodyParser.json());

// ========== HELPERS ==========
function generateKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1 to avoid confusion
  let key = "";
  for (let g = 0; g < 4; g++) {
    if (g > 0) key += " ";
    for (let i = 0; i < 4; i++) {
      key += chars[crypto.randomInt(0, chars.length)];
    }
  }
  return key; // e.g. ABHD ODHS JSJS KQWE
}

function normalizeKey(key) {
  if (!key) return "";
  const clean = String(key).replace(/[\s\-]/g, "").toUpperCase();
  if (clean.length !== 16) return clean;
  return clean.match(/.{1,4}/g).join(" ");
}

function logAdmin(action, detail) {
  db.adminLog.push({
    time: new Date().toISOString(),
    action,
    detail
  });
  if (db.adminLog.length > 500) db.adminLog = db.adminLog.slice(-300);
  saveData(db);
}

// ========== PUBLIC API ==========

// Validate / Activate license (called by extension)
app.post("/api/validate", (req, res) => {
  try {
    const { licenseKey, fingerprint, version } = req.body || {};
    const key = normalizeKey(licenseKey);

    if (!key || key.length < 10) {
      return res.json({ valid: false, message: "Invalid license key" });
    }
    if (!fingerprint) {
      return res.json({ valid: false, message: "Device fingerprint missing" });
    }

    const lic = db.licenses[key];

    if (!lic) {
      return res.json({ valid: false, message: "License key not found" });
    }

    if (lic.banned) {
      return res.json({ valid: false, message: "This license has been banned by admin" });
    }

    // First activation → bind to this device
    if (!lic.fingerprint) {
      lic.fingerprint = fingerprint;
      lic.activatedAt = new Date().toISOString();
      lic.lastUsed = new Date().toISOString();
      lic.activations = (lic.activations || 0) + 1;
      lic.version = version || "";
      saveData(db);
      logAdmin("ACTIVATE", `${key} → device ${fingerprint.slice(0, 12)}...`);
      return res.json({
        valid: true,
        message: "License activated & bound to this device",
        data: {
          name: lic.note || "User",
          userName: lic.note || "User",
          licenseKey: key,
          fingerprint,
          licenseValidated: true,
          timestamp: Date.now()
        }
      });
    }

    // Already bound → check same device
    if (lic.fingerprint !== fingerprint) {
      return res.json({
        valid: false,
        message: "This license is already activated on another device"
      });
    }

    // Same device → OK
    lic.lastUsed = new Date().toISOString();
    lic.version = version || lic.version;
    saveData(db);

    return res.json({
      valid: true,
      message: "License valid",
      data: {
        name: lic.note || "User",
        userName: lic.note || "User",
        licenseKey: key,
        fingerprint,
        licenseValidated: true,
        timestamp: Date.now()
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ valid: false, message: "Server error" });
  }
});

// Status check (periodic)
app.post("/api/status", (req, res) => {
  try {
    const { licenseKey, fingerprint } = req.body || {};
    const key = normalizeKey(licenseKey);
    const lic = db.licenses[key];

    if (!lic || lic.banned) {
      return res.json({ valid: false, message: "License banned or invalid" });
    }
    if (lic.fingerprint && lic.fingerprint !== fingerprint) {
      return res.json({ valid: false, message: "Device mismatch" });
    }
    lic.lastUsed = new Date().toISOString();
    saveData(db);
    return res.json({ valid: true });
  } catch (e) {
    res.json({ valid: false });
  }
});

// Heartbeat
app.post("/api/heartbeat", (req, res) => {
  try {
    const { licenseKey, fingerprint } = req.body || {};
    const key = normalizeKey(licenseKey);
    const lic = db.licenses[key];
    if (lic && !lic.banned && lic.fingerprint === fingerprint) {
      lic.lastUsed = new Date().toISOString();
      saveData(db);
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ========== ADMIN API (secret required) ==========

function checkAdmin(req, res, next) {
  const secret = req.headers["x-admin-secret"] || req.body?.adminSecret || req.query?.secret;
  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  next();
}

// Generate new license keys
app.post("/api/admin/generate", checkAdmin, (req, res) => {
  const count = Math.min(parseInt(req.body.count) || 1, 50);
  const note = req.body.note || "";
  const keys = [];

  for (let i = 0; i < count; i++) {
    let key;
    do {
      key = generateKey();
    } while (db.licenses[key]);

    db.licenses[key] = {
      key,
      note: note || `Key ${Object.keys(db.licenses).length + 1}`,
      banned: false,
      fingerprint: null,
      createdAt: new Date().toISOString(),
      activatedAt: null,
      lastUsed: null,
      activations: 0
    };
    keys.push(key);
  }
  saveData(db);
  logAdmin("GENERATE", `Created ${count} keys: ${keys.join(", ")}`);
  res.json({ success: true, keys, count: keys.length });
});

// Ban a key
app.post("/api/admin/ban", checkAdmin, (req, res) => {
  const key = normalizeKey(req.body.licenseKey);
  if (!db.licenses[key]) {
    return res.json({ success: false, message: "Key not found" });
  }
  db.licenses[key].banned = true;
  db.licenses[key].bannedAt = new Date().toISOString();
  db.licenses[key].banReason = req.body.reason || "Banned by admin";
  saveData(db);
  logAdmin("BAN", key);
  res.json({ success: true, message: "License banned" });
});

// Unban a key
app.post("/api/admin/unban", checkAdmin, (req, res) => {
  const key = normalizeKey(req.body.licenseKey);
  if (!db.licenses[key]) {
    return res.json({ success: false, message: "Key not found" });
  }
  db.licenses[key].banned = false;
  delete db.licenses[key].bannedAt;
  delete db.licenses[key].banReason;
  // Optional: reset device binding
  if (req.body.resetDevice) {
    db.licenses[key].fingerprint = null;
    db.licenses[key].activatedAt = null;
  }
  saveData(db);
  logAdmin("UNBAN", key);
  res.json({ success: true, message: "License unbanned" });
});

// Reset device binding (allow key to be used on new device)
app.post("/api/admin/reset-device", checkAdmin, (req, res) => {
  const key = normalizeKey(req.body.licenseKey);
  if (!db.licenses[key]) {
    return res.json({ success: false, message: "Key not found" });
  }
  db.licenses[key].fingerprint = null;
  db.licenses[key].activatedAt = null;
  saveData(db);
  logAdmin("RESET_DEVICE", key);
  res.json({ success: true, message: "Device binding reset. Key can be activated on new device." });
});

// List all licenses
app.get("/api/admin/list", checkAdmin, (req, res) => {
  const list = Object.values(db.licenses).map((l) => ({
    key: l.key,
    note: l.note,
    banned: l.banned,
    hasDevice: !!l.fingerprint,
    fingerprint: l.fingerprint ? l.fingerprint.slice(0, 16) + "..." : null,
    createdAt: l.createdAt,
    activatedAt: l.activatedAt,
    lastUsed: l.lastUsed,
    activations: l.activations
  }));
  res.json({ success: true, licenses: list, total: list.length });
});

// Delete key completely
app.post("/api/admin/delete", checkAdmin, (req, res) => {
  const key = normalizeKey(req.body.licenseKey);
  if (!db.licenses[key]) {
    return res.json({ success: false, message: "Key not found" });
  }
  delete db.licenses[key];
  saveData(db);
  logAdmin("DELETE", key);
  res.json({ success: true, message: "License deleted" });
});

// Simple admin HTML panel
app.get("/admin", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>ROCKSTAR License Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f0f13; color: #eee; margin: 0; padding: 20px; }
    h1 { color: #ff6b35; }
    .card { background: #1a1a24; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    input, button, select { padding: 10px 14px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff; margin: 4px; }
    button { background: #ff6b35; border: none; cursor: pointer; font-weight: 600; }
    button.danger { background: #e74c3c; }
    button.ok { background: #27ae60; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #333; }
    .banned { color: #e74c3c; }
    .active { color: #27ae60; }
    #secretBox { max-width: 400px; }
  </style>
</head>
<body>
  <h1>🔥 ROCKSTAR License Admin</h1>
  <div class="card" id="secretBox">
    <label>Admin Secret:</label>
    <input type="password" id="secret" placeholder="Enter admin secret" style="width:100%">
    <button onclick="saveSecret()">Save</button>
  </div>

  <div class="card">
    <h3>Generate Keys</h3>
    <input type="number" id="count" value="1" min="1" max="50" style="width:80px">
    <input type="text" id="note" placeholder="Note (optional)" style="width:200px">
    <button onclick="generate()">Generate</button>
    <pre id="genResult"></pre>
  </div>

  <div class="card">
    <h3>All Licenses</h3>
    <button onclick="loadList()">Refresh</button>
    <div id="list"></div>
  </div>

<script>
  let secret = localStorage.getItem('rs_admin_secret') || '';
  document.getElementById('secret').value = secret;

  function saveSecret() {
    secret = document.getElementById('secret').value;
    localStorage.setItem('rs_admin_secret', secret);
    alert('Saved');
  }

  async function api(path, body) {
    const opts = {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret }
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    return r.json();
  }

  async function generate() {
    const count = +document.getElementById('count').value || 1;
    const note = document.getElementById('note').value;
    const res = await api('/api/admin/generate', { count, note });
    document.getElementById('genResult').textContent = res.success
      ? 'Generated:\\n' + res.keys.join('\\n')
      : JSON.stringify(res, null, 2);
    loadList();
  }

  async function loadList() {
    const res = await api('/api/admin/list');
    if (!res.success) {
      document.getElementById('list').innerHTML = '<p style="color:red">Auth failed or error</p>';
      return;
    }
    let html = '<table><tr><th>Key</th><th>Note</th><th>Status</th><th>Device</th><th>Last Used</th><th>Actions</th></tr>';
    for (const l of res.licenses) {
      html += '<tr>';
      html += '<td><code>' + l.key + '</code></td>';
      html += '<td>' + (l.note || '') + '</td>';
      html += '<td class="' + (l.banned ? 'banned' : 'active') + '">' + (l.banned ? 'BANNED' : 'OK') + '</td>';
      html += '<td>' + (l.hasDevice ? 'Bound' : 'Free') + '</td>';
      html += '<td>' + (l.lastUsed ? new Date(l.lastUsed).toLocaleString() : '-') + '</td>';
      html += '<td>';
      if (!l.banned) html += '<button class="danger" onclick="ban(\\'' + l.key + '\\')">Ban</button>';
      else html += '<button class="ok" onclick="unban(\\'' + l.key + '\\')">Unban</button>';
      html += ' <button onclick="resetDev(\\'' + l.key + '\\')">Reset Device</button>';
      html += ' <button class="danger" onclick="del(\\'' + l.key + '\\')">Delete</button>';
      html += '</td></tr>';
    }
    html += '</table><p>Total: ' + res.total + '</p>';
    document.getElementById('list').innerHTML = html;
  }

  async function ban(key) {
    if (!confirm('Ban ' + key + '?')) return;
    await api('/api/admin/ban', { licenseKey: key });
    loadList();
  }
  async function unban(key) {
    await api('/api/admin/unban', { licenseKey: key, resetDevice: false });
    loadList();
  }
  async function resetDev(key) {
    if (!confirm('Reset device for ' + key + '? User can activate on new PC.')) return;
    await api('/api/admin/reset-device', { licenseKey: key });
    loadList();
  }
  async function del(key) {
    if (!confirm('Delete ' + key + ' forever?')) return;
    await api('/api/admin/delete', { licenseKey: key });
    loadList();
  }

  if (secret) loadList();
</script>
</body>
</html>`);
});

// Health
app.get("/", (req, res) => {
  res.json({
    service: "ROCKSTAR License Server",
    status: "running",
    version: "1.0",
    admin: "/admin"
  });
});

// Start
app.listen(PORT, () => {
  console.log(`\n🔥 ROCKSTAR License Server running on http://localhost:${PORT}`);
  console.log(`   Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`   Admin Secret: ${ADMIN_SECRET}`);
  console.log(`   (Change ADMIN_SECRET env var in production!)\n`);
});
