#!/usr/bin/env bash
# Adds KVM support. Run as root AFTER setup.sh:  sudo bash setup-kvm.sh
# Needs hardware virtualization (bare metal, or a VPS with nested virtualization enabled).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -e /dev/kvm ]; then
  echo "ERROR: /dev/kvm not found. This server has no hardware virtualization." >&2
  echo "Use a bare-metal server or ask your provider to enable nested virtualization." >&2
  exit 1
fi

apt-get update
apt-get install -y qemu-kvm libvirt-daemon-system libvirt-clients virtinst cloud-image-utils qemu-utils iptables

systemctl enable --now libvirtd
virsh net-autostart default || true
virsh net-start default 2>/dev/null || true

echo 'net.ipv4.ip_forward=1' >/etc/sysctl.d/99-vps-panel.conf
sysctl -p /etc/sysctl.d/99-vps-panel.conf

mkdir -p /var/lib/vps-panel/images /var/lib/vps-panel/vms
IMG=/var/lib/vps-panel/images/jammy-server-cloudimg-amd64.img
[ -f "$IMG" ] || curl -L -o "$IMG" https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img

# enable the kvm type in .env
if grep -q '^ENABLED_TYPES=' .env; then sed -i 's/^ENABLED_TYPES=.*/ENABLED_TYPES=docker,kvm/' .env; else echo 'ENABLED_TYPES=docker,kvm' >> .env; fi
systemctl restart vps-panel
echo "KVM enabled. Users can now pick 'KVM virtual machine' when creating a VPS."
