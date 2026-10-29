# VPS Panel

Node.js + Express + Docker/KVM panel. Each user can create one free VPS (2 GB RAM, 1 vCPU, 10 GB disk)
with real SSH access and a browser terminal (xterm.js over WebSocket, bridged to the VPS's sshd).

## Deploy on Ubuntu 22.04 / 24.04

```bash
# 1. Enable the 10 GB disk limit first (see "Disk quota" below), then:
unzip vps-panel.zip && cd vps-panel
sudo bash setup.sh
# 2. Open http://YOUR_SERVER_IP:3000, register, press "Create VPS".
```

`setup.sh` installs Docker and Node 20, builds the image, writes `.env` with random secrets,
creates a systemd service (`systemctl status vps-panel`) and opens ports 3000 and 20000-29999.

## KVM (full virtual machines)

Needs a server with hardware virtualization (`ls /dev/kvm`): bare metal, or a VPS with nested virtualization.

```bash
sudo bash setup-kvm.sh      # installs libvirt/qemu, downloads Ubuntu 22.04 cloud image, enables the kvm type
```

Users then choose **Docker** or **KVM** when creating their free VPS (limit: 1 per user, 2 GB RAM, 1 vCPU, 10 GB disk).
Each KVM VM gets a real SSH login via cloud-init, and the panel forwards `PUBLIC_IP:PORT` to the VM with iptables.

## Push to GitHub

```bash
git init && git add . && git commit -m "VPS panel"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/vps-panel.git
git push -u origin main
```
(`.env` and `data/` are git-ignored, so your secrets stay private.)

## Disk quota (10 GB per Docker VPS)

Docker's `--storage-opt size=10G` only works with overlay2 on **XFS mounted with `pquota`**.
Check: `docker info | grep -i "backing filesystem"`. If it says `extfs`, move Docker's data onto an XFS loop file:

```bash
sudo systemctl stop docker
sudo mv /var/lib/docker /var/lib/docker.bak
sudo fallocate -l 200G /var/docker-xfs.img          # size = total space for all VPS
sudo mkfs.xfs /var/docker-xfs.img
sudo mkdir /var/lib/docker
echo '/var/docker-xfs.img /var/lib/docker xfs loop,pquota 0 0' | sudo tee -a /etc/fstab
sudo mount /var/lib/docker
sudo rsync -a /var/lib/docker.bak/ /var/lib/docker/
sudo systemctl start docker
# test:
docker run --rm --storage-opt size=10G alpine df -h /
```

For a plain test box you can set `ENFORCE_DISK_QUOTA=false` in `.env` (no disk limit then).

## HTTPS (recommended)

Put Caddy or nginx in front, then set `BEHIND_PROXY=true` and `COOKIE_SECURE=true` in `.env`.
Caddy: `panel.example.com { reverse_proxy localhost:3000 }` (WebSockets work automatically).
Then close port 3000 in ufw. Keep 20000-29999 open for external SSH clients.

## Structure

```
server.js              Express app, security headers, static files, page routes
src/config.js         env + fixed resource plan
src/db.js              SQLite schema, AES-GCM encryption of SSH passwords
src/auth.js            JWT cookie helpers
src/docker.js          docker run with limits, chpasswd, status, stats
src/kvm.js             KVM driver (libvirt, cloud-init, iptables forward)
src/routes/auth.js     register / login / logout / me
src/routes/vps.js      list, create, start, stop, restart, delete
src/terminal.js        WebSocket upgrade, auth + ownership check, SSH shell bridge
docker/Dockerfile      Ubuntu + sshd
setup.sh / setup-kvm.sh  installers
public/, views/        UI (login, dashboard, terminal)
```
