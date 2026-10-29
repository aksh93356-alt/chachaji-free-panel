const jwt = require('jsonwebtoken');
const db = require('./db');
const cfg = require('./config');

const userFromToken = (token) => {
  if (!token) return null;
  try {
    const { uid } = jwt.verify(token, cfg.jwtSecret);
    return db.prepare('SELECT id, email, username FROM users WHERE id = ?').get(uid) || null;
  } catch { return null; }
};
const requireApi = (req, res, next) => {
  const u = userFromToken(req.cookies.token);
  if (!u) return res.status(401).json({ error: 'Please sign in again.' });
  req.user = u; next();
};
const requirePage = (req, res, next) => {
  const u = userFromToken(req.cookies.token);
  if (!u) return res.redirect('/');
  req.user = u; next();
};
const sign = (uid) => jwt.sign({ uid }, cfg.jwtSecret, { expiresIn: '7d' });
module.exports = { userFromToken, requireApi, requirePage, sign };
