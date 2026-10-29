// WebSocket <-> SSH bridge. The server logs into the VPS's sshd on the user's behalf,
// so the browser terminal never needs the password.
const { WebSocketServer } = require('ws');
const { Client } = require('ssh2');
const cookie = require('cookie');
const db = require('./db');
const driver = (t) => (t === 'kvm' ? require('./kvm') : require('./docker'));
const { userFromToken } = require('./auth');

function attachTerminal(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const deny = () => { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); };
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws/terminal') return socket.destroy();
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return deny();

    const user = userFromToken(cookie.parse(req.headers.cookie || '').token);
    if (!user) return deny();
    const vps = db.prepare('SELECT * FROM vps WHERE id = ? AND user_id = ?').get(+url.searchParams.get('id'), user.id);
    if (!vps) return deny();

    wss.handleUpgrade(req, socket, head, (ws) =>
      handle(ws, vps, +url.searchParams.get('cols') || 80, +url.searchParams.get('rows') || 24));
  });
}

async function handle(ws, vps, cols, rows) {
  const say = (t) => ws.readyState === 1 && ws.send(t);
  if ((await driver(vps.type).state(vps.container)) !== 'running') {
    say('\r\n\x1b[31mThis VPS is stopped. Start it from the dashboard.\x1b[0m\r\n');
    return ws.close();
  }
  const ssh = new Client();
  let stream = null;
  let attempts = 0;
  const maxAttempts = vps.type === 'kvm' ? 30 : 6; // VMs need time to boot

  const connect = () => ssh.connect({
    host: vps.target_host, port: vps.target_port, username: 'root',
    password: db.decrypt(vps.password_enc), readyTimeout: 15000, keepaliveInterval: 15000,
  });

  ssh.on('ready', () => {
    ssh.shell({ term: 'xterm-256color', cols, rows }, (err, s) => {
      if (err) { say(`\r\nShell error: ${err.message}\r\n`); return ws.close(); }
      stream = s;
      s.on('data', (d) => say(d.toString('utf8')));
      s.on('close', () => { ssh.end(); ws.close(); });
    });
  });
  ssh.on('error', (e) => {
    if (['ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNRESET'].includes(e.code) && ++attempts < maxAttempts) { // sshd still booting
      say('\r\nWaiting for SSH service...\r\n');
      return setTimeout(connect, 3000);
    }
    say(`\r\n\x1b[31mConnection failed: ${e.message}\x1b[0m\r\n`); ws.close();
  });

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!stream) return;
    if (m.type === 'input' && typeof m.data === 'string') stream.write(m.data);
    if (m.type === 'resize' && m.cols > 0 && m.rows > 0) stream.setWindow(m.rows | 0, m.cols | 0, 0, 0);
  });
  ws.on('close', () => ssh.end());
  connect();
}

module.exports = { attachTerminal };
