const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = Number(process.env.PORT) || 3210;
const BASE_URL = 'http://127.0.0.1:' + PORT;
let serverProcess = null;
let mainWindow = null;
let stopping = false;
let logStream = null;

function log(message) {
  try {
    if (!logStream) {
      const logPath = path.join(app.getPath('userData'), 'ma9ictv-desktop.log');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      logStream = fs.createWriteStream(logPath, { flags: 'a' });
    }
    logStream.write('[' + new Date().toISOString() + '] ' + message + '\n');
  } catch (_) {}
}

function startServer() {
  const appDir = app.getAppPath();
  const tsxCli = path.join(appDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverFile = path.join(appDir, 'server.ts');
  if (!fs.existsSync(tsxCli) || !fs.existsSync(serverFile)) {
    throw new Error('Packaged server files are missing. Rebuild the desktop package.');
  }
  serverProcess = spawn(process.execPath, [tsxCli, serverFile], {
    cwd: appDir,
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess.stdout.on('data', data => log('SERVER: ' + String(data).trimEnd()));
  serverProcess.stderr.on('data', data => log('SERVER ERROR: ' + String(data).trimEnd()));
  serverProcess.on('error', err => log('SERVER SPAWN ERROR: ' + err.message));
  serverProcess.on('exit', (code, signal) => {
    log('SERVER EXIT code=' + code + ' signal=' + signal);
    if (!stopping && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
        '<h2>Ma9icTV server stopped</h2><p>Close and reopen the app. See ma9ictv-desktop.log for details.</p>'
      ));
    }
  });
}

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stopping) throw new Error('App is closing');
    if (serverProcess && serverProcess.exitCode !== null) throw new Error('Ma9icTV server exited during startup');
    try {
      const response = await fetch(BASE_URL + '/api/health');
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('Timed out waiting for Ma9icTV server');
}

async function createWindow() {
  startServer();
  await waitForServer();
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#101114', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(BASE_URL);
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.ma9ic.tv');
  try { await createWindow(); }
  catch (err) {
    log('STARTUP ERROR: ' + (err && err.stack ? err.stack : err));
    dialog.showErrorBox('Ma9icTV could not start', String(err && err.message ? err.message : err) +
      '\n\nSee ma9ictv-desktop.log in your Ma9icTV user data folder.');
    app.quit();
  }
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0 && !stopping) {
      try { await createWindow(); } catch (err) { log(String(err)); }
    }
  });
});

function stopServer() {
  stopping = true;
  if (serverProcess && serverProcess.exitCode === null) {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(serverProcess.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      else serverProcess.kill('SIGTERM');
    } catch (err) { log('SERVER STOP ERROR: ' + err); }
  }
  if (logStream) { try { logStream.end(); } catch (_) {} }
}
app.on('before-quit', stopServer);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
