'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict'),
  { _electron } = require('playwright');
const root = path.resolve(__dirname, '..'),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'horizon-public-test-'));
(async () => {
  let app;
  const checks = [];
  try {
    app = await _electron.launch({
      executablePath: require('electron'),
      args: [root, '--user-data-dir=' + path.join(dir, 'profile')],
      cwd: root,
      env: { ...process.env, HORIZON_TEST_DATA: path.join(dir, 'vault') },
      timeout: 30000,
    });
    const p = await app.firstWindow();
    p.setDefaultTimeout(15000);
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.waitForSelector('#title');
    const status = await p.evaluate(() => window.horizon.status());
    assert.ok(status.path.startsWith(dir));
    assert.equal(status.exists, false);
    checks.push('Primeiro uso usa pasta temporária e não exige dados anteriores');
    const pass = crypto.randomBytes(24).toString('base64url');
    await p.locator('#password').fill(pass);
    await p.locator('#confirm').fill(pass);
    await p.locator('#ack').check();
    await p.locator('#submit').click();
    await p.waitForSelector('#nav');
    const clean = await p.evaluate(() => S);
    for (const key of [
      'entries',
      'templates',
      'cards',
      'purchases',
      'goals',
      'contributions',
      'withdrawals',
    ])
      assert.equal(clean[key].length, 0, key);
    assert.equal(clean.banks?.length || 0, 0);
    checks.push('Cria cofre vazio sem regras pessoais, registros ou bancos pré-definidos');
    const raw = fs.readFileSync(status.path);
    assert.notEqual(raw.subarray(0, 16).toString(), 'SQLite format 3\0');
    assert.equal(await p.evaluate(() => typeof require), 'undefined');
    checks.push('Arquivo criptografado e renderer sem Node');
    await p.evaluate(async (demo) => {
      S = demo;
      await save();
    }, require('./demo.cjs')());
    const imageDir = path.join(root, 'docs/images');
    fs.mkdirSync(imageDir, { recursive: true });
    for (const [label, file] of [
      ['Dashboard', 'dashboard'],
      ['Planejamento', 'planejamento'],
      ['Cartão', 'cartoes'],
      ['Metas', 'metas'],
      ['Configurações', 'configuracoes'],
    ]) {
      await p.evaluate((label) => {
        page = label;
        month = '2026-11';
        rangeStart = '2026-09';
        rangeEnd = '2026-12';
        if (label === 'Metas') {
          selectedGoalId = S.goals[0].id;
          goalTab[selectedGoalId] = 'contributions';
        }
        render();
      }, label);
      assert.ok((await p.locator('#app').textContent()).length > 50);
    }
    checks.push('Cinco áreas renderizam com dados fictícios');
    await p.evaluate(() => {
      page = 'Configurações';
      render();
    });
    assert.equal(await p.getByRole('button', { name: 'Subir categoria', exact: false }).count(), 0);
    await p.locator('[data-category-sort]').click();
    await p.waitForFunction(() => S.categorySortMode === 'desc');
    checks.push('Ordenação de categorias preservada');
    const bankId = await p.evaluate(() => defaultBank());
    await p.evaluate(() => {
      page = 'Planejamento';
      render();
      entryForm('expense', '2026-11-20');
    });
    assert.equal(await p.locator('#field-bankId').inputValue(), bankId);
    await p.evaluate(() => closeModal());
    checks.push('Novas despesas recebem o banco padrão escolhido pelo usuário');
    await p.evaluate(() => {
      page = 'Metas';
      selectedGoalId = S.goals[0].id;
      goalTab[selectedGoalId] = 'contributions';
      render();
    });
    const labels = await p.locator('.grid .metric label').allTextContents();
    assert.equal(labels[1], 'Total em aberto');
    assert.equal(labels[2], 'Total confirmado');
    assert.ok(await p.locator('.grid .metric strong.positive').count());
    checks.push('Cards de metas mantêm ordem e confirmação positiva');
    await p.evaluate(() => window.horizon.lock());
    await p.waitForSelector('#password');
    await p.locator('#password').fill(pass);
    await p.locator('#submit').click();
    await p.waitForSelector('#nav');
    assert.equal(await p.evaluate(() => S.goals[0].name), 'Reserva de emergência');
    checks.push('Bloqueio e reabertura preservam apenas os dados sintéticos do teste');
    assert.deepEqual(errors, []);
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'test-results/public-ui.json'),
      JSON.stringify({ passed: checks.length, checks, errors }, null, 2)
    );
    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  } finally {
    if (app) await app.close();
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep))
      throw Error('Pasta de testes fora do temporário');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
