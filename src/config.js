require('dotenv').config();
const need = (k) => {
  if (!process.env[k] || process.env[k].startsWith('change-me')) {
    console.error(`Missing or default ${k} in .env`); process.exit(1);
  }
  return process.env[k];
};
module.exports = {
  port: +process.env.PORT || 3000,
  jwtSecret: need('JWT_SECRET'),
  encKey: need('ENCRYPTION_KEY'),
  publicHost: process.env.PUBLIC_HOST || 'localhost',
  behindProxy: process.env.BEHIND_PROXY === 'true',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  image: process.env.VPS_IMAGE || 'vps-panel/ubuntu:22.04',
  portMin: +process.env.SSH_PORT_MIN || 20000,
  portMax: +process.env.SSH_PORT_MAX || 29999,
  maxPerUser: +process.env.MAX_VPS_PER_USER || 1,
  enforceDisk: process.env.ENFORCE_DISK_QUOTA !== 'false',
  enabledTypes: (process.env.ENABLED_TYPES || 'docker').split(',').map((s) => s.trim()).filter(Boolean),
  kvm: {
    baseImage: process.env.KVM_BASE_IMAGE || '/var/lib/vps-panel/images/jammy-server-cloudimg-amd64.img',
    dir: process.env.KVM_DIR || '/var/lib/vps-panel/vms',
    network: process.env.KVM_NETWORK || 'default',
  },
  // Fixed plan. Never read from client input.
  plan: Object.freeze({ memory: '2g', cpus: '1', disk: '10G', pids: 512 }),
};
