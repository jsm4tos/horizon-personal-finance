'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const Database = require('better-sqlite3-multiple-ciphers');
const { Vault, readImport, empty, validate } = require('../src/vault.cjs');
function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'horizon-encrypted-tests-'));
  const passed = [];
  const test = (name, fn) => {
    fn();
    passed.push(name);
  };
  const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const original = path.join(dir, 'source.sqlite');
  const source = new Database(original);
  source.exec('CREATE TABLE app(id INTEGER PRIMARY KEY,data TEXT NOT NULL)');
  source.prepare('INSERT INTO app VALUES(1,?)').run(JSON.stringify(require('./fixture.cjs')()));
  source.close();
  const before = hash(original);
  const pw = crypto.randomBytes(32).toString('base64url') + "'á🔐",
    pw2 = crypto.randomBytes(32).toString('base64url');
  const vault = new Vault(path.join(dir, 'vault'));
  let backup;
  try {
    test('Importa a base SQLite anterior somente para leitura', () => {
      const state = readImport(original);
      vault.create(pw, state);
      assert.deepEqual(vault.read().state, state);
      assert.equal(hash(original), before);
    });
    test('Arquivo e journal não contêm cabeçalho SQLite ou texto financeiro', () => {
      const raw = fs.readFileSync(vault.file);
      assert.notEqual(raw.subarray(0, 16).toString(), 'SQLite format 3\0');
      assert.ok(!raw.includes(Buffer.from('Meta de teste')));
      assert.ok(!fs.existsSync(vault.file + '-wal'));
      assert.ok(!fs.existsSync(vault.file + '-journal'));
      const d = new Database(vault.file, { readonly: true });
      try {
        assert.throws(() => d.prepare('SELECT * FROM app').all());
      } finally {
        d.close();
      }
    });
    test('Salva transacionalmente e rejeita revisão antiga', () => {
      const r = vault.read();
      r.state.testMarker = 'persistência';
      const saved = vault.save(r.state, r.revision);
      assert.ok(saved.revision !== r.revision);
      assert.throws(() => vault.save(r.state, r.revision), /mudaram/);
    });
    test('Bloqueio impede acesso e senha errada preserva arquivo', () => {
      vault.lock();
      const h = hash(vault.file);
      assert.throws(() => vault.read(), /bloqueado/);
      assert.throws(() => vault.unlock('incorreta'), /senha incorreta/);
      assert.equal(hash(vault.file), h);
      vault.unlock(pw);
      assert.equal(vault.read().state.testMarker, 'persistência');
    });
    test('Backup continua criptografado e reabre com a senha', () => {
      backup = path.join(dir, 'backup.enc');
      vault.backup(backup);
      assert.equal(hash(backup), hash(vault.file));
      const other = new Vault(path.join(dir, 'restored'));
      try {
        other.restore(backup, pw);
        assert.deepEqual(other.read().state, vault.read().state);
      } finally {
        other.lock();
      }
    });
    test('Corrupção é rejeitada antes de expor dados', () => {
      const corrupt = path.join(dir, 'corrupt.enc'),
        raw = fs.readFileSync(backup);
      raw[4300] ^= 0xff;
      fs.writeFileSync(corrupt, raw);
      const v = new Vault(path.join(dir, 'bad'));
      assert.throws(() => v.restore(corrupt, pw));
      assert.ok(!v.exists());
    });
    test('Troca de senha invalida a antiga sem alterar backup anterior', () => {
      vault.changePassword(pw, pw2);
      assert.equal(vault.read().state.testMarker, 'persistência');
      vault.lock();
      assert.throws(() => vault.unlock(pw));
      vault.unlock(pw2);
      const v = new Vault(path.join(dir, 'old-backup'));
      try {
        v.restore(backup, pw);
        assert.equal(v.read().state.testMarker, 'persistência');
      } finally {
        v.lock();
      }
    });
    test('Importação JSON valida formato e preserva cópia anterior criptografada', () => {
      const json = path.join(dir, 'fake.json'),
        s = empty();
      s.entries.push({
        id: 'test-1',
        name: 'Teste',
        value: 1,
        date: '2026-10-21',
        kind: 'income',
        paid: false,
      });
      fs.writeFileSync(json, JSON.stringify({ format: 'horizon-backup', version: 1, state: s }));
      vault.replaceState(readImport(json));
      assert.deepEqual(vault.read().state, s);
      assert.ok(fs.readdirSync(vault.dir).some((n) => n.startsWith('antes-importacao')));
      fs.writeFileSync(json, '{"format":"outro"}');
      assert.throws(() => readImport(json));
      assert.throws(() => validate({ ...empty(), entries: [{ id: "bad' onclick='evil" }] }));
      assert.throws(() => vault.create('curta', s));
    });
    test('Reabertura final e arquivo de origem preservado', () => {
      vault.lock();
      vault.unlock(pw2);
      assert.equal(vault.read().state.entries[0].name, 'Teste');
      assert.equal(hash(original), before);
    });
    test('Exclusão cria backup anterior dentro da transação e revisão inválida não cria backup', () => {
      const before = vault.read(),
        count = () =>
          fs.readdirSync(vault.dir).filter((n) => n.startsWith('antes-exclusao')).length;
      const n = count();
      assert.throws(() => vault.save(before.state, 'invalid', true), /mudaram/);
      assert.equal(count(), n);
      const next = structuredClone(before.state);
      next.entries = [];
      const result = vault.save(next, before.revision, true);
      assert.equal(count(), n + 1);
      const d = require('../src/vault.cjs').open(path.join(vault.dir, result.backup), pw2, true);
      try {
        assert.deepEqual(
          JSON.parse(d.prepare('SELECT data FROM app WHERE id=1').get().data),
          before.state
        );
      } finally {
        d.close();
      }
      assert.equal(vault.read().state.entries.length, 0);
    });
    return {
      passed: passed.length,
      checks: passed,
      originalDatabaseUnchanged: before === hash(original),
      cipher: 'SQLite3 Multiple Ciphers / SQLCipher AES-256, PBKDF2-HMAC-SHA512 256000',
      timestamp: new Date().toISOString(),
    };
  } finally {
    vault.lock();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
module.exports = { run };
if (require.main === module) console.log(JSON.stringify(run(), null, 2));
