'use strict';
const $ = (s) => document.querySelector(s);
let exists = false;
const message = (t) => ($('#message').textContent = t);
async function run(fn) {
  document.querySelectorAll('button').forEach((b) => (b.disabled = true));
  message('');
  try {
    await fn();
  } catch (e) {
    message(e.message);
  } finally {
    document.querySelectorAll('button').forEach((b) => (b.disabled = false));
  }
}
async function init() {
  const status = await window.horizon.status();
  exists = status.exists;
  $('#title').textContent = exists ? 'Bem-vindo de volta' : 'Crie seu cofre local';
  $('#description').textContent = exists
    ? 'Digite sua senha para acessar os registros financeiros.'
    : 'Comece com um cofre vazio ou importe um backup. Escolha uma senha com pelo menos 12 caracteres.';
  $('#new-options').hidden = exists;
  $('#confirm-area').hidden = exists;
  $('#confirm').required = !exists;
  $('#password').minLength = exists ? 1 : 12;
  $('#submit').textContent = exists ? 'Desbloquear Horizon' : 'Criar meu cofre';
  $('#location').textContent = 'Banco: ' + status.path;
}
$('#choose').addEventListener('click', () =>
  run(async () => {
    const counts = await window.horizon.chooseImport();
    if (counts)
      $('#summary').textContent =
        counts.entries +
        ' lançamentos · ' +
        counts.goals +
        ' metas · ' +
        counts.contributions +
        ' aportes · ' +
        counts.cards +
        ' cartões. Cópia selecionada; o arquivo de origem será preservado.';
  })
);
$('#access').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    let password = $('#password').value;
    if (!exists) {
      if (password !== $('#confirm').value) throw Error('As senhas não coincidem.');
      if (!$('#ack').checked)
        throw Error('Confirme que compreendeu a responsabilidade pela senha.');
    }
    $('#password').value = '';
    $('#confirm').value = '';
    try {
      if (exists) await window.horizon.unlock(password);
      else await window.horizon.create(password);
    } finally {
      password = null;
    }
  });
});
$('#show-password').addEventListener('click', () => {
  const show = $('#password').type === 'password';
  $('#password').type = show ? 'text' : 'password';
  $('#show-password').textContent = show ? 'Ocultar' : 'Mostrar';
});
$('#restore').addEventListener('click', () =>
  run(async () => {
    let password = $('#backup-password').value;
    $('#backup-password').value = '';
    if (!password) throw Error('Informe a senha do backup.');
    try {
      await window.horizon.restore(password);
    } finally {
      password = null;
    }
  })
);
init().catch((e) => message(e.message));
