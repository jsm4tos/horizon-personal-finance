'use strict';
const cp = require('node:child_process'),
  path = require('node:path');
const root = path.resolve(__dirname, '..');
cp.execFileSync(process.execPath, [path.join(root, 'node_modules/electron/install.js')], {
  cwd: root,
  stdio: 'inherit',
});
const Database = require('better-sqlite3-multiple-ciphers');
const db = new Database(':memory:');
db.prepare('SELECT 1').get();
db.close();
console.log('Electron e SQLite nativo prontos.');
