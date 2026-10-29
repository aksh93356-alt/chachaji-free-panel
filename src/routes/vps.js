const router = require('express').Router();
const crypto = require('crypto');
const net = require('net');
const db = require('../db');
const cfg = require('../config');
const dk = require('../docker');
const { requireApi } = require('../auth');

const LABELS = { docker: 'Docker container (fast)', kvm: 'KVM virtual machine' };
const driver = (type) => (type === 'kvm' ? require('../kvm') : dk);

router.use(requireApi);

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e); res.status(500).json({ error: e.message.slice(0, 300) });
});
const owned = (req) => db.prepare('SELECT * FROM vps WHERE id = ? AND user_id = ?').get(+req.params.id, req.user.id);
const portFree = (p) => new Promise((ok) => {
  const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true)));
  s.listen(p, '0.0.0.0');
});

const present = async (v, withStats) => {
  const d = driver(v.type);
  const status = await d.state(v.container);
  return {
    id: v.id, name: v.name, type: v.type, status, createdAt: v.created_at,
    plan: { ram: '2 GB', cpu: '1 vCPU', disk: '10 GB' },
    ssh: { host: cfg.publicHost, port: v.ssh_port, username: 'root', password: db.decrypt(v.password_enc) },
    stats: withStats && status === 'running' ? await d.stats(v.container) : null,
  };
};

router.get('/types', (req, res) =>
  res.json(cfg.enabledTypes.map((id) => ({ id, label: LABELS[id] || id }))));

router.get('/', wrap(async (req, res) => {
  const rows = db.prepare('SELECT * FROM vps WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json(await Promise.all(rows.map((v) => present(v, true))));
}));

router.post('/', wrap(async (req, res) => {
  // Only the VPS *type* is accepted from the client. Resources are fixed server-side.
  const type = (req.body && req.body.type) || cfg.enabledTypes[0];
  if (!cfg.enabledTypes.includes(type)) return res.status(400).json({ error: 'That VPS type is not available.' });
  const count = db.prepare('SELECT COUNT(*) c FROM vps WHERE user_id = ?').get(req.user.id).c;
  if (count >= cfg.maxPerUser)
    return res.status(403).json({ error: `You can run up to ${cfg.maxPerUser} free VPS.` });

  const d = driver(type);
  const container = `vps-${req.user.id}-${crypto.randomBytes(3).toString('hex')}`;
  const password = dk.genPassword();
  let port, target;
  for (let i = 0; i < 10 && !target; i++) {
    port = cfg.portMin + crypto.randomInt(cfg.portMax - cfg.portMin + 1);
    if (db.prepare('SELECT 1 FROM vps WHERE ssh_port = ?').get(port) || !(await portFree(port))) continue;
    target = await d.create(container, port, password);
  }
  if (!target) throw new Error('No free SSH port available.');

  try {
    const name = `${req.user.username}-vps`;
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO vps (user_id, name, container, ssh_port, password_enc, type, target_host, target_port) VALUES (?,?,?,?,?,?,?,?)'
    ).run(req.user.id, name, container, port, db.encrypt(password), type, target.host, target.port);
    res.status(201).json(await present(db.prepare('SELECT * FROM vps WHERE id=?').get(lastInsertRowid), false));
  } catch (e) { await d.remove(container).catch(() => {}); throw e; }
}));

for (const action of ['start', 'stop', 'restart']) {
  router.post(`/:id/${action}`, wrap(async (req, res) => {
    const v = owned(req);
    if (!v) return res.status(404).json({ error: 'VPS not found.' });
    await driver(v.type)[action](v.container);
    if (v.type === 'kvm' && action !== 'stop') require('../kvm').refresh(v, db).catch((e) => console.error(e.message));
    res.json({ ok: true });
  }));
}

router.delete('/:id', wrap(async (req, res) => {
  const v = owned(req);
  if (!v) return res.status(404).json({ error: 'VPS not found.' });
  await driver(v.type).remove(v.container, v);
  db.prepare('DELETE FROM vps WHERE id = ?').run(v.id);
  res.json({ ok: true });
}));

module.exports = router;
