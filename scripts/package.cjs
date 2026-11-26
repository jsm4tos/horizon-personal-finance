'use strict';
const fs = require('node:fs'),
  path = require('node:path');
(async () => {
  const { packager } = await import('@electron/packager');
  const root = path.resolve(__dirname, '..');
  const builds = await packager({
    dir: root,
    name: 'Horizon',
    platform: 'win32',
    arch: 'x64',
    out: path.join(root, 'release'),
    icon: path.join(root, 'ui/Horizon.ico'),
    asar: { unpack: '**/*.node' },
    overwrite: false,
    prune: true,
    ignore: [
      /^\/(?:\.git|\.github|tests|scripts|docs|test-results|dist|release|data|dados|backups|tmp)(?:\/|$)/,
      /\.sqlite(?:\.enc)?$/,
      /\.lnk$/,
      /\.zip$/,
    ],
    win32metadata: {
      CompanyName: 'Horizon Project',
      FileDescription: 'Horizon - personal finance',
      ProductName: 'Horizon',
    },
  });
  for (const folder of builds)
    fs.writeFileSync(
      path.join(folder, 'COMO-USAR.txt'),
      'HORIZON — PERSONAL FINANCE\r\n\r\n1. Extraia a pasta inteira do ZIP.\r\n2. Abra Horizon.exe. Não mova somente o executável.\r\n3. Crie sua senha de pelo menos 12 caracteres. Você começa com um cofre vazio.\r\n\r\nDados: %LOCALAPPDATA%/HorizonPersonalFinance/dados\r\nFaça backups em Configurações. Sem a senha, não há recuperação do cofre.\r\n\r\nAplicativo sem assinatura digital. Não desative o antivírus para executar.\r\n'
    );
  console.log(builds.join('\n'));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
