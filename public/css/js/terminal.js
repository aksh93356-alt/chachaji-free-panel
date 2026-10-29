const id = new URLSearchParams(location.search).get('id');
const stateEl = document.getElementById('state');
const term = new Terminal({
  cursorBlink: true, fontSize: 14, scrollback: 5000,
  fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace',
  theme: { background: '#0b0e13', foreground: '#e7eaf0', cursor: '#5aa9ff' },
});
const fit = new FitAddon.FitAddon();
term.loadAddon(fit);
term.open(document.getElementById('terminal'));
fit.fit();

const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${location.host}/ws/terminal?id=${encodeURIComponent(id)}&cols=${term.cols}&rows=${term.rows}`);
const send = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));

ws.onopen = () => { stateEl.textContent = 'Connected'; term.focus(); };
ws.onmessage = (e) => term.write(e.data);
ws.onclose = () => { stateEl.textContent = 'Disconnected. Reload to reconnect.'; term.write('\r\n\x1b[33m[connection closed]\x1b[0m\r\n'); };
term.onData((data) => send({ type: 'input', data }));
const resize = () => { fit.fit(); send({ type: 'resize', cols: term.cols, rows: term.rows }); };
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(document.getElementById('terminal'));
