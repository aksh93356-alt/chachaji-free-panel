// KVM driver: real virtual machines via libvirt + cloud-init (Ubuntu cloud image).
// Disk = qcow2 overlay with 10G virtual size, RAM = 2048 MB, vCPU = 1.
// External SSH works through an iptables DNAT rule: host:PORT -> VM_IP:22.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const run = (cmd, args) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: 180000, maxBuffer: 1 << 20 }, (e, out, err) =>
      e ? reject(new Error((err || e.message).trim())) : resolve(out.trim())));
const virsh = (...a) => run('virsh', ['-c', 'qemu:///system', ...a]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForIp(name, tries = 45) {
  for (let i = 0; i < tries; i++) {
    const out = await virsh('domifaddr', name, '--source', 'lease').catch(() => '');
    const m = out.match(/ipv4\s+(\d+\.\d+\.\d+\.\d+)\//);
    if (m) return m[1];
    await sleep(2000);
  }
  throw new Error('VM did not get an IP address.');
}

async function forward(ip, port, add) {
  const rules = [
    { table: ['-t', 'nat'], chain: 'PREROUTING', spec: ['-p', 'tcp', '--dport', String(port), '-j', 'DNAT', '--to-destination', `${ip}:22`] },
    { table: [], chain: 'FORWARD', spec: ['-p', 'tcp', '-d', ip, '--dport', '22', '-j', 'ACCEPT'] },
  ];
  for (const r of rules) {
    const exists = await run('iptables', [...r.table, '-C', r.chain, ...r.spec]).then(() => true, () => false);
    if (add && !exists) await run('iptables', [...r.table, '-I', r.chain, ...r.spec]);
    if (!add && exists) await run('iptables', [...r.table, '-D', r.chain, ...r.spec]);
  }
}

async function create(name, hostPort, password) {
  const dir = path.join(cfg.kvm.dir, name);
  const disk = path.join(dir, 'disk.qcow2');
  const seed = path.join(dir, 'seed.iso');
  fs.mkdirSync(dir, { recursive: true });
  try {
    await run('qemu-img', ['create', '-f', 'qcow2', '-F', 'qcow2', '-b', cfg.kvm.baseImage, disk, cfg.plan.disk]);

    fs.writeFileSync(path.join(dir, 'meta-data'), `instance-id: ${name}\nlocal-hostname: ${name}\n`);
    fs.writeFileSync(path.join(dir, 'user-data'), `#cloud-config
hostname: ${name}
ssh_pwauth: true
disable_root: false
chpasswd:
  expire: false
  users:
    - {name: root, password: "${password}", type: text}
write_files:
  - path: /etc/ssh/sshd_config.d/01-panel.conf
    content: |
      PermitRootLogin yes
      PasswordAuthentication yes
runcmd:
  - systemctl restart ssh
`);
    await run('cloud-localds', [seed, path.join(dir, 'user-data'), path.join(dir, 'meta-data')]);

    await run('virt-install', [
      '--connect', 'qemu:///system', '--name', name,
      '--memory', '2048', '--vcpus', '1', '--cpu', 'host-model',
      '--disk', `path=${disk},format=qcow2,bus=virtio`,
      '--disk', `path=${seed},device=cdrom`,
      '--os-variant', 'ubuntu22.04',
      '--network', `network=${cfg.kvm.network},model=virtio`,
      '--graphics', 'none', '--import', '--noautoconsole', '--autostart',
    ]);
    const ip = await waitForIp(name);
    await forward(ip, hostPort, true);
    return { host: ip, port: 22 };
  } catch (e) {
    await remove(name).catch(() => {});
    throw e;
  }
}

async function state(name) {
  const s = await virsh('domstate', name).catch(() => null);
  if (!s) return 'missing';
  return { running: 'running', 'shut off': 'exited' }[s] || s;
}

async function stats(name) {
  try {
    const out = await virsh('dommemstat', name);
    const rss = +(out.match(/rss\s+(\d+)/) || [])[1] || 0;           // KiB
    const used = rss / 1024;
    return { cpu: 'n/a', mem: `${used.toFixed(0)}MiB / 2048MiB`, memPct: `${((used / 2048) * 100).toFixed(1)}%` };
  } catch { return null; }
}

// Re-resolve the VM IP (DHCP lease may change) and refresh the port forward.
async function refresh(v, db) {
  const ip = await waitForIp(v.container);
  if (ip !== v.target_host) {
    await forward(v.target_host, v.ssh_port, false).catch(() => {});
    db.prepare('UPDATE vps SET target_host = ? WHERE id = ?').run(ip, v.id);
  }
  await forward(ip, v.ssh_port, true);
}

async function reapplyAll() {
  const db = require('./db');
  for (const v of db.prepare("SELECT * FROM vps WHERE type = 'kvm'").all())
    if ((await state(v.container)) === 'running') await refresh(v, db).catch((e) => console.error(v.container, e.message));
}

async function remove(name, v) {
  await virsh('destroy', name).catch(() => {});
  await virsh('undefine', name, '--nvram').catch(() => virsh('undefine', name).catch(() => {}));
  if (v) await forward(v.target_host, v.ssh_port, false).catch(() => {});
  fs.rmSync(path.join(cfg.kvm.dir, name), { recursive: true, force: true });
}

module.exports = {
  create, state, stats, refresh, reapplyAll,
  start: (n) => virsh('start', n),
  stop: (n) => virsh('shutdown', n),
  restart: (n) => virsh('reboot', n),
  remove,
};
