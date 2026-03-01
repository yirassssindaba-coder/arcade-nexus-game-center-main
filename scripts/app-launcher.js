const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'app.json');
const PID_PATH = path.join(ROOT, '.arcade-nexus-server.pid');
const config = readJson(CONFIG_PATH, { host: '127.0.0.1', port: 3210 });
const url = `http://${config.host || '127.0.0.1'}:${config.port || 3210}/`;

(async () => {
  try {
    const alreadyRunning = await isReachable(`${url}status`);
    let serverPid = null;

    if (!alreadyRunning) {
      const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: ROOT,
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      serverPid = child.pid;
      fs.writeFileSync(PID_PATH, String(serverPid), 'utf8');
      await waitUntilReady(`${url}status`, 12000);
    }

    const launched = launchBrowser(url);
    if (!launched) {
      console.log(`Server ready at ${url}`);
      console.log('Open the URL above in your browser if a window did not open automatically.');
      return;
    }

    console.log('Arcade Nexus launched in app-style window.');
    if (serverPid) console.log(`Background server PID: ${serverPid}`);
  } catch (error) {
    console.error('Failed to launch Arcade Nexus:', error.message);
    process.exitCode = 1;
  }
})();

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function isReachable(target) {
  return new Promise(resolve => {
    const req = http.get(target, res => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitUntilReady(target, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isReachable(target)) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Server did not become ready in time.');
}

function launchBrowser(target) {
  const platform = process.platform;
  const browser = findBrowser(platform);

  try {
    if (browser) {
      const child = spawn(browser, [
        `--app=${target}`,
        '--window-size=1440,920',
        '--disable-session-crashed-bubble',
        '--disable-features=Translate'
      ], { detached: true, stdio: 'ignore' });
      child.unref();
      return true;
    }

    if (platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' });
      child.unref();
      return true;
    }
    if (platform === 'darwin') {
      const child = spawn('open', [target], { detached: true, stdio: 'ignore' });
      child.unref();
      return true;
    }
    if (platform === 'linux') {
      const child = spawn('xdg-open', [target], { detached: true, stdio: 'ignore' });
      child.unref();
      return true;
    }
  } catch (_) {
    return false;
  }
  return false;
}

function findBrowser(platform) {
  if (platform === 'win32') {
    const roots = [
      process.env.LOCALAPPDATA,
      process.env['PROGRAMFILES(X86)'],
      process.env.PROGRAMFILES
    ].filter(Boolean);
    const suffixes = [
      ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
      ['Google', 'Chrome', 'Application', 'chrome.exe'],
      ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe']
    ];
    for (const base of roots) {
      for (const parts of suffixes) {
        const candidate = path.join(base, ...parts);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return null;
  }

  if (platform === 'darwin') {
    const apps = [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    ];
    return apps.find(fs.existsSync) || null;
  }

  const bins = ['microsoft-edge', 'google-chrome', 'chromium-browser', 'chromium', 'brave-browser'];
  for (const bin of bins) {
    try {
      const which = spawn('which', [bin]);
      // lightweight optimistic fallback: return bin and let spawn handle failure
      which.kill();
      return bin;
    } catch (_) {}
  }
  return null;
}
