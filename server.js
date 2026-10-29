const express = require('express');
const { exec } = require('child_process');
const crypto = require('crypto');
const app = express();
const PORT = 3000;

app.use(express.json());

// Basic Dashboard UI
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CJH Free VPS Panel</title>
      <style>
        body { font-family: Arial, sans-serif; background: #0f172a; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; width: 350px; }
        h2 { color: #38bdf8; margin-bottom: 10px; }
        p { color: #94a3b8; font-size: 14px; }
        button { background: #22c55e; color: white; border: none; padding: 12px 20px; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.3s; width: 100%; margin-top: 15px; }
        button:hover { background: #16a34a; transform: scale(1.02); }
        #result { margin-top: 20px; text-align: left; background: #0f172a; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; display: none; word-break: break-all; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>🚀 CJH VPS Panel</h2>
        <p>Resource Specs per VPS:</p>
        <p>⚡ 2 GB RAM | 1 vCPU | 10 GB Disk</p>
        <button onclick="createVPS()">Create Free VPS</button>
        <div id="result"></div>
      </div>

      <script>
        async function createVPS() {
          const resDiv = document.getElementById('result');
          resDiv.style.display = 'block';
          resDiv.innerHTML = '⏳ Creating VPS... Please wait...';

          try {
            const response = await fetch('/api/create-vps', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
              resDiv.innerHTML = \`
                ✅ <b>VPS Created Successfully!</b><br><br>
                <b>IP/Host:</b> \${data.host}<br>
                <b>SSH Port:</b> \${data.port}<br>
                <b>Username:</b> root<br>
                <b>Password:</b> \${data.password}<br><br>
                📌 <i>Connect via Termius / PuTTY!</i>
              \`;
            } else {
              resDiv.innerHTML = '❌ Error: ' + data.message;
            }
          } catch (err) {
            resDiv.innerHTML = '❌ Server Error!';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// API Route to Create Docker VPS
app.post('/api/create-vps', (req, res) => {
  const containerPort = Math.floor(10000 + Math.random() * 50000); // Random SSH Port
  const rootPassword = crypto.randomBytes(4).toString('hex'); // Auto-generated password
  const containerName = `vps_${Date.now()}`;

  // Command to run Docker container with limits (2GB RAM, 1 CPU)
  const dockerCmd = `docker run -d \
    --name ${containerName} \
    --memory="2g" \
    --cpus="1.0" \
    -p ${containerPort}:22 \
    ubuntu:22.04 bash -c "apt update && apt install -y openssh-server sudo && echo 'root:${rootPassword}' | chpasswd && sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config && service ssh start && tail -f /dev/null"`;

  exec(dockerCmd, (error, stdout, stderr) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ success: false, message: "Docker creation failed!" });
    }

    res.json({
      success: true,
      host: "YOUR_SERVER_IP", // Update with your actual server IP
      port: containerPort,
      password: rootPassword
    });
  });
});

app.listen(PORT, () => {
  console.log(`CJH VPS Panel running on port ${PORT}`);
});
