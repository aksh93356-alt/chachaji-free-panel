const msg = document.getElementById('msg');
const tabs = [...document.querySelectorAll('.tab')];
const ink = document.querySelector('.tab-ink');

function moveInk(t) { ink.style.left = t.offsetLeft + 'px'; ink.style.width = t.offsetWidth + 'px'; }
function show(name) {
  tabs.forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle('active', on); if (on) moveInk(t); });
  document.getElementById('login').hidden = name !== 'login';
  document.getElementById('register').hidden = name !== 'register';
  msg.textContent = '';
}
tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));
window.addEventListener('load', () => show('login'));

for (const id of ['login', 'register']) {
  document.getElementById(id).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const res = await fetch(`/api/auth/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      location.href = '/dashboard';
    } catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });
}
