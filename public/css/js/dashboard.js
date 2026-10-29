const $ = (s) => document.querySelector(s);
const listEl = $('#list'), emptyEl = $('#empty'), msg = $('#msg');
const shown = new Set();   // ids of servers whose password is visible

async function api(path, method = 'GET', body) {
  const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) return (location.href = '/');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function toast(text) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: text });
  document.body.append(t); setTimeout(() => t.remove(), 1800);
}
function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n;
}
function btn(label, cls, fn) {
  const b = el('button', { className: `btn sm ${cls || ''}`, textContent: label });
  b.addEventListener('click', async () => {
    b.disabled = true; msg.textContent = '';
    try { await fn(); } catch (e) { msg.textContent = e.message; }
    b.disabled = false;
  });
  return b;
}
function row(label, value, secret, id) {
  const b = el('b', { textContent: secret && !shown.has(id) ? '••••••••••••••••••••' : value });
  const tools = el('span');
  if (secret) tools.append(btn(shown.has(id) ? 'Hide' : 'Show', 'ghost', () => { shown.has(id) ? shown.delete(id) : shown.add(id); load(); }), ' ');
  tools.append(btn('Copy', 'ghost', async () => { await navigator.clipboard.writeText(value); toast(`${label} copied`); }));
  return el('div', { className: 'conn-row' }, el('span', { textContent: label }), b, tools);
}
function meter(label, text, pct) {
  const bar = el('i'); bar.style.width = Math.min(parseFloat(pct) || 0, 100) + '%';
  return el('div', {}, el('div', { textContent: `${label}: ${text}` }), el('div', { className: 'meter' }, bar));
}

function card(v) {
  const s = v.ssh, cmd = `ssh ${s.username}@${s.host} -p ${s.port}`;
  const head = el('div', { className: 'vps-head' },
    el('div', {}, el('h3', { textContent: v.name, style: 'display:inline' }),
      el('span', { className: `status ${v.status}` }, el('i', { className: 'dot' }), v.status === 'exited' ? 'stopped' : v.status)),
    el('div', { className: 'chips' }, ...[v.type === 'kvm' ? 'KVM' : 'Docker', ...Object.values(v.plan)].map((t) => el('span', { className: 'chip', textContent: t }))));
  const kids = [head];
  if (v.stats) kids.push(el('div', { className: 'usage' },
    meter('CPU', v.stats.cpu, v.stats.cpu), meter('Memory', v.stats.mem, v.stats.memPct)));
  kids.push(el('div', { className: 'conn' },
    row('Command', cmd), row('Host', s.host), row('Port', String(s.port)),
    row('Username', s.username), row('Password', s.password, true, v.id)));
  const running = v.status === 'running';
  const act = el('div', { className: 'actions' });
  act.append(el('a', { className: 'btn primary sm', href: `/terminal?id=${v.id}`, textContent: 'Open terminal' }));
  if (running) { act.append(btn('Restart', '', () => doAct(v.id, 'restart')), btn('Stop', '', () => doAct(v.id, 'stop'))); }
  else act.append(btn('Start', '', () => doAct(v.id, 'start')));
  act.append(btn('Delete', 'danger ghost', async () => {
    if (!confirm('Delete this VPS and all its data? This cannot be undone.')) return;
    await api(`/api/vps/${v.id}`, 'DELETE'); await load();
  }));
  kids.push(act);
  return el('article', { className: 'card vps' }, ...kids);
}
async function doAct(id, action) { await api(`/api/vps/${id}/${action}`, 'POST'); await load(); }

let rendering = false;
async function load() {
  if (rendering) return; rendering = true;
  try {
    const items = await api('/api/vps');
    listEl.replaceChildren(...items.map(card));
    emptyEl.hidden = items.length > 0;
    listEl.classList.add('settled');
  } catch (e) { msg.textContent = e.message; } finally { rendering = false; }
}

$('#create').addEventListener('click', async (e) => {
  const b = e.currentTarget; b.disabled = true; msg.textContent = '';
  b.replaceChildren(el('span', { className: 'spin' }), 'Creating…');
  try { await api('/api/vps', 'POST', { type: $('#type').value }); await load(); }
  catch (err) { msg.textContent = err.message; }
  b.disabled = false; b.textContent = 'Create VPS';
});
$('#logout').addEventListener('click', async () => { await api('/api/auth/logout', 'POST'); location.href = '/'; });

api('/api/auth/me').then((u) => { $('#who').textContent = u.username; });
load(); setInterval(load, 8000);

api('/api/vps/types').then((t) => {
  const s = $('#type');
  t.forEach((x) => s.append(el('option', { value: x.id, textContent: x.label })));
  s.hidden = t.length < 2;
});
