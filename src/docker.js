// Thin wrapper around the docker CLI. execFile/spawn WITHOUT a shell => no injection.
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');
const cfg = require('./config');

const docker = (args, timeout = 120000) =>
  new Promise((resolve, reject) =>
    execFile('docker', args, { timeout, maxBuffer: 1 << 20 }, (err, out, errOut) =>
      err ? reject(new Error((errOut || err.message).trim())) : resolve(out.trim())));

const genPassword = (len = 20) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(len), (b) => chars[b % chars.length]).join('');
};

const setRootPassword = (container, password) =>
  new Promise((resolve, reject) => {
    const p = spawn('docker', ['exec', '-i', container, 'chpasswd']);
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || 'chpasswd failed'))));
    p.stdin.end(`root:${password}\n`);
  });

async function createContainer(name, hostPort, password) {
  const { memory, cpus, disk, pids } = cfg.plan;
  const args = [
    'run', '-d', '--name', name, '--hostname', name,
    '--restart', 'unless-stopped',
    '--memory', memory, '--memory-swap', memory,   // hard 2 GB RAM, no extra swap
    '--cpus', cpus,                                // 1 vCPU
    '--pids-limit', String(pids),                  // stops fork bombs
    '--cap-drop', 'ALL',
    ...['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETUID', 'SETGID', 'KILL', 'SYS_CHROOT', 'AUDIT_WRITE', 'NET_BIND_SERVICE']
      .flatMap((c) => ['--cap-add', c]),
    '-p', `${hostPort}:22`,
    '--label', 'managed-by=vps-panel',
  ];
  if (cfg.enforceDisk) args.push('--storage-opt', `size=${disk}`); // 10 GB (needs XFS + pquota)
  args.push(cfg.image);

  await docker(args);
  try {
    await setRootPassword(name, password);
  } catch (e) {
    await docker(['rm', '-f', name]).catch(() => {});
    throw e;
  }
}

const state = (name) =>
  docker(['inspect', '-f', '{{.State.Status}}', name]).catch(() => 'missing');

async function stats(name) {
  try {
    const raw = await docker(['stats', '--no-stream', '--format', '{{json .}}', name], 15000);
    const s = JSON.parse(raw);
    return { cpu: s.CPUPerc, mem: s.MemUsage, memPct: s.MemPerc };
  } catch { return null; }
}

const create = async (name, hostPort, password) => {
  await createContainer(name, hostPort, password);
  return { host: '127.0.0.1', port: hostPort }; // where the web terminal connects
};

module.exports = {
  create, docker, genPassword, createContainer, state, stats,
  start: (n) => docker(['start', n]),
  stop: (n) => docker(['stop', '-t', '10', n]),
  restart: (n) => docker(['restart', '-t', '10', n]),
  remove: (n) => docker(['rm', '-f', '-v', n]),
};
