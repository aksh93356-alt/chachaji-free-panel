const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const cfg = require('../config');
const { sign, requireApi } = require('../auth');

const setCookie = (res, uid) =>
  res.cookie('token', sign(uid), {
    httpOnly: true, sameSite: 'strict', secure: cfg.cookieSecure, maxAge: 7 * 864e5,
  });

router.post('/register', (req, res) => {
  const { email = '', username = '', password = '' } = req.body || {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'Username must be 3–20 letters, numbers or underscores.' });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be 8–128 characters.' });
  try {
    const hash = bcrypt.hashSync(password, 12);
    const { lastInsertRowid } = db.prepare('INSERT INTO users (email, username, password_hash) VALUES (?,?,?)')
      .run(email.toLowerCase(), username, hash);
    setCookie(res, lastInsertRowid);
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'That email or username is already taken.' });
    console.error(e); res.status(500).json({ error: 'Could not create the account.' });
  }
});

router.post('/login', (req, res) => {
  const { login = '', password = '' } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(String(login).toLowerCase(), String(login));
  if (!u || !bcrypt.compareSync(String(password), u.password_hash))
    return res.status(401).json({ error: 'Wrong username or password.' });
  setCookie(res, u.id);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });
router.get('/me', requireApi, (req, res) => res.json(req.user));

module.exports = router;
