'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  skip = new Set(['.git', 'node_modules', 'dist', 'release', 'test-results']);
const failures = [];
function inspect(file) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  if (
    /\.(?:sqlite3?|db|enc|lnk|exe|zip|pdb)$/i.test(file) ||
    /(?:^|\/)(?:data|dados|backups)(?:\/|$)/i.test(rel)
  )
    failures.push(rel + ': arquivo privado ou artefato de distribuição');
  if (/\.(?:cjs|js|html|css|json|md|yml|txt)$/i.test(file)) {
    const text = fs.readFileSync(file, 'utf8');
    if (/[A-Z]:[\\/]Users[\\/][^\s"'<>]+/i.test(text))
      failures.push(rel + ': caminho pessoal absoluto');
    if (
      /BEGIN requested bank classification|applyRequestedBanks|bankClassificationVersion/.test(
        text
      ) &&
      /^(?:src|ui)\//.test(rel)
    )
      failures.push(rel + ': regra financeira pessoal');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))
      failures.push(rel + ': chave privada');
  }
}
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) {
      failures.push(path.relative(root, p) + ': link simbólico');
      continue;
    }
    e.isDirectory() ? walk(p) : inspect(p);
  }
}
walk(root);
try {
  for (const rel of cp
    .execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    .split('\0')
    .filter(Boolean)) {
    if (/^(?:node_modules|dist|release|test-results|data|dados|backups)\//.test(rel))
      failures.push(rel + ': pasta indevida versionada');
  }
} catch {}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Verificação concluída: sem cofres, backups, caminhos pessoais ou regras financeiras particulares no código publicável.'
  );
