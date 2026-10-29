const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const cfg = require('./src/config');
const { requirePage } = require('./src/auth');
const { attachTerminal } = require('./src/terminal');

const app = express();
if (cfg.behindProxy) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'ws:', 'wss:'], imgSrc: ["'self'", 'data:'],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true }), require('./src/routes/auth'));
app.use('/api/vps', rateLimit({ windowMs: 60 * 1000, limit: 60 }), require('./src/routes/vps'));

// xterm.js served locally (works with the strict CSP, no CDN)
app.use('/vendor/xterm', express.static(path.join(__dirname, 'node_modules/@xterm/xterm')));
app.use('/vendor/xterm-fit', express.static(path.join(__dirname, 'node_modules/@xterm/addon-fit')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/dashboard', requirePage, (_, res) => res.sendFile(path.join(__dirname, 'views/dashboard.html')));
app.get('/terminal', requirePage, (_, res) => res.sendFile(path.join(__dirname, 'views/terminal.html')));

const server = http.createServer(app);
attachTerminal(server);
server.listen(cfg.port, () => {
  console.log(`Panel running on http://0.0.0.0:${cfg.port}`);
  if (cfg.enabledTypes.includes('kvm')) require('./src/kvm').reapplyAll().catch((e) => console.error('KVM reapply:', e.message));
});
