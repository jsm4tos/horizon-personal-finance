'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3-multiple-ciphers');
const KEYS = [
  'cycles',
  'entries',
  'templates',
  'cards',
  'purchases',
  'goals',
  'contributions',
  'withdrawals',
  'categories',
];
const empty = () =>
  Object.fromEntries(
    KEYS.map((k) => [
      k,
      k === 'categories'
        ? [
            'Moradia',
            'Alimentação',
            'Transporte',
            'Educação',
            'Saúde',
            'Lazer',
            'Assinaturas',
            'Outros',
          ]
        : [],
    ])
  );
function validate(state) {
  if (
    state?.banks !== undefined &&
    (!Array.isArray(state.banks) ||
      state.banks.some(
        (b) => !b || typeof b.name !== 'string' || !b.name.trim() || b.name.length > 80
      ))
  )
    throw Error('Cadastro de bancos inválido.');
  const bankIdValid = (x) =>
    x == null || x === '' || (typeof x === 'string' && /^[a-zA-Z0-9:_-]{1,200}$/.test(x));
  if (!bankIdValid(state?.defaultBankId)) throw Error('Banco padrão inválido.');
  if (!state || typeof state !== 'object' || !KEYS.every((k) => Array.isArray(state[k])))
    throw Error('Estrutura de dados inválida.');
  const raw = JSON.stringify(state);
  if (Buffer.byteLength(raw) > 20 * 1024 * 1024) throw Error('Base acima do limite de 20 MB.');
  const inspect = (v, depth = 0) => {
    if (depth > 30) throw Error('Dados muito aninhados.');
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (['__proto__', 'constructor', 'prototype'].includes(k)) throw Error('Campo inválido.');
        if (
          ['id', 'goal', 'card', 'scheduleId', 'seriesId'].includes(k) &&
          x != null &&
          (typeof x !== 'string' || !/^[a-zA-Z0-9:_-]{1,200}$/.test(x))
        )
          throw Error('Identificador inválido.');
        inspect(x, depth + 1);
      }
    } else if (typeof v === 'number' && !Number.isFinite(v)) throw Error('Número inválido.');
  };
  inspect(state);
  return JSON.parse(raw);
}
function passwordCheck(p) {
  if (typeof p !== 'string' || p.length < 12 || p.length > 256 || p.includes('\0'))
    throw Error('Use uma senha de 12 a 256 caracteres.');
}
function cipher(db, password) {
  db.pragma("cipher='sqlcipher'");
  db.pragma('legacy=0');
  db.pragma('kdf_iter=256000');
  db.pragma('hmac_use=1');
  db.key(Buffer.from(password, 'utf8'));
}
function open(file, password, readonly = false) {
  if (typeof password !== 'string' || password.length > 256) throw Error('Senha inválida.');
  const db = new Database(file, { readonly, fileMustExist: true });
  try {
    cipher(db, password);
    db.prepare('SELECT count(*) FROM sqlite_master').get();
    if (db.pragma('quick_check', { simple: true }) !== 'ok') throw Error();
    db.pragma('temp_store=MEMORY');
    db.pragma('secure_delete=ON');
    return db;
  } catch (e) {
    db.close();
    throw Error('Não foi possível abrir: senha incorreta ou arquivo inválido.');
  }
}
const revision = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
class Vault {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'horizon.sqlite.enc');
    this.db = null;
  }
  exists() {
    return fs.existsSync(this.file);
  }
  requireOpen() {
    if (!this.db) throw Error('O cofre está bloqueado.');
    return this.db;
  }
  create(password, state = empty()) {
    passwordCheck(password);
    state = validate(state);
    if (this.exists()) throw Error('Já existe um cofre.');
    fs.mkdirSync(this.dir, { recursive: true });
    const temp = this.file + '.creating-' + crypto.randomUUID();
    let db;
    try {
      db = new Database(temp);
      cipher(db, password);
      db.pragma('journal_mode=DELETE');
      db.pragma('synchronous=FULL');
      db.pragma('temp_store=MEMORY');
      db.exec('CREATE TABLE app(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
      db.prepare('INSERT INTO app VALUES(1,?)').run(JSON.stringify(state));
      db.close();
      db = null;
      const check = open(temp, password, true);
      check.close();
      fs.renameSync(temp, this.file);
      this.unlock(password);
    } finally {
      if (db) db.close();
      for (const p of [temp, temp + '-journal']) if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }
  unlock(password) {
    this.lock();
    this.db = open(this.file, password);
    this.db.pragma('journal_mode=DELETE');
    this.db.pragma('synchronous=FULL');
    try {
      this.read();
    } catch (e) {
      this.lock();
      throw e;
    }
  }
  read() {
    const row = this.requireOpen().prepare('SELECT data FROM app WHERE id=1').get();
    if (!row) throw Error('Base sem registros.');
    return { state: validate(JSON.parse(row.data)), revision: revision(row.data) };
  }
  save(state, expected, withBackup = false) {
    const next = JSON.stringify(validate(state)),
      db = this.requireOpen();
    return db.transaction(() => {
      const raw = db.prepare('SELECT data FROM app WHERE id=1').get().data;
      if (revision(raw) !== expected)
        throw Error('Os dados mudaram. Reabra a tela antes de salvar.');
      let backup;
      if (withBackup) {
        backup = 'antes-exclusao-' + Date.now() + '-' + crypto.randomUUID() + '.sqlite.enc';
        this.backup(path.join(this.dir, backup));
      }
      db.prepare('UPDATE app SET data=? WHERE id=1').run(next);
      return { revision: revision(next), ...(backup ? { backup } : {}) };
    })();
  }
  backup(dest) {
    this.requireOpen();
    if (path.resolve(dest) === path.resolve(this.file)) throw Error('Escolha outro arquivo.');
    fs.copyFileSync(this.file, dest, fs.constants.COPYFILE_EXCL);
    return dest;
  }
  replaceState(state) {
    const old = this.read();
    this.backup(path.join(this.dir, 'antes-importacao-' + Date.now() + '.sqlite.enc'));
    return this.save(state, old.revision);
  }
  changePassword(oldPassword, newPassword) {
    passwordCheck(newPassword);
    this.requireOpen();
    const check = open(this.file, oldPassword, true);
    check.close();
    this.backup(path.join(this.dir, 'antes-troca-senha-' + Date.now() + '.sqlite.enc'));
    this.db.rekey(Buffer.from(newPassword, 'utf8'));
    this.lock();
    this.unlock(newPassword);
  }
  lock() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
  restore(source, password) {
    const check = open(source, password, true);
    try {
      const row = check.prepare('SELECT data FROM app WHERE id=1').get();
      validate(JSON.parse(row.data));
    } finally {
      check.close();
    }
    fs.mkdirSync(this.dir, { recursive: true });
    const temp = this.file + '.restore-' + crypto.randomUUID();
    fs.copyFileSync(source, temp);
    try {
      this.lock();
      if (this.exists())
        fs.renameSync(
          this.file,
          path.join(this.dir, 'antes-restauracao-' + Date.now() + '.sqlite.enc')
        );
      fs.renameSync(temp, this.file);
      this.unlock(password);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
}
function readImport(file) {
  if (fs.statSync(file).size > 20 * 1024 * 1024) throw Error('O arquivo ultrapassa 20 MB.');
  if (file.toLowerCase().endsWith('.json')) {
    const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (value.format !== 'horizon-backup' || value.version !== 1)
      throw Error('Escolha um backup JSON do Horizon.');
    return validate(value.state);
  }
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare('SELECT data FROM app WHERE id=1').get();
    return validate(JSON.parse(row.data));
  } finally {
    db.close();
  }
}
module.exports = { Vault, validate, readImport, empty, open };
