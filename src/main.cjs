'use strict';
const { app, BrowserWindow, ipcMain, dialog, session, powerMonitor, Menu } = require('electron');
const path = require('node:path'),
  fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Vault, readImport, empty } = require('./vault.cjs');
let win,
  vault,
  staged = null,
  lastActivity = Date.now(),
  failed = 0,
  nextTry = 0,
  busy = false,
  epoch = 0;
const ui = path.join(__dirname, '../ui');
const gateURL = pathToFileURL(path.join(ui, 'gate.html')).href,
  appURL = pathToFileURL(path.join(ui, 'app.html')).href;
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setName('Horizon - personal finance');
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    const dir =
      !app.isPackaged && process.env.HORIZON_TEST_DATA
        ? process.env.HORIZON_TEST_DATA
        : path.join(app.getPath('appData'), '..', 'Local', 'HorizonPersonalFinance', 'dados');
    vault = new Vault(path.resolve(dir));
    const ses = session.fromPartition('horizon-private');
    ses.setPermissionRequestHandler((wc, p, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    ses.webRequest.onBeforeRequest((details, cb) =>
      cb({ cancel: !details.url.startsWith('file:') && !details.url.startsWith('data:') })
    );
    win = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 850,
      minHeight: 650,
      title: 'Horizon - personal finance',
      icon: path.join(ui, 'Horizon.ico'),
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        partition: 'horizon-private',
        devTools: false,
      },
    });
    Menu.setApplicationMenu(null);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e, url) => {
      if (![gateURL, appURL].includes(url)) e.preventDefault();
    });
    win.webContents.on('will-attach-webview', (e) => e.preventDefault());
    win.once('ready-to-show', () => {
      if (
        !process.argv.includes('--horizon-smoke-test') &&
        (app.isPackaged || !process.env.HORIZON_TEST_DATA)
      )
        win.show();
    });
    win.loadFile(path.join(ui, 'gate.html'));
    win.on('closed', () => {
      vault.lock();
      staged = null;
      win = null;
    });
    powerMonitor.on('suspend', lock);
    powerMonitor.on('lock-screen', lock);
    setInterval(() => {
      if (vault.db && Date.now() - lastActivity > 5 * 60 * 1000) lock();
    }, 5000).unref();
  });
}
function trusted(e) {
  const url = e.senderFrame?.url;
  if (
    !win ||
    e.sender !== win.webContents ||
    e.senderFrame !== win.webContents.mainFrame ||
    ![gateURL, appURL].includes(url)
  )
    throw Error('Origem não autorizada.');
  return url;
}
function lock() {
  if (!vault) return;
  epoch++;
  vault.lock();
  staged = null;
  if (win && !win.isDestroyed()) win.loadFile(path.join(ui, 'gate.html'));
}
function unchanged(token) {
  if (token !== epoch)
    throw Error('O cofre foi bloqueado. Repita a operação após abrir novamente.');
}
function register(name, fn, scope) {
  ipcMain.handle('horizon:' + name, async (e, ...args) => {
    try {
      const url = trusted(e);
      if (scope === 'open') {
        if (url !== appURL) throw Error('Abra o cofre.');
        vault.requireOpen();
      }
      if (scope === 'gate' && url !== gateURL) throw Error('Operação indisponível.');
      const value = await fn(...args);
      lastActivity = Date.now();
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}
const summary = (s) => ({
  entries: s.entries.length,
  goals: s.goals.length,
  contributions: s.contributions.length,
  withdrawals: s.withdrawals.length,
  cards: s.cards.length,
  purchases: s.purchases.length,
});
async function choose() {
  const token = epoch,
    r = await dialog.showOpenDialog(win, {
      title: 'Importar uma cópia dos dados do Horizon',
      filters: [
        { name: 'Backup Horizon ou SQLite anterior', extensions: ['json', 'sqlite', 'db'] },
      ],
      properties: ['openFile'],
    });
  unchanged(token);
  if (r.canceled) return null;
  return readImport(r.filePaths[0]);
}
function authenticate(fn) {
  if (Date.now() < nextTry) throw Error('Aguarde alguns segundos antes de tentar novamente.');
  try {
    const r = fn();
    failed = 0;
    nextTry = 0;
    return r;
  } catch (e) {
    failed++;
    nextTry = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(failed, 5));
    throw e;
  }
}
register('status', () => ({
  exists: vault.exists(),
  path: vault.file,
  staged: staged ? summary(staged) : null,
}));
register(
  'choose-import',
  async () => {
    busy = true;
    try {
      const s = await choose();
      if (s) staged = s;
      return staged ? summary(staged) : null;
    } finally {
      busy = false;
    }
  },
  'gate'
);
register(
  'create',
  async (password) => {
    vault.create(password, staged || empty());
    staged = null;
    setImmediate(() => win.loadFile(path.join(ui, 'app.html')));
    return true;
  },
  'gate'
);
register(
  'unlock',
  async (password) => {
    authenticate(() => vault.unlock(password));
    setImmediate(() => win.loadFile(path.join(ui, 'app.html')));
    return true;
  },
  'gate'
);
register('read', () => vault.read(), 'open');
register('save', (state, rev) => vault.save(state, rev), 'open');
register('destructive-save', (state, rev) => vault.save(state, rev, true), 'open');
register(
  'backup',
  async () => {
    busy = true;
    const token = epoch;
    try {
      const r = await dialog.showSaveDialog(win, {
        title: 'Salvar backup criptografado',
        defaultPath: 'Horizon-backup-' + new Date().toISOString().slice(0, 10) + '.sqlite.enc',
        filters: [{ name: 'Banco criptografado', extensions: ['enc'] }],
      });
      unchanged(token);
      if (r.canceled) return false;
      if (fs.existsSync(r.filePath))
        throw Error('Escolha um nome novo para preservar o arquivo existente.');
      vault.backup(r.filePath);
      return true;
    } finally {
      busy = false;
    }
  },
  'open'
);
register(
  'import',
  async () => {
    busy = true;
    const token = epoch;
    try {
      const s = await choose();
      if (!s) return false;
      const r = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Cancelar', 'Importar cópia'],
        defaultId: 0,
        cancelId: 0,
        message: 'Substituir os dados deste cofre?',
        detail:
          JSON.stringify(summary(s)) +
          '\nUm backup criptografado da versão anterior será preservado.',
      });
      unchanged(token);
      if (r.response !== 1) return false;
      vault.replaceState(s);
      return true;
    } finally {
      busy = false;
    }
  },
  'open'
);
register(
  'restore',
  async (password) => {
    busy = true;
    const token = epoch;
    try {
      const r = await dialog.showOpenDialog(win, {
        title: 'Escolha um backup criptografado deste aplicativo',
        filters: [{ name: 'Banco criptografado', extensions: ['enc'] }],
        properties: ['openFile'],
      });
      unchanged(token);
      if (r.canceled) return false;
      if (vault.exists()) {
        const confirm = await dialog.showMessageBox(win, {
          type: 'question',
          message: 'Substituir este cofre pelo backup?',
          detail:
            'O cofre anterior será preservado com o nome antes-restauracao. A senha passa a ser a senha do backup.',
          buttons: ['Cancelar', 'Restaurar'],
          defaultId: 0,
          cancelId: 0,
        });
        unchanged(token);
        if (confirm.response !== 1) return false;
      }
      authenticate(() => vault.restore(r.filePaths[0], password));
      staged = null;
      setImmediate(() => win.loadFile(path.join(ui, 'app.html')));
      return true;
    } finally {
      busy = false;
    }
  },
  'gate'
);
register(
  'password',
  (oldPassword, newPassword) => {
    authenticate(() => vault.changePassword(oldPassword, newPassword));
    return true;
  },
  'open'
);
register(
  'lock',
  () => {
    setImmediate(lock);
    return true;
  },
  'open'
);
ipcMain.on('horizon:activity', (e) => {
  try {
    trusted(e);
    lastActivity = Date.now();
  } catch {}
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (vault) vault.lock();
});
