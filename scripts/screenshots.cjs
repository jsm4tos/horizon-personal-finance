'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { pathToFileURL } = require('node:url'),
  { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const root = path.resolve(__dirname, '..'),
      p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await p.addInitScript((state) => {
      window.horizon = {
        read: async () => ({ state, revision: 'demo' }),
        activity: () => {},
        onLock: () => {},
      };
    }, require('../tests/demo.cjs')());
    await p.goto(pathToFileURL(path.join(root, 'ui/app.html')).href);
    await p.waitForSelector('#nav');
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
      await p.screenshot({ path: path.join(root, 'docs/images', file + '.png'), fullPage: true });
    }
    console.log('Imagens geradas com dados fictícios, sem abrir nenhum cofre real.');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
