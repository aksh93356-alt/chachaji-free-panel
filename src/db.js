const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const cfg = require('./config');

const db = new Database(path.join(__dirname, '..', 'data', 'panel.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS vps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  container TEXT UNIQUE NOT NULL,
  ssh_port INTEGER UNIQUE NOT NULL,
  password_enc TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'docker',
  target_host TEXT NOT NULL DEFAULT '127.0.0.1',
  target_port INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`);
// migrate older databases
const cols = db.prepare('PRAGMA table_info(vps)').all().map((c) => c.name);
for (const [c, def] of [['type', "TEXT NOT NULL DEFAULT 'docker'"], ['target_host', "TEXT NOT NULL DEFAULT '127.0.0.1'"], ['target_port', 'INTEGER']])
  if (!cols.includes(c)) db.exec(`ALTER TABLE vps ADD COLUMN ${c} ${def}`);

// AES-256-GCM so SSH passwords are not stored in plain text
const key = crypto.createHash('sha256').update(cfg.encKey).digest();
db.encrypt = (text) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
};
db.decrypt = (blob) => {
  const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
};
module.exports = db;
