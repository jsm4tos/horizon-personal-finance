let S,
  revision,
  page = 'Dashboard',
  month = new Date().toISOString().slice(0, 7),
  rangeStart = month,
  rangeEnd = month,
  goalTab = {};
const $ = (s) => document.querySelector(s),
  uid = () => crypto.randomUUID(),
  money = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    ),
  mn = (m) =>
    new Date(m + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  shift = (m, n) => {
    let d = new Date(m + '-15T12:00:00');
    d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 7);
  },
  sum = (a) => a.reduce((s, x) => s + Number(x.value || 0), 0),
  dateDay = (m, day) =>
    m +
    '-' +
    String(Math.min(day, new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate())).padStart(2, '0');
function notify(t) {
  $('#toast').textContent = t;
  $('#toast').hidden = false;
  setTimeout(() => ($('#toast').hidden = true), 3500);
}

async function loadState() {
  const r = await window.horizon.read();
  S = r.state;
  revision = r.revision;
}
async function save() {
  try {
    const r = await window.horizon.save(S, revision);
    revision = r.revision;
    render();
  } catch (e) {
    await loadState();
    render();
    throw e;
  }
}
async function encryptedBackup() {
  try {
    if (await window.horizon.backup()) notify('Backup criptografado salvo.');
  } catch (e) {
    notify(e.message);
  }
}
async function importEncryptedData() {
  try {
    if (await window.horizon.importData()) {
      await loadState();
      render();
      notify('Cópia importada; backup anterior preservado.');
    }
  } catch (e) {
    notify(e.message);
  }
}
function passwordForm() {
  modal(
    'Alterar senha',
    field('Senha atual', 'old', '', 'password', 'required autocomplete="off"') +
      field(
        'Nova senha (mínimo 12 caracteres)',
        'next',
        '',
        'password',
        'required minlength="12" autocomplete="off"'
      ) +
      field('Confirme a nova senha', 'confirm', '', 'password', 'required autocomplete="off"') +
      '<p>Backups anteriores continuam com a senha anterior. Um backup do banco anterior à troca será preservado.</p>',
    async (f) => {
      if (f.next !== f.confirm) throw Error('As senhas não coincidem.');
      await window.horizon.changePassword(f.old, f.next);
      notify('Senha alterada. Faça um novo backup.');
      f.old = f.next = f.confirm = '';
    }
  );
}
let lastActivitySignal = 0;
for (const event of ['pointerdown', 'pointermove', 'keydown', 'scroll'])
  document.addEventListener(
    event,
    () => {
      if (Date.now() - lastActivitySignal > 10000) {
        lastActivitySignal = Date.now();
        window.horizon.activity();
      }
    },
    { passive: true }
  );

function billMonth(p, c) {
  if (p.invoiceMonth) return p.invoiceMonth;
  if (!p.date || !c.close || !c.due) return '';
  let m = p.date.slice(0, 7);
  if (+p.date.slice(8) > +c.close) m = shift(m, 1);
  if (+c.due <= +c.close) m = shift(m, 1);
  return m;
}
function contributions(m) {
  return S.contributions
    .filter((x) => x.date.startsWith(m))
    .map((x) => ({
      ...x,
      name: 'Meta · ' + (S.goals.find((g) => g.id === x.goal)?.name || ''),
      planned: x.value,
      value: x.paid ? x.actual : x.value,
      kind: 'goal',
      category: 'Metas',
      contribution: x.id,
    }));
}
function stats(m) {
  let a = entries(m),
    inc = a.filter((x) => x.kind === 'income'),
    out = a.filter((x) => x.kind !== 'income');
  return {
    income: sum(inc),
    out: sum(out),
    goals: sum(out.filter((x) => x.kind === 'goal')),
    paid: sum(out.filter((x) => x.paid)),
    open: sum(out.filter((x) => !x.paid)),
    balance: sum(inc) - sum(out),
    count: out.length,
    checked: out.filter((x) => x.paid).length,
    realIncome: sum(inc.filter((x) => x.paid)),
  };
}
function metric(label, v, sub = '', cls = '') {
  return `<div class="card metric"><label>${label}</label><strong class="${cls}">${money(v)}</strong><small class="muted">${sub}</small></div>`;
}
function header(title, desc, actions = '') {
  return `<div class="top"><div><h1>${title}</h1><p style="margin:0">${desc}</p></div><div class="row">${actions}</div></div>`;
}
function blank(t) {
  return `<div class="empty">${t}</div>`;
}
const amount = (label = 'Valor', name = 'value', value = '') =>
  field(label, name, value, 'number', 'min="0.01" step="0.01" required');

async function remove(key, id) {
  if (confirm('Excluir este item?')) {
    S[key] = S[key].filter((x) => x.id !== id);
    await save();
  }
}
function editItem(id) {
  let x = entries(month).find((x) => x.id === id);
  if (x.bill) {
    page = 'Cartão';
    render();
    return;
  }
  if (x.contribution) return contributionForm(x.contribution);
  entryForm(x.kind, x.date, id);
}
function expenseSearch(d) {
  modal(
    'Adicionar despesa',
    field('Buscar cadastro', 'search') +
      '<div id="results"></div><button type="button" onclick="closeModal();entryForm(\'expense\',\'' +
      d +
      '\')">+ Despesa avulsa</button> <button type="button" onclick="closeModal();templateForm()">+ Novo cadastro</button>',
    async () => {},
    'Fechar'
  );
  let draw = () => {
    $('#results').innerHTML =
      S.templates
        .filter(
          (t) =>
            !t.expenseDeleted &&
            t.name.toLowerCase().includes($('[name=search]').value.toLowerCase())
        )
        .map(
          (t) =>
            `<div class="item"><span class="name">${esc(t.name)}<small>${esc(t.category)} · ${money(t.value)}</small></span><button type="button" onclick="closeModal();entryForm('expense','${d}',null,S.templates.find(t=>t.id==='${t.id}'))">Adicionar / ✎</button></div>`
        )
        .join('') || blank('Nenhum cadastro encontrado.');
  };
  $('[name=search]').oninput = draw;
  draw();
}

function templates() {
  return (
    header(
      'Biblioteca de despesas',
      'Despesas avulsas e recorrências mensais com vigência definida.',
      `<button class="primary" onclick="templateForm()">+ Nova despesa</button>`
    ) +
    `<div class="card">${
      S.templates
        .filter((t) => !t.expenseDeleted)
        .map(
          (t) =>
            `<div class="item"><span class="name">${esc(t.name)}<small>${esc(t.category)} ${t.recurring ? '· Recorrente · ' + esc(t.start || '') + ' a ' + esc(t.end || 'sem fim') : ''}</small></span><b>${money(t.value)}</b><button class="icon" onclick="templateForm('${t.id}')">✎</button><button class="icon" onclick="removeExpenseCatalog('${t.id}')">×</button></div>`
        )
        .join('') ||
      blank(
        'Cadastre despesas usadas com frequência.<br>Recorrências aparecem automaticamente no planejamento durante a vigência.'
      )
    }</div>`
  );
}

function goalStats(g) {
  let cs = S.contributions.filter((c) => c.goal === g.id),
    ws = S.withdrawals.filter((w) => w.goal === g.id),
    done = sum(cs.filter((c) => c.paid).map((c) => ({ value: c.actual }))),
    spent = sum(ws.filter((w) => w.paid)),
    open = sum(ws.filter((w) => !w.paid));
  return {
    cs,
    ws,
    done,
    spent,
    open,
    available: done - spent,
    after: done - spent - open,
    percent: (done / g.target) * 100,
  };
}
function redistribute(g) {
  let now = new Date().toISOString().slice(0, 7),
    cs = S.contributions
      .filter((c) => c.goal === g.id && !c.paid && c.date.slice(0, 7) >= now)
      .sort((a, b) => a.date.localeCompare(b.date)),
    t = goalStats(g),
    past = sum(
      S.contributions.filter((c) => c.goal === g.id && !c.paid && c.date.slice(0, 7) < now)
    );
  let cents = Math.max(0, Math.round((g.target - t.done - past) * 100));
  cs.forEach(
    (c, i) => (c.value = (Math.floor(cents / cs.length) + (i < cents % cs.length ? 1 : 0)) / 100)
  );
}
function goalForm(id) {
  let g = S.goals.find((g) => g.id === id) || {};
  modal(
    id ? 'Editar meta' : 'Nova meta',
    field('Nome', 'name', g.name || '', 'text', 'required') +
      amount('Valor alvo', 'target', g.target || '') +
      bankField(id ? (g.bankId ?? '') : undefined, 'Banco padrão da meta') +
      field('Início', 'start', g.start || month, 'month', 'required') +
      field('Fim', 'end', g.end || shift(month, 11), 'month', 'required') +
      `<label><input name="recalc" type="checkbox"> ${id ? 'Redistribuir diferença entre aportes futuros em aberto' : 'Sugerir aportes mensais iguais'}</label><p>O alvo pode ser ultrapassado. Aportes realizados são preservados.</p>`,
    async (f) => {
      if (f.end < f.start) throw Error('O fim deve ser posterior ao início.');
      let n =
        (+f.end.slice(0, 4) - +f.start.slice(0, 4)) * 12 +
        (+f.end.slice(5) - +f.start.slice(5)) +
        1;
      if (n > 600) throw Error('Período máximo: 600 meses.');
      let x = { ...f, target: +f.target, id: id || uid() };
      if (id) {
        S.goals = S.goals.map((g) => (g.id === id ? x : g));
        if (f.recalc) redistribute(x);
      } else {
        S.goals.push(x);
        if (f.recalc) {
          let cents = Math.round(x.target * 100);
          for (let i = 0; i < n; i++)
            S.contributions.push({
              id: uid(),
              goal: x.id,
              bankId: x.bankId || '',
              date: shift(f.start, i) + '-05',
              value: (Math.floor(cents / n) + (i < cents % n ? 1 : 0)) / 100,
              actual: 0,
              paid: false,
            });
        }
      }
      await save();
    }
  );
}
async function deleteGoal(id) {
  if (confirm('Excluir a meta e todos os seus aportes e saídas?')) {
    S.goals = S.goals.filter((g) => g.id !== id);
    S.contributions = S.contributions.filter((c) => c.goal !== id);
    S.withdrawals = S.withdrawals.filter((w) => w.goal !== id);
    await save();
  }
}
async function deleteCard(id) {
  if (confirm('Excluir cartão e suas compras?')) {
    S.cards = S.cards.filter((c) => c.id !== id);
    S.purchases = S.purchases.filter((p) => p.card !== id);
    await save();
  }
}

function categoryForm(encoded) {
  let old = encoded ? decodeURIComponent(encoded) : '';
  modal('Categoria', field('Nome', 'name', old, 'text', 'required'), async (f) => {
    let name = f.name.trim();
    if (!name) throw Error('Informe um nome.');
    if (S.categories.includes(name) && name !== old) throw Error('Categoria já cadastrada.');
    if (old) S.categories = S.categories.map((c) => (c === old ? name : c));
    else S.categories.push(name);
    await save();
  });
}

function invoiceBudgetForm(id, m) {
  let c = S.cards.find((c) => c.id === id),
    b = c.invoiceBudgets[m];
  modal(
    'Orçamento mensal do cartão',
    amount('Valor reservado no planejamento', 'value', b.value) +
      field('Data do ciclo', 'date', b.date, 'date', 'required') +
      '<p>O detalhamento das compras permanece separado.</p>',
    async (f) => {
      if (f.date.slice(0, 7) !== m)
        throw Error('Mantenha a data dentro da competência do orçamento.');
      c.invoiceBudgets[m] = { ...b, value: +f.value, date: f.date };
      await save();
    }
  );
}
function importSummary() {
  return (S.imports || [])
    .map(
      (i) =>
        `<div class="card section"><h3>Importação · ${esc(i.filename)}</h3><p>${esc(i.summary)}</p><details><summary>Critérios e observações da importação</summary>${i.notes.map((n) => `<p>${esc(n)}</p>`).join('')}<small class="muted">Importado em ${esc(i.importedAt)} · Backup anterior preservado</small></details></div>`
    )
    .join('');
}

// Local dates and editable month/day controls.
const today = () => {
  let d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let selectedGoalId = null,
  goalMonth = month,
  goalAsOf = today(),
  calendarState = null;
const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : 'Sem data');
const fmtMonth = (m) => (m ? m.slice(5, 7) + '/' + m.slice(0, 4) : '');
const roundMoney = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
function parseDate(v, mode) {
  v = String(v || '').trim();
  if (!v) return '';
  if (mode === 'month') {
    let m = v.match(/^(\d{4})-(\d{2})$/),
      d = v.replace(/\D/g, '');
    let year = m ? +m[1] : d.length === 6 ? +d.slice(2) : 0,
      mon = m ? +m[2] : d.length === 6 ? +d.slice(0, 2) : 0;
    return year >= 1900 && year <= 2199 && mon >= 1 && mon <= 12
      ? `${year}-${String(mon).padStart(2, '0')}`
      : null;
  }
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/),
    d = v.replace(/\D/g, '');
  let y = m ? +m[1] : d.length === 8 ? +d.slice(4) : 0,
    mo = m ? +m[2] : d.length === 8 ? +d.slice(2, 4) : 0,
    day = m ? +m[3] : d.length === 8 ? +d.slice(0, 2) : 0;
  return y >= 1900 &&
    y <= 2199 &&
    mo >= 1 &&
    mo <= 12 &&
    day >= 1 &&
    day <= new Date(y, mo, 0).getDate()
    ? `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : null;
}
function dateControl(name, id, mode, value = '', role = '', required = false) {
  let formatted = mode === 'month' ? fmtMonth(value) : fmtDate(value);
  if (!value) formatted = '';
  return `<div class="date-control"><input type="text" id="${id}" ${name ? `name="${name}"` : ''} data-date="${mode}" data-role="${role}" inputmode="numeric" maxlength="${mode === 'month' ? 7 : 10}" placeholder="${mode === 'month' ? 'MM/AAAA' : 'DD/MM/AAAA'}" aria-label="${mode === 'month' ? 'Competência' : 'Data'}" value="${esc(formatted)}" ${required ? 'required' : ''} oninput="dateMask(this)" onblur="dateCommit(this)" onkeydown="if(event.key==='Enter'){dateCommit(this);${role ? 'event.preventDefault();' : ''}}"><button type="button" class="calendar-trigger" aria-label="Abrir calendário" title="Abrir calendário" onmousedown="event.preventDefault()" onclick="openCalendar('${id}')"><svg class="calendar-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="M5 5h1v1a2 2 0 0 0 4 0V5h4v1a2 2 0 0 0 4 0V5h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm.8 5a.8.8 0 0 0-.8.8v8.4a.8.8 0 0 0 .8.8h12.4a.8.8 0 0 0 .8-.8v-8.4a.8.8 0 0 0-.8-.8H5.8Z"/><rect x="7" y="2" width="2" height="6" rx="1"/><rect x="15" y="2" width="2" height="6" rx="1"/></svg></button></div>`;
}
function dateMask(input) {
  let d = input.value.replace(/\D/g, '').slice(0, input.dataset.date === 'month' ? 6 : 8);
  input.value =
    input.dataset.date === 'month'
      ? d.slice(0, 2) + (d.length > 2 ? '/' + d.slice(2) : '')
      : d.slice(0, 2) +
        (d.length > 2 ? '/' + d.slice(2, 4) : '') +
        (d.length > 4 ? '/' + d.slice(4) : '');
  input.setCustomValidity('');
}
function dateCommit(input) {
  let iso = parseDate(input.value, input.dataset.date);
  if (iso === null) {
    input.setCustomValidity(
      'Informe uma data válida no formato ' +
        (input.dataset.date === 'month' ? 'MM/AAAA.' : 'DD/MM/AAAA.')
    );
    return false;
  }
  input.setCustomValidity('');
  input.value = input.dataset.date === 'month' ? fmtMonth(iso) : iso ? fmtDate(iso) : '';
  let role = input.dataset.role;
  if (iso && role) {
    if (role === 'planning' || role === 'card') {
      if (month !== iso) {
        month = iso;
        render();
      }
    } else if (role === 'goalMonth') {
      if (goalMonth !== iso) {
        goalMonth = iso;
        render();
      }
    } else if (role === 'goalAsOf') {
      if (goalAsOf !== iso) {
        goalAsOf = iso;
        render();
      }
    }
  }
  return true;
}
function openCalendar(id) {
  closeCalendar();
  let input = document.getElementById(id),
    iso = parseDate(input.value, input.dataset.date) || today();
  calendarState = { id, mode: input.dataset.date, year: +iso.slice(0, 4), month: +iso.slice(5, 7) };
  let popup = document.createElement('div');
  popup.id = 'calendar-popup';
  popup.className = 'calendar-popover';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', 'Calendário');
  input.parentElement.appendChild(popup);
  drawCalendar();
  let r = input.getBoundingClientRect(),
    h = popup.getBoundingClientRect().height;
  popup.style.position = 'fixed';
  popup.style.left =
    Math.max(12, Math.min(r.left, window.innerWidth - popup.offsetWidth - 12)) + 'px';
  popup.style.top = Math.max(12, Math.min(r.bottom + 6, window.innerHeight - h - 12)) + 'px';
}
function closeCalendar() {
  document.getElementById('calendar-popup')?.remove();
  calendarState = null;
}
function calendarMove(n) {
  let s = calendarState;
  if (s.mode === 'month') s.year = Math.max(1900, Math.min(2199, s.year + n));
  else {
    let d = new Date(s.year, s.month - 1 + n, 15);
    s.year = d.getFullYear();
    s.month = d.getMonth() + 1;
  }
  drawCalendar();
}
function drawCalendar() {
  let s = calendarState,
    months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    selected = parseDate(document.getElementById(s.id).value, s.mode),
    header = s.mode === 'month' ? String(s.year) : months[s.month - 1] + ' / ' + s.year,
    body = '';
  if (s.mode === 'month') {
    body = `<div class="calendar-months">${months
      .map((m, i) => {
        let iso = s.year + '-' + String(i + 1).padStart(2, '0');
        return `<button type="button" class="${selected === iso ? 'selected' : ''}" onclick="calendarPick('${iso}')">${m}</button>`;
      })
      .join('')}</div>`;
  } else {
    let first = new Date(s.year, s.month - 1, 1).getDay(),
      count = new Date(s.year, s.month, 0).getDate();
    body =
      '<div class="calendar-days">' +
      ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => `<small>${d}</small>`).join('') +
      Array(first).fill('<span></span>').join('') +
      Array.from({ length: count }, (_, i) => {
        let iso = `${s.year}-${String(s.month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
        return `<button type="button" class="${selected === iso ? 'selected' : ''}" onclick="calendarPick('${iso}')">${i + 1}</button>`;
      }).join('') +
      '</div>';
  }
  $('#calendar-popup').innerHTML =
    `<div class="calendar-head"><button type="button" aria-label="Período anterior" onclick="calendarMove(-1)">‹</button><b>${header}</b><button type="button" aria-label="Próximo período" onclick="calendarMove(1)">›</button></div>${body}<button type="button" class="calendar-close" onclick="closeCalendar()">Fechar</button>`;
}
function calendarPick(iso) {
  let input = document.getElementById(calendarState.id);
  input.value = calendarState.mode === 'month' ? fmtMonth(iso) : fmtDate(iso);
  closeCalendar();
  dateCommit(input);
}
function monthNav(m, role) {
  return `<div class="row month-navigation"><button aria-label="Mês anterior" onclick="changeMonth('${role}',-1)">←</button>${dateControl('', role + '-month', 'month', m, role, true)}<button aria-label="Próximo mês" onclick="changeMonth('${role}',1)">→</button></div>`;
}
function changeMonth(role, n) {
  if (role === 'goalMonth') goalMonth = shift(goalMonth, n);
  else month = shift(month, n);
  render();
}
function field(label, name, value = '', type = 'text', extra = '') {
  if (type === 'date' || type === 'month')
    return (
      `<label for="field-${name}">${label}</label>` +
      dateControl(
        name,
        'field-' + name,
        type === 'date' ? 'day' : 'month',
        value,
        '',
        extra.includes('required')
      )
    );
  return `<label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
}
function modal(title, body, submit, label = 'Salvar') {
  $('#modal').innerHTML =
    `<h2>${title}</h2><form id="form">${body}<div class="actions"><button type="button" onclick="closeModal()">Cancelar</button><button class="primary">${label}</button></div></form>`;
  $('#form').onsubmit = async (e) => {
    e.preventDefault();
    let button = e.submitter;
    try {
      let f = Object.fromEntries(new FormData(e.target));
      for (let input of e.target.querySelectorAll('[data-date]')) {
        let iso = parseDate(input.value, input.dataset.date);
        if (iso === null) throw Error('Confira o campo de data: ' + input.placeholder);
        if (input.required && !iso) throw Error('Preencha a data.');
        f[input.name] = iso;
      }
      if (button) button.disabled = true;
      await submit(f);
      if (document.querySelector('#form') === e.target) closeModal();
    } catch (err) {
      notify(err.message);
    } finally {
      if (button) button.disabled = false;
    }
  };
  $('#modal').showModal();
}
function closeModal() {
  closeCalendar();
  $('#modal').close();
}

// Recurring salary amounts are projections until received or edited in a month.

function salaries() {
  let schedules = S.incomeSchedules || [];
  return (
    header(
      'Entradas fixas',
      'Salários e recebimentos recorrentes vinculados aos dias de cada ciclo.',
      `<button class="primary" onclick="salaryForm()">+ Entrada fixa</button>`
    ) +
    `<div class="notice">As parcelas são previstas automaticamente no planejamento. Confirme o recebimento pelo check ou ajuste um mês pelo lápis. Entradas esporádicas continuam disponíveis em cada ciclo.</div><div class="cycles">${
      schedules
        .filter((s) => !s.end || s.end >= today().slice(0, 7))
        .map(
          (s) =>
            `<div class="card"><div class="row"><h3 class="spacer">${esc(s.name)}</h3><button class="icon" title="Editar entrada fixa" onclick="salaryForm('${s.id}')">✎</button></div><div class="salary-total">${money(sum(s.parts))}<small>/ mês</small></div><p>Vigência: ${fmtMonth(s.start)}${s.end ? ' a ' + fmtMonth(s.end) : ' em diante'}</p>${s.parts.map((p) => `<div class="item"><span class="name">Dia ${String(p.day).padStart(2, '0')}<small>Ciclo de recebimento</small></span><b>${money(p.value)}</b></div>`).join('')}<div class="row section"><button onclick="endSalary('${s.id}')">Encerrar recorrência</button></div></div>`
        )
        .join('') ||
      blank('Cadastre uma entrada fixa e distribua o valor pelos dias de recebimento.')
    }</div>${
      schedules.some((s) => s.end && s.end < today().slice(0, 7))
        ? `<details class="card section"><summary>Histórico de configurações</summary>${schedules
            .filter((s) => s.end && s.end < today().slice(0, 7))
            .map(
              (s) =>
                `<p>${esc(s.name)} · ${fmtMonth(s.start)} a ${fmtMonth(s.end)} · ${money(sum(s.parts))}/mês</p>`
            )
            .join('')}</details>`
        : ''
    }`
  );
}
function salaryPartRow(i, p = {}) {
  return `<div class="salary-part" data-part-id="${p.id || uid()}"><div><label>Dia do recebimento</label><input aria-label="Dia do recebimento ${i + 1}" type="number" name="day${i}" min="1" max="31" value="${p.day || ''}" required></div><div><label>Valor da parcela</label><input aria-label="Valor da parcela ${i + 1}" type="number" name="part${i}" min="0.01" step="0.01" value="${p.value || ''}" required></div><button type="button" class="icon" aria-label="Remover parcela" onclick="this.closest('.salary-part').remove()">×</button></div>`;
}
function salaryForm(id) {
  let s = (S.incomeSchedules || []).find((s) => s.id === id),
    parts = s?.parts || [{ day: '', value: '' }],
    start = s ? (s.start > today().slice(0, 7) ? s.start : today().slice(0, 7)) : month;
  modal(
    s ? 'Editar entrada fixa' : 'Nova entrada fixa',
    field('Descrição', 'name', s?.name || 'Salário', 'text', 'required') +
      amount('Valor mensal', 'total', sum(parts)) +
      field(
        s ? 'Aplicar a partir de' : 'Início da recorrência',
        'start',
        start,
        'month',
        'required'
      ) +
      field('Último mês (opcional)', 'end', s?.end || '', 'month') +
      '<h3 class="section">Distribuição por dias</h3><div id="salary-parts">' +
      parts.map((p, i) => salaryPartRow(i, p)).join('') +
      '</div><div class="row section"><button type="button" onclick="addSalaryPart()">+ Dia</button><button type="button" onclick="splitSalary()">Dividir igualmente</button></div><p>As parcelas devem somar o valor mensal. Meses anteriores e recebimentos já ajustados permanecem preservados.</p>',
    async (f) => {
      let rows = [...document.querySelectorAll('#salary-parts .salary-part')],
        newParts = rows.map((r) => ({
          id: r.dataset.partId,
          day: +r.querySelector('[name^=day]').value,
          value: +r.querySelector('[name^=part]').value,
        }));
      if (!newParts.length || new Set(newParts.map((p) => p.day)).size !== newParts.length)
        throw Error('Informe ao menos um dia, sem repetições.');
      if (roundMoney(sum(newParts)) !== roundMoney(+f.total))
        throw Error('A soma das parcelas deve ser igual ao valor mensal.');
      if (s && f.start < today().slice(0, 7))
        throw Error(
          'Para preservar o histórico, altere a partir do mês atual ou de um mês futuro.'
        );
      if (s && f.start < s.start)
        throw Error('Use uma competência igual ou posterior ao início atual.');
      if (f.end && f.end < f.start) throw Error('O término deve ser posterior ao início.');
      let next = {
        id: uid(),
        seriesId: s?.seriesId || s?.id || uid(),
        name: f.name,
        start: f.start,
        end: f.end,
        parts: newParts,
      };
      S.incomeSchedules = S.incomeSchedules || [];
      if (s && f.start === s.start) {
        next.id = s.id;
        S.incomeSchedules = S.incomeSchedules.map((x) => (x.id === s.id ? next : x));
      } else {
        if (s) s.end = shift(f.start, -1);
        S.incomeSchedules.push(next);
      }
      await save();
    }
  );
}
function addSalaryPart() {
  let i = Date.now();
  $('#salary-parts').insertAdjacentHTML('beforeend', salaryPartRow(i));
}
function splitSalary() {
  let rows = [...document.querySelectorAll('#salary-parts .salary-part')],
    cents = Math.round(+$('#field-total').value * 100);
  if (!rows.length || !cents) return notify('Informe o valor mensal e os dias de recebimento.');
  rows.forEach(
    (r, i) =>
      (r.querySelector('[name^=part]').value = (
        (Math.floor(cents / rows.length) + (i < cents % rows.length ? 1 : 0)) /
        100
      ).toFixed(2))
  );
}
function endSalary(id) {
  let s = S.incomeSchedules.find((s) => s.id === id);
  modal(
    'Encerrar recorrência',
    field('Última competência com recebimento', 'end', month, 'month', 'required') +
      '<p>Os meses anteriores e os lançamentos já confirmados serão mantidos.</p>',
    async (f) => {
      if (f.end < today().slice(0, 7) || f.end < s.start)
        throw Error('Selecione o mês atual ou um mês futuro dentro da vigência.');
      s.end = f.end;
      await save();
    }
  );
}

function render() {
  closeCalendar();
  $('#nav').innerHTML = [
    'Dashboard',
    'Planejamento',
    'Entradas fixas',
    'Metas',
    'Cartão',
    'Despesas',
    'Configurações',
  ]
    .map(
      (n, i) =>
        `<button class="${page === n ? 'active' : ''}" onclick="page='${n}';render()">${['▦', '▤', '↙', '◎', '▱', '≡', '⚙'][i]} &nbsp; ${n}</button>`
    )
    .join('');
  $('#app').innerHTML = {
    Dashboard: dashboard,
    Planejamento: planning,
    'Entradas fixas': salaries,
    Metas: goals,
    Cartão: cards,
    Despesas: templates,
    Configurações: settings,
  }[page]();
}
function dashboard() {
  let ms = [];
  for (let m = rangeStart; m <= rangeEnd && ms.length < 120; m = shift(m, 1)) ms.push(m);
  let st = ms.map(stats),
    total = (k) => st.reduce((a, s) => a + s[k], 0),
    cats = {};
  ms.flatMap(entries)
    .filter((x) => x.kind !== 'income')
    .forEach((x) => (cats[x.category] = (cats[x.category] || 0) + x.value));
  let max = Math.max(1, ...st.flatMap((x) => [x.income, x.out]));
  return (
    header(
      'Dashboard',
      'Indicadores consolidados de receitas, despesas e metas por competência.',
      '<span class="pill">● Você está offline e seguro</span>'
    ) +
    `<div class="row card period-filter"><label for="start">De</label>${dateControl('', 'start', 'month', rangeStart)}<label for="end">até</label>${dateControl('', 'end', 'month', rangeEnd)}<button class="primary" onclick="calculate()">Calcular</button></div><div class="grid">${metric('Entradas previstas', total('income'), 'Recebidas: ' + money(total('realIncome')), 'positive')}${metric('Saídas previstas', total('out'), 'Pagas: ' + money(total('paid')), 'negative')}${metric('Destinado a metas', total('goals'), 'Aportes incluídos nas saídas')}${metric('Saldo previsto', total('balance'), 'Resultado consolidado do período', total('balance') < 0 ? 'negative' : 'positive')}</div><div class="columns dashboard-columns"><div class="card chart-card"><h3>Entradas e saídas por mês</h3><div class="chart-legend"><span><i class="legend-in"></i>Entradas</span><span><i class="legend-out"></i>Saídas, incluindo aportes</span></div><div class="chart-scroll"><div class="finance-chart" style="min-width:${Math.max(300, ms.length * 68)}px">${st.map((s, i) => `<div class="chart-column"><div class="bar-pair"><div class="chart-bar incoming" style="height:${Math.round((s.income / max) * 190)}px" tabindex="0" data-tooltip="${esc(dashboardBarLabel('Entrada', ms[i], s.income))}" aria-label="Entradas ${fmtMonth(ms[i])}: ${money(s.income)}"></div><div class="chart-bar outgoing" style="height:${Math.round((s.out / max) * 190)}px" tabindex="0" data-tooltip="${esc(dashboardBarLabel('Saída', ms[i], s.out))}" aria-label="Saídas ${fmtMonth(ms[i])}: ${money(s.out)}"></div></div><small>${fmtMonth(ms[i])}</small></div>`).join('')}</div></div><small class="muted">Valores previstos no período selecionado. Passe sobre as barras para consultar os valores.</small></div><div class="card"><h3>Despesas por categoria</h3>${
      Object.entries(cats)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([k, v]) =>
            `<div class="row"><span>${esc(k)}</span><b class="spacer" style="text-align:right">${money(v)}</b></div><div class="bar"><i style="width:${(v / Math.max(1, total('out'))) * 100}%"></i></div>`
        )
        .join('') || blank('Nenhum lançamento no período selecionado.')
    }</div></div><h2 class="section">Acompanhamento de metas</h2><div class="cycles">${S.goals.map(goalCard).join('') || blank('Nenhuma meta cadastrada.')}</div>`
  );
}
function calculate() {
  let a = parseDate($('#start').value, 'month'),
    b = parseDate($('#end').value, 'month');
  if (
    !a ||
    !b ||
    a > b ||
    (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5) - +a.slice(5)) >= 120
  )
    return notify('Selecione um período válido de até 120 meses.');
  rangeStart = a;
  rangeEnd = b;
  render();
}
function isCardExpense(x) {
  return (
    x.kind === 'expense' && (!!x.bill || x.category === 'Cartão' || /cartão/i.test(x.name || ''))
  );
}
function planning() {
  let s = stats(month),
    a = entries(month),
    cs = S.cycles.filter((c) => c.date.startsWith(month)),
    dates = [...new Set([...cs.map((c) => c.date), ...a.map((x) => x.date)])].sort();
  return (
    header(
      'Planejamento',
      'Previsão mensal e acompanhamento financeiro por ciclo de recebimento.',
      `<button aria-label="Limpar despesas do mês" onclick="startExpenseDelete()">🗑 Limpar despesas</button><button onclick="copyMonth()">⧉ Copiar mês anterior</button><button class="primary" onclick="cycleForm()">+ Ciclo</button>`
    ) +
    monthNav(month, 'planning') +
    `<div class="months section">${[-2, -1, 0, 1, 2]
      .map((n) => {
        let m = shift(month, n),
          t = stats(m);
        return `<button class="month ${n === 0 ? 'selected' : ''}" onclick="month='${m}';render()"><strong>${mn(m)}</strong><small>Entradas ${money(t.income)}</small><small>Saídas ${money(t.out)}</small><b class="${t.balance < 0 ? 'negative' : 'positive'}">${money(t.balance)}</b><progress max="${t.count || 1}" value="${t.checked}"></progress><small>${t.checked} de ${t.count} contas pagas</small></button>`;
      })
      .join(
        ''
      )}</div><div class="grid">${metric('Entradas', s.income, 'Previstas para a competência', 'positive')}${metric('Saídas totais', s.out, 'Despesas e aportes do período', 'negative')}${metric('Saldo previsto', s.balance, 'Entradas menos saídas', s.balance < 0 ? 'negative' : 'positive')}${metric('Em aberto', s.open, 'Já pago: ' + money(s.paid))}</div><div class="cycles planning-cycles">${
      dates
        .map((d) => {
          let es = a.filter((x) => x.date === d),
            income = es.filter((x) => x.kind === 'income'),
            goals = es.filter((x) => x.kind === 'goal'),
            expenses = es
              .filter((x) => x.kind === 'expense')
              .sort(
                (a, b) =>
                  Number(!!b.bill) - Number(!!a.bill) ||
                  Number(isCardExpense(b)) - Number(isCardExpense(a))
              ),
            balance = sum(income) - sum(goals) - sum(expenses);
          return `<div class="card" data-cycle-date="${d}"><div class="row"><h3 class="spacer">${fmtDate(d)}</h3><button class="icon" title="Editar ciclo" onclick="cycleForm('${d}')">✎</button><button class="icon" title="Excluir ciclo" onclick="deleteCycle('${d}')">×</button></div><div class="row cycle-balance"><span class="spacer">Saldo do ciclo</span><b class="${balance < 0 ? 'negative' : 'positive'}">${money(balance)}</b></div><section class="cycle-section cycle-income"><h4>Entradas</h4>${income.map(item).join('') || '<p>Nenhuma entrada prevista.</p>'}</section><section class="cycle-section cycle-goals"><h4>Metas</h4>${goals.map(item).join('') || '<p>Nenhum aporte previsto.</p>'}</section><section class="cycle-section cycle-expenses"><div class="row"><h4 class="spacer">Saídas</h4><button class="icon" title="Limpar despesas deste ciclo" aria-label="Limpar despesas deste ciclo" onclick="startExpenseDelete('${d}')">🗑</button></div>${expenses.map(item).join('') || '<p>Nenhuma despesa prevista.</p>'}</section><div class="row section cycle-actions"><button onclick="entryForm('income','${d}')">+ Entrada esporádica</button><button onclick="expenseSearch('${d}')">+ Despesa</button></div>${cycleBankSummary(es)}</div>`;
        })
        .join('') ||
      blank('Cadastre uma entrada fixa ou adicione um ciclo para iniciar o planejamento.')
    }</div>`
  );
}
function item(x) {
  let sub = x.contribution
      ? x.paid && x.planned !== x.value
        ? 'Planejado ' + money(x.planned)
        : ''
      : x.kind === 'income'
        ? x.recurring || x.salaryKey
          ? 'Entrada fixa · Mensal'
          : 'Entrada esporádica'
        : [x.recurring || x.expenseSeriesKey ? 'Recorrente · Mensal' : '']
            .filter(Boolean)
            .join(' · '),
    card = isCardExpense(x);
  return `<div class="item ${card ? 'card-expense-item' : ''}" data-entry-id="${x.id}"><input class="check" type="checkbox" ${x.paid ? 'checked' : ''} aria-label="${x.kind === 'income' ? 'Confirmar recebimento' : 'Marcar pagamento'} de ${esc(x.name)}" onchange="toggle('${x.id}')"><span class="name ${x.paid ? 'done' : ''}"><span class="entry-title">${esc(x.name)}${x.kind === 'expense' && x.category ? `<small class="inline-category">${esc(x.category)}</small>` : ''}${card ? '<svg class="card-marker" role="img" aria-label="Cartão de crédito" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h4"/></svg>' : ''}</span>${sub ? `<small>${esc(sub)}</small>` : ''}${x.kind !== 'income' && bankText(x) ? `<small class="entry-bank">${esc(bankText(x))}</small>` : ''}</span><b>${money(x.value)}</b><button class="icon" title="Editar" onclick="editItem('${x.id}')">✎</button>${!x.bill && !x.contribution ? `<button class="icon" title="${x.recurring ? 'Excluir somente neste mês' : 'Excluir'}" onclick="removePlanningEntry('${x.id}')">×</button>` : ''}</div>`;
}

async function toggle(id) {
  let x = entries(month).find((x) => x.id === id) || S.entries.find((x) => x.id === id);
  if (x?.bill) {
    let c = S.cards.find((c) => c.id === x.bill);
    c.paid = c.paid || [];
    c.paid = x.paid ? c.paid.filter((m) => m !== x.month) : [...c.paid, x.month];
  } else if (x?.contribution) {
    let c = S.contributions.find((c) => c.id === x.contribution);
    setContributionPaid(c, !c.paid);
  } else if (x) {
    if (x.kind === 'expense' && (x.virtual || x.expenseSeriesKey)) x = materializeExpense(x);
    else if (x.kind === 'expense' && (x.virtual || x.expenseSeriesKey)) x = materializeExpense(x);
    else if (x.kind === 'expense' && (x.virtual || x.expenseSeriesKey)) x = materializeExpense(x);
    else if (x.kind === 'expense' && (x.virtual || x.expenseSeriesKey)) x = materializeExpense(x);
    else if (x.kind === 'expense' && (x.virtual || x.expenseSeriesKey)) x = materializeExpense(x);
    else if (x.virtual || (x.kind === 'income' && (x.recurring || x.salaryKey)))
      x = materializeIncome(x);
    x.paid = !x.paid;
  }
  await save();
}
function setContributionPaid(c, paid) {
  c.paid = paid;
  if (paid) {
    c.actual = c.value;
    c.realizedDate = today();
  } else delete c.realizedDate;
}
async function goalCheck(key, id, g) {
  let x = S[key].find((x) => x.id === id);
  if (key === 'contributions') setContributionPaid(x, !x.paid);
  else {
    if (!x.paid && !x.date) return withdrawalForm(id, g, true);
    x.paid = !x.paid;
    if (x.paid) x.realizedDate = today();
    else delete x.realizedDate;
  }
  await save();
}
function cycleForm(old) {
  let fixed = old && entries(old.slice(0, 7)).some((x) => x.date === old && x.recurring);
  if (fixed)
    return notify(
      'Altere o dia no cadastro de Entradas fixas ou edite somente o recebimento pelo lápis.'
    );
  modal(
    old ? 'Editar data do ciclo' : 'Nova data de recebimento',
    field('Data', 'date', old || month + '-05', 'date', 'required'),
    async (f) => {
      if (old) {
        let linked = entries(old.slice(0, 7)).filter(
          (x) => x.date === old && (x.bill || x.contribution)
        );
        if (linked.length)
          throw Error('Edite as datas de aportes e faturas nas respectivas áreas.');
        S.cycles.filter((x) => x.date === old).forEach((x) => (x.date = f.date));
        S.entries.filter((x) => x.date === old).forEach((x) => (x.date = f.date));
      } else if (!S.cycles.some((c) => c.date === f.date))
        S.cycles.push({ id: uid(), date: f.date });
      month = f.date.slice(0, 7);
      await save();
    }
  );
}
async function deleteCycle(d) {
  let es = entries(d.slice(0, 7)).filter((x) => x.date === d);
  if (es.some((x) => x.bill || x.contribution || x.recurring))
    return notify(
      'Este ciclo contém fatura, aporte ou entrada fixa. Edite os registros individuais para preservar os vínculos.'
    );
  if (confirm('Excluir a data e todos os seus lançamentos?')) {
    S.cycles = S.cycles.filter((x) => x.date !== d);
    S.entries = S.entries.filter((x) => x.date !== d);
    await save();
  }
}

// Goal flows are independent from the general expense plan.
function effectiveDate(x) {
  return x.realizedDate || x.date || '';
}
function goalPosition(g, asOf = today()) {
  let cs = S.contributions.filter((c) => c.goal === g.id),
    ws = S.withdrawals.filter((w) => w.goal === g.id),
    received = roundMoney(
      sum(
        cs
          .filter((c) => c.paid && effectiveDate(c) && effectiveDate(c) <= asOf)
          .map((c) => ({ value: c.actual }))
      )
    ),
    spent = roundMoney(
      sum(ws.filter((w) => w.paid && effectiveDate(w) && effectiveDate(w) <= asOf))
    ),
    committed = roundMoney(sum(ws.filter((w) => !w.paid))),
    available = roundMoney(received - spent);
  return {
    received,
    spent,
    available,
    committed,
    after: roundMoney(available - committed),
    plannedExpenses: roundMoney(sum(ws)),
    budgetRemaining: roundMoney(g.target - sum(ws)),
    percent: (received / g.target) * 100,
  };
}
function goalLedger(g, asOf) {
  let rows = [
    ...S.contributions
      .filter((c) => c.goal === g.id && c.paid)
      .map((c) => ({
        id: c.id,
        date: effectiveDate(c),
        name: c.name || 'Aporte',
        income: c.actual,
        out: 0,
      })),
    ...S.withdrawals
      .filter((w) => w.goal === g.id && w.paid)
      .map((w) => ({ id: w.id, date: effectiveDate(w), name: w.name, income: 0, out: w.value })),
  ]
    .filter((x) => x.date && x.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let balance = 0;
  return rows.map((x) => ({ ...x, balance: (balance = roundMoney(balance + x.income - x.out)) }));
}
function goalCard(g) {
  let t = goalPosition(g),
    cs = S.contributions.filter((c) => c.goal === g.id);
  return `<div class="card"><div class="row"><h3 class="spacer">${esc(g.name)}</h3><button class="icon" title="Editar meta" onclick="goalForm('${g.id}')">✎</button></div><strong style="font-size:26px">${t.percent.toFixed(1)}%</strong><p>${money(t.received)} de ${money(g.target)}</p><progress max="100" value="${Math.min(100, t.percent)}"></progress><small class="muted">${cs.filter((c) => c.paid).length} de ${cs.length} aportes confirmados</small><p>Saldo atual <b>${money(t.available)}</b></p><button onclick="goalDetail('${g.id}')">Acompanhar meta →</button></div>`;
}
function goals() {
  let g = S.goals.find((g) => g.id === selectedGoalId) || S.goals[0];
  if (g) selectedGoalId = g.id;
  return (
    header(
      'Metas',
      'Gestão de aportes, despesas e saldo individual de cada objetivo.',
      `<button class="primary" onclick="goalForm()">+ Nova meta</button>`
    ) +
    (g
      ? `<div class="goal-switch">${S.goals.map((x) => `<button class="${x.id === g.id ? 'active' : ''}" onclick="selectedGoalId='${x.id}';render()">${esc(x.name)} <small>${money(goalPosition(x).available)}</small></button>`).join('')}</div>` +
        goalWorkspace(g)
      : blank('Cadastre uma meta para acompanhar os aportes e as saídas.'))
  );
}
function goalDetail(id) {
  selectedGoalId = id;
  page = 'Metas';
  render();
}
function goalWorkspace(g) {
  let tab = goalTab[g.id] || 'dashboard';
  return `<div id="detail" class="section"><div class="top"><div><h2>${esc(g.name)}</h2><span class="muted">Objetivo ${money(g.target)} · ${fmtMonth(g.start)} a ${fmtMonth(g.end)}</span></div><div class="row"><button onclick="goalForm('${g.id}')">✎ Editar meta</button><button class="icon" title="Excluir meta" onclick="deleteGoal('${g.id}')">×</button></div></div><div class="tabs" role="tablist">${[
    ['dashboard', 'Dashboard'],
    ['contributions', 'Entradas'],
    ['withdrawals', 'Saídas'],
  ]
    .map(
      ([key, label]) =>
        `<button role="tab" aria-selected="${tab === key}" class="${tab === key ? 'active' : ''}" onclick="goalTab['${g.id}']='${key}';render()">${label}</button>`
    )
    .join(
      ''
    )}</div>${tab === 'dashboard' ? goalDashboard(g) : tab === 'contributions' ? goalIncomeView(g) : goalExpenseView(g)}</div>`;
}
function goalDashboard(g) {
  let t = goalPosition(g, goalAsOf),
    rows = goalLedger(g, goalAsOf),
    cs = S.contributions.filter((c) => c.goal === g.id);
  return `<div class="row section"><label for="goal-asof">Posição em</label>${dateControl('', 'goal-asof', 'day', goalAsOf, 'goalAsOf', true)}<span class="muted">Movimentações realizadas até a data selecionada.</span></div><div class="grid">${metric('Saldo disponível', t.available, 'Entradas realizadas menos saídas realizadas', goalBalanceColor(t.available))}${metric('Aportes em aberto', goalIncomeTotals(g).open, 'Entradas ainda não confirmadas', 'graphite')}${metric('Total gasto', t.spent, 'Saídas realizadas até ' + fmtDate(goalAsOf), 'negative')}${metric('Saídas em aberto', t.committed, 'Saídas cadastradas ainda não realizadas', 'graphite')}</div><div class="columns"><div class="card"><div class="row"><h3 class="spacer">Progresso da meta</h3><b>${t.percent.toFixed(1)}%</b></div><progress max="100" value="${Math.min(100, t.percent)}"></progress><p>${money(t.received)} recebidos de ${money(g.target)}</p><small class="muted">${cs.filter((c) => c.paid && effectiveDate(c) <= goalAsOf).length} de ${cs.length} aportes confirmados até a data.</small></div><div class="card"><h3>Orçamento da meta</h3><div class="item"><span class="name">Saídas planejadas</span><b class="graphite">${money(t.plannedExpenses)}</b></div><div class="item"><span class="name">Margem sobre o objetivo</span><b class="${t.budgetRemaining < 0 ? 'negative' : 'positive'}">${money(t.budgetRemaining)}</b></div><div class="item"><span class="name">Saldo atual após compromissos</span><b class="${goalBalanceColor(t.after)}">${money(t.after)}</b></div><p>O orçamento das saídas é o valor da meta. Essas despesas usam os recursos reservados e ficam restritas a este objetivo.</p></div></div><div class="card section"><h3>Extrato e evolução do saldo</h3><p>Entradas e saídas confirmadas, em ordem de realização.</p>${rows.length ? `<div class="table-scroll"><table class="ledger"><thead><tr><th>Data</th><th>Descrição</th><th>Entrada</th><th>Saída</th><th>Saldo</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${fmtDate(x.date)}</td><td>${esc(x.name)}</td><td class="positive">${x.income ? money(x.income) : '—'}</td><td class="negative">${x.out ? money(x.out) : '—'}</td><td class="${goalBalanceColor(x.balance)}">${money(x.balance)}</td></tr>`).join('')}</tbody></table></div>` : blank('Nenhuma movimentação realizada até esta data.')}</div>`;
}
function goalIncomeView(g) {
  let cs = S.contributions
      .filter((c) => c.goal === g.id)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    months = [...new Set(cs.map((c) => c.date.slice(0, 7)))],
    confirmed = cs.filter((c) => c.paid),
    received = sum(confirmed.map((c) => ({ value: c.actual }))),
    monthNames = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ];
  return `<div class="top section"><div><h3 style="margin-bottom:5px">Visão geral dos aportes</h3><span class="muted">${cs.length} aportes em ${months.length} meses · Cronograma completo da meta</span></div><button class="primary" onclick="contributionForm(null,'${g.id}')">+ Entrada</button></div><div class="grid">${metric('Total previsto', goalIncomeTotals(g).forecast, 'Confirmados + em aberto · Planejado original: ' + money(goalIncomeTotals(g).original), 'graphite')}${metric('Total em aberto', goalIncomeTotals(g).open, 'Aportes ainda não confirmados', 'graphite')}${metric('Total confirmado', goalIncomeTotals(g).confirmed, confirmed.length + ' de ' + cs.length + ' aportes realizados', 'positive')}${metric('Saldo atual da meta', goalPosition(g).available, 'Posição em ' + fmtDate(today()), goalBalanceColor(goalPosition(g).available))}</div><div class="card goal-contributions"><div class="table-scroll">${
    cs.length
      ? `<table class="ledger contribution-table"><thead><tr><th>Confirmar</th><th>Data prevista</th><th>Aporte</th><th>Planejado</th><th>Realizado</th><th>Data realizada</th><th>Ações</th></tr></thead>${months
          .map((m) => {
            let rows = cs.filter((c) => c.date.startsWith(m)),
              done = rows.filter((c) => c.paid),
              label = monthNames[+m.slice(5) - 1] + '/' + m.slice(0, 4);
            return `<tbody data-contribution-month="${m}"><tr class="contribution-month"><th colspan="7" scope="rowgroup"><div class="row"><strong>${label}</strong><span class="spacer"></span><span>${done.length}/${rows.length} confirmados</span><span>Planejado ${money(sum(rows))}</span><span class="positive">Realizado ${money(sum(done.map((c) => ({ value: c.actual }))))}</span></div></th></tr>${rows.map((c, i) => `<tr data-contribution-id="${c.id}"><td><input aria-label="Confirmar aporte de ${fmtDate(c.date)}" class="check" type="checkbox" ${c.paid ? 'checked' : ''} onchange="goalCheck('contributions','${c.id}','${g.id}')"></td><td>${fmtDate(c.date)}</td><td><span class="${c.paid ? 'done' : ''}">${esc(c.name || 'Aporte ' + (i + 1))}</span>${bankText(c) ? `<small class="entry-bank">${esc(bankText(c))}</small>` : ''}<small class="contribution-status">${c.paid ? 'Confirmado' : 'Em aberto'}</small></td><td>${money(c.value)}</td><td class="${c.paid ? 'positive' : 'muted'}">${c.paid ? money(c.actual) : '—'}</td><td>${c.paid ? fmtDate(effectiveDate(c)) : '—'}</td><td><button class="icon" title="Editar aporte" aria-label="Editar aporte de ${fmtDate(c.date)}" onclick="contributionForm('${c.id}')">✎</button><button class="icon" title="Excluir aporte" aria-label="Excluir aporte de ${fmtDate(c.date)}" onclick="remove('contributions','${c.id}')">×</button></td></tr>`).join('')}</tbody>`;
          })
          .join('')}</table>`
      : blank('Nenhum aporte cadastrado para esta meta.')
  }</div></div>`;
}
function goalExpenseItem(w, g) {
  return `<div class="item"><input aria-label="Confirmar saída ${esc(w.name)}" type="checkbox" class="check" ${w.paid ? 'checked' : ''} onchange="goalCheck('withdrawals','${w.id}','${g.id}')"><span class="name ${w.paid ? 'done' : ''}">${esc(w.name)}<small>${w.paid ? 'Realizada em ' + fmtDate(effectiveDate(w)) : 'Planejada'}</small></span><b>${money(w.value)}</b><button class="icon" title="Editar saída" onclick="withdrawalForm('${w.id}')">✎</button><button class="icon" title="Excluir saída" onclick="remove('withdrawals','${w.id}')">×</button></div>`;
}
function goalExpenseView(g) {
  let all = S.withdrawals
      .filter((w) => w.goal === g.id)
      .sort(
        (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.id.localeCompare(b.id)
      ),
    months = [...new Set(all.filter((w) => w.date).map((w) => w.date.slice(0, 7)))],
    undated = all.filter((w) => !w.date),
    groups = [...months, ...(undated.length ? ['undated'] : [])],
    position = goalPosition(g),
    monthNames = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ];
  return `<div class="top section"><div><h3 style="margin-bottom:5px">Visão geral das saídas</h3><span class="muted">${all.length} saídas · Orçamento completo da meta, organizado por mês</span></div><button class="primary" onclick="withdrawalForm(null,'${g.id}')">+ Saída</button></div><div class="grid">${metric('Saídas planejadas', sum(all), 'Todas as saídas cadastradas', 'graphite')}${metric('Total em aberto', sum(all.filter((w) => !w.paid)), 'Saídas ainda não confirmadas', 'graphite')}${metric('Total confirmado', sum(all.filter((w) => w.paid)), 'Saídas confirmadas', 'negative')}${metric('Saldo atual da meta', position.available, 'Posição em ' + fmtDate(today()), goalBalanceColor(position.available))}</div><div class="card goal-contributions"><div class="table-scroll">${
    all.length
      ? `<table class="ledger contribution-table"><thead><tr><th>Confirmar</th><th>Data prevista</th><th>Descrição</th><th>Planejado</th><th>Realizado</th><th>Data realizada</th><th>Ações</th></tr></thead>${groups
          .map((m) => {
            let rows =
                m === 'undated' ? undated : all.filter((w) => w.date && w.date.startsWith(m)),
              done = rows.filter((w) => w.paid),
              label =
                m === 'undated'
                  ? 'Saídas com data a definir'
                  : monthNames[+m.slice(5) - 1] + '/' + m.slice(0, 4);
            return `<tbody data-withdrawal-month="${m}"><tr class="contribution-month"><th colspan="7" scope="rowgroup"><div class="row"><strong>${label}</strong><span class="spacer"></span><span>${done.length}/${rows.length} confirmadas</span><span>Planejado ${money(sum(rows))}</span><span class="negative">Realizado ${money(sum(done))}</span></div></th></tr>${rows.map((w) => `<tr data-withdrawal-id="${w.id}"><td><input aria-label="Confirmar saída ${esc(w.name)}" class="check" type="checkbox" ${w.paid ? 'checked' : ''} onchange="goalCheck('withdrawals','${w.id}','${g.id}')"></td><td>${w.date ? fmtDate(w.date) : 'A definir'}</td><td><span class="${w.paid ? 'done' : ''}">${esc(w.name)}</span>${bankText(w) ? `<small class="entry-bank">${esc(bankText(w))}</small>` : ''}<small class="contribution-status">${w.paid ? 'Confirmada' : 'Em aberto'}</small></td><td>${money(w.value)}</td><td class="${w.paid ? 'negative' : 'muted'}">${w.paid ? money(w.value) : '—'}</td><td>${w.paid ? fmtDate(effectiveDate(w)) : '—'}</td><td><button class="icon" title="Editar saída" aria-label="Editar saída ${esc(w.name)}" onclick="withdrawalForm('${w.id}')">✎</button><button class="icon" title="Excluir saída" aria-label="Excluir saída ${esc(w.name)}" onclick="remove('withdrawals','${w.id}')">×</button></td></tr>`).join('')}</tbody>`;
          })
          .join('')}</table>`
      : blank('Nenhuma saída cadastrada para esta meta.')
  }</div></div><div class="notice">Compromissos em aberto: <b>${money(sum(all.filter((w) => !w.paid)))}</b> · Margem sobre o objetivo: <b>${money(position.budgetRemaining)}</b>. As saídas desta área não alteram o planejamento geral.</div>`;
}
function contributionForm(id, goal) {
  let x = S.contributions.find((c) => c.id === id) || {
    goal,
    date: goalMonth + '-05',
    value: '',
    actual: 0,
    paid: false,
  };
  modal(
    'Entrada da meta',
    field('Data prevista', 'date', x.date, 'date', 'required') +
      amount('Valor planejado', 'value', x.value) +
      bankField(id ? (x.bankId ?? '') : newGoalBank(x.goal)) +
      field(
        'Valor realizado',
        'actual',
        x.paid ? x.actual : x.value,
        'number',
        'min="0" step="0.01"'
      ) +
      `<label><input name="paid" type="checkbox" ${x.paid ? 'checked' : ''}> Realizado</label>` +
      field('Data da realização', 'realizedDate', x.paid ? effectiveDate(x) : today(), 'date') +
      `<label><input name="recalc" type="checkbox"> Recalcular aportes futuros</label>`,
    async (f) => {
      if (f.paid && !f.realizedDate) throw Error('Informe a data da realização.');
      let c = { ...x, ...f, id: id || uid(), value: +f.value, actual: +f.actual, paid: !!f.paid };
      if (!c.paid) delete c.realizedDate;
      if (id) S.contributions = S.contributions.map((v) => (v.id === id ? c : v));
      else S.contributions.push(c);
      if (f.recalc) redistribute(S.goals.find((g) => g.id === c.goal));
      await save();
    }
  );
}
function withdrawalForm(id, goal, markPaid = false, date) {
  let x = S.withdrawals.find((w) => w.id === id) || {
    goal,
    date: date || goalMonth + '-05',
    paid: false,
  };
  modal(
    'Saída da meta',
    field('Descrição', 'name', x.name || '', 'text', 'required') +
      amount('Valor', 'value', x.value || '') +
      bankField(id ? (x.bankId ?? '') : newGoalBank(x.goal)) +
      field('Data prevista', 'date', x.date || '', 'date', 'required') +
      `<label><input name="paid" type="checkbox" ${x.paid || markPaid ? 'checked' : ''}> Realizada</label>` +
      field('Data da realização', 'realizedDate', x.paid ? effectiveDate(x) : today(), 'date') +
      '<p>O valor será descontado do saldo da meta ao confirmar a realização. O planejamento geral não é afetado.</p>',
    async (f) => {
      if (f.paid && !f.realizedDate) throw Error('Informe a data da realização.');
      let w = { ...x, ...f, value: +f.value, paid: !!f.paid, id: id || uid() };
      if (!w.paid) delete w.realizedDate;
      if (id) S.withdrawals = S.withdrawals.map((v) => (v.id === id ? w : v));
      else S.withdrawals.push(w);
      await save();
    }
  );
}

const CARD_THEMES = {
  black: { label: 'Preto · Black', colors: ['#111318', '#454b57'], ink: '#ffffff' },
  orange: { label: 'Laranja · Inter / Itaú', colors: ['#9c320b', '#ed7928'], ink: '#ffffff' },
  purple: { label: 'Roxo · Nubank', colors: ['#410f78', '#9539d4'], ink: '#ffffff' },
  red: { label: 'Vermelho · Santander', colors: ['#8e1026', '#db344a'], ink: '#ffffff' },
  wine: { label: 'Vinho · Bradesco', colors: ['#8d1036', '#b72075'], ink: '#ffffff' },
  yellow: { label: 'Amarelo · Mercado Livre / BB', colors: ['#e9b925', '#fff28b'], ink: '#20314a' },
  blue: { label: 'Azul', colors: ['#153569', '#287ac1'], ink: '#ffffff' },
  green: { label: 'Verde', colors: ['#12513a', '#2c9471'], ink: '#ffffff' },
  teal: { label: 'Petróleo · Horizon', colors: ['#173d54', '#087e80'], ink: '#ffffff' },
};
function themeKey(c) {
  if (CARD_THEMES[c.theme]) return c.theme;
  let n = (c.name || '').toLowerCase();
  return n.includes('nubank')
    ? 'purple'
    : n.includes('inter') || n.includes('itaú')
      ? 'orange'
      : n.includes('ml') || n.includes('mercado')
        ? 'yellow'
        : 'teal';
}
function cardLook(c) {
  let preset = CARD_THEMES[themeKey(c)],
    colors =
      Array.isArray(c.colors) &&
      c.colors.length === 2 &&
      c.colors.every((x) => /^#[0-9a-f]{6}$/i.test(x))
        ? c.colors
        : preset.colors;
  return {
    background: `linear-gradient(130deg,${colors[0]},${colors[1]})`,
    ink: c.ink === '#20314a' ? '#20314a' : preset.ink,
    colors,
  };
}
function invoiceInfo(c, m) {
  let ps = S.purchases.filter((p) => p.card === c.id && billMonth(p, c) === m),
    budget = c.invoiceBudgets?.[m],
    used = roundMoney(sum(ps)),
    date =
      budget?.date ||
      (c.planningDay || c.due
        ? dateDay(m, c.planningDay || c.due)
        : ps
            .map((p) => p.planningDate)
            .filter((d) => d && d.startsWith(m))
            .sort()[0] || null);
  return { ps, budget, used, value: used > 0 ? (budget ? budget.value : used) : 0, date };
}
function bills(m) {
  return S.cards
    .map((c) => {
      let info = invoiceInfo(c, m);
      return {
        id: 'bill-' + c.id + '-' + m,
        name: (info.budget ? 'Orçamento cartão · ' : 'Fatura ') + c.name,
        value: info.value,
        date: info.date,
        category: 'Cartão',
        bankId: c.bankByDate?.[info.date] ?? c.bankId ?? '',
        kind: 'expense',
        paid: !!(c.paid || []).includes(m),
        bill: c.id,
        month: m,
      };
    })
    .filter((x) => x.value > 0 && x.date);
}
function cards() {
  return (
    header(
      'Cartões',
      'A fatura acompanha o mês selecionado. O limite considera todas as compras em aberto.',
      `<button class="primary" onclick="cardForm()">+ Novo cartão</button>`
    ) +
    monthNav(month, 'card') +
    `<div class="cycles section card-gallery">${
      S.cards
        .map((c) => {
          let info = invoiceInfo(c, month),
            look = cardLook(c),
            credit = cardCredit(c, month);
          return `<div class="card" data-card-id="${c.id}"><div class="credit card themed-credit" style="background:${look.background};color:${look.ink}"><div class="row"><h3 class="spacer">${esc(c.name)}</h3><button class="icon" title="Editar cartão e cor" style="color:inherit" onclick="cardForm('${c.id}')">✎</button></div><small>FATURA · ${fmtMonth(month)}</small><h2>${money(info.used)}</h2><p style="color:inherit;opacity:.9">Limite ${money(c.limit)} · Disponível <b data-credit="available">${money(credit.available)}</b></p><p style="color:inherit;opacity:.9">Limite usado em aberto <b data-credit="committed">${money(credit.committed)}</b></p><progress aria-label="Crédito comprometido" max="${Math.max(1, c.limit)}" value="${Math.min(credit.committed, Math.max(1, c.limit))}" style="accent-color:${look.ink}"></progress>${credit.exceeded ? `<p style="color:inherit;font-weight:700">Limite excedido em ${money(credit.exceeded)}</p>` : ''}${credit.undated ? '<p style="color:inherit">Há compras sem competência; ajuste as datas para registrar o pagamento.</p>' : ''}<small class="card-dates">${c.close && c.due ? 'Fechamento: dia ' + c.close + ' · Vencimento: dia ' + c.due : c.planningDay ? 'Ciclo do planejamento: dia ' + c.planningDay : 'Defina o fechamento e o vencimento pelo lápis.'}</small></div>${cardCreditDetails(c, month, credit)}${info.budget ? `<div class="notice">${c.migratedML ? 'Valor previsto' : 'Orçamento mensal'}: <b>${money(info.budget.value)}</b> · ${fmtDate(info.budget.date)}<div style="margin-top:8px"><button onclick="invoiceBudgetForm('${c.id}','${month}')">✎ Editar orçamento</button></div></div>` : ''}${info.ps.length ? `<div class="row section"><button data-card-payment="${c.id}" onclick="toggleCardPayment('${c.id}','${month}')">${(c.paid || []).includes(month) ? 'Reabrir fatura paga' : 'Marcar fatura como paga'}</button><small class="muted">${(c.paid || []).includes(month) ? 'Pagamento confirmado' : 'Fatura em aberto'}</small></div>` : ''}<div class="row section card-toolbar"><button class="primary" onclick="purchaseForm(null,'${c.id}')">+ Compra</button><button onclick="copyCardMonth('${c.id}')">⧉ Copiar mês anterior</button><button class="icon" title="Excluir cartão" onclick="deleteCard('${c.id}')">×</button></div>${info.ps.map((p) => `<div class="item"><span class="name">${esc(p.name)}<small>${esc(purchaseCaption(p))}</small></span><b>${money(p.value)}</b><button class="icon" title="Editar compra" onclick="purchaseForm('${p.id}')">✎</button><button class="icon" title="Excluir compra" onclick="removePurchase('${p.id}')">×</button></div>`).join('') || blank('Nenhuma compra nesta competência.<br>Este cartão não aparece nas saídas do planejamento.')}</div>`;
        })
        .join('') || blank('Cadastre um cartão para acompanhar as faturas mensais.')
    }</div>`
  );
}
function cardForm(id) {
  let c = S.cards.find((c) => c.id === id) || {},
    look = cardLook(c);
  modal(
    'Cartão de crédito',
    field('Nome', 'name', c.name || '', 'text', 'required') +
      amount('Limite', 'limit', c.limit || '') +
      bankField(id ? (c.bankId ?? '') : undefined, 'Banco de pagamento da fatura') +
      '<label for="card-theme">Cor do cartão · gradiente</label><select id="card-theme" name="theme" onchange="applyCardTheme()">' +
      Object.entries(CARD_THEMES)
        .map(
          ([k, p]) =>
            `<option value="${k}" ${themeKey(c) === k ? 'selected' : ''}>${p.label}</option>`
        )
        .join('') +
      '</select>' +
      `<div class="gradient-colors"><label>Cor inicial<input id="color-from" type="color" name="colorFrom" value="${look.colors[0]}" oninput="previewCardGradient()"></label><label>Cor final<input id="color-to" type="color" name="colorTo" value="${look.colors[1]}" oninput="previewCardGradient()"></label></div><div id="card-gradient-preview" class="gradient-preview" style="background:${look.background};color:${look.ink}">Horizon <small>Prévia do gradiente</small></div>` +
      field('Dia do fechamento (opcional)', 'close', c.close || '', 'number', 'min="1" max="31"') +
      field('Dia do vencimento (opcional)', 'due', c.due || '', 'number', 'min="1" max="31"') +
      field(
        'Dia do ciclo no planejamento (se diferente / sem vencimento)',
        'planningDay',
        c.planningDay || '',
        'number',
        'min="1" max="31"'
      ) +
      '<p>Sem fechamento e vencimento, selecione a competência e a data de pagamento ao lançar uma compra. Faturas sem lançamentos não aparecem no planejamento.</p>',
    async (f) => {
      if (!!f.close !== !!f.due)
        throw Error('Informe fechamento e vencimento juntos ou deixe ambos em branco.');
      if (
        !CARD_THEMES[f.theme] ||
        ![f.colorFrom, f.colorTo].every((x) => /^#[0-9a-f]{6}$/i.test(x))
      )
        throw Error('Selecione cores válidas.');
      let x = {
        ...c,
        id: id || uid(),
        name: f.name,
        bankId: f.bankId || '',
        limit: +f.limit,
        close: f.close ? +f.close : null,
        due: f.due ? +f.due : null,
        planningDay: f.planningDay ? +f.planningDay : null,
        theme: f.theme,
        colors: [f.colorFrom, f.colorTo],
        ink: CARD_THEMES[f.theme].ink,
      };
      if (id) S.cards = S.cards.map((c) => (c.id === id ? x : c));
      else S.cards.push(x);
      await save();
    }
  );
}
function applyCardTheme() {
  let p = CARD_THEMES[$('#card-theme').value];
  $('#color-from').value = p.colors[0];
  $('#color-to').value = p.colors[1];
  previewCardGradient();
}
function previewCardGradient() {
  let p = CARD_THEMES[$('#card-theme').value];
  $('#card-gradient-preview').style.background =
    `linear-gradient(130deg,${$('#color-from').value},${$('#color-to').value})`;
  $('#card-gradient-preview').style.color = p.ink;
}
// BEGIN installment feature
function installmentAmounts(total, count) {
  const cents = Math.round(Number(total) * 100);
  if (!Number.isInteger(count) || count < 1 || count > 120)
    throw Error('Informe de 1 a 120 parcelas.');
  if (!Number.isSafeInteger(cents) || cents < count)
    throw Error('O valor deve permitir ao menos R$ 0,01 por parcela.');
  return Array.from(
    { length: count },
    (_, i) => (Math.floor(cents / count) + (i < cents % count ? 1 : 0)) / 100
  );
}
function installmentRows(base, card, count) {
  const values = installmentAmounts(base.value, count),
    first = billMonth(base, card);
  if (!first || !parseDate(first, 'month'))
    throw Error('Defina a competência da primeira parcela.');
  const firstDate = base.planningDate || invoiceInfo(card, first).date;
  if (!firstDate) throw Error('Informe a data da primeira parcela no planejamento.');
  if (firstDate.slice(0, 7) !== first || !parseDate(firstDate, 'day'))
    throw Error('Confira a data da primeira parcela no planejamento.');
  const group = uid();
  return values.map((value, i) => {
    const m = shift(first, i);
    return {
      ...base,
      id: uid(),
      value,
      invoiceMonth: m,
      planningDate:
        card.invoiceBudgets?.[m]?.date ||
        dateDay(m, card.planningDay || card.due || +firstDate.slice(8)),
      recurring: false,
      installmentGroupId: group,
      installmentNumber: i + 1,
      installmentCount: count,
      installmentTotal: Number(base.value),
      installmentFirstMonth: first,
    };
  });
}
function purchaseCaption(p) {
  return (
    (p.date ? fmtDate(p.date) : 'Competência ' + fmtMonth(p.invoiceMonth || month)) +
    (p.installmentCount > 1
      ? ' · Parcela ' + p.installmentNumber + '/' + p.installmentCount
      : p.recurring
        ? ' · Recorrente'
        : '')
  );
}
function updateInstallmentPreview() {
  const split = document.querySelector('#payment-mode')?.value === 'installments';
  const area = document.querySelector('#installment-fields'),
    count = document.querySelector('#field-installmentCount'),
    recurring = document.querySelector('#form [name=recurring]');
  if (!area) return;
  area.hidden = !split;
  count.disabled = !split;
  count.required = split;
  document.querySelector('label[for="field-value"]').textContent = split
    ? 'Valor total da compra (já com juros, se houver)'
    : 'Valor';
  if (recurring) {
    recurring.disabled = split;
    if (split) recurring.checked = false;
  }
  const preview = document.querySelector('#installment-preview');
  try {
    const n = Number(count.value),
      values = installmentAmounts(document.querySelector('#field-value').value, n);
    preview.textContent =
      n +
      ' parcelas · ' +
      (values.every((v) => v === values[0])
        ? money(values[0]) + ' por mês'
        : money(values[0]) +
          ' a ' +
          money(values[values.length - 1]) +
          ' por mês (ajuste de centavos)') +
      ' · Total ' +
      money(values.reduce((a, b) => a + b, 0));
  } catch (e) {
    preview.textContent = 'Informe o valor total e a quantidade para visualizar as parcelas.';
  }
}
function purchaseForm(id, card) {
  const p = S.purchases.find((p) => p.id === id) || { card, date: today() },
    c = S.cards.find((c) => c.id === p.card),
    isPart = Number(p.installmentCount) > 1;
  if (!c) return notify('Cartão não encontrado.');
  const invoiceMonth = id ? billMonth(p, c) || month : month;
  const payment = !id
    ? '<label for="payment-mode">Forma de pagamento</label><select id="payment-mode" name="paymentMode" onchange="updateInstallmentPreview()"><option value="single">À vista / uma parcela</option><option value="installments">Parcelada</option></select>'
    : '';
  const installmentFields = !id
    ? '<div id="installment-fields" hidden>' +
      field(
        'Quantidade de parcelas',
        'installmentCount',
        2,
        'number',
        'min="2" max="120" step="1" disabled'
      ) +
      '<p id="installment-preview" class="notice" aria-live="polite"></p></div>'
    : '';
  modal(
    isPart
      ? 'Editar parcela ' + p.installmentNumber + '/' + p.installmentCount
      : 'Lançamento no cartão',
    field('Descrição', 'name', p.name || '', 'text', 'required') +
      payment +
      amount(isPart ? 'Valor desta parcela' : 'Valor', 'value', p.value || '') +
      installmentFields +
      field('Data da compra (opcional)', 'date', p.date || '', 'date') +
      field(
        isPart ? 'Competência desta parcela' : 'Competência da fatura / primeira parcela',
        'invoiceMonth',
        invoiceMonth,
        'month',
        'required'
      ) +
      field(
        'Data no planejamento',
        'planningDate',
        p.planningDate || (!c.due && !c.planningDay ? invoiceInfo(c, invoiceMonth).date || '' : ''),
        'date',
        !c.due && !c.planningDay ? 'required' : ''
      ) +
      (!isPart
        ? `<label><input name="recurring" type="checkbox" ${p.recurring ? 'checked' : ''}> Identificar como recorrente</label>`
        : '<p class="notice">A edição altera somente esta parcela. As demais parcelas da compra são preservadas.</p>') +
      '<p>A compra entra na competência indicada acima. A data da compra não muda o mês da fatura. Se parcelar, a primeira parcela entra nesse mês e as demais nos meses seguintes.</p>' +
      (c.invoiceBudgets
        ? '<p>Nos meses com orçamento de cartão, o orçamento continua independente do detalhe das compras. Ajuste o orçamento se precisar alterar o valor previsto no planejamento.</p>'
        : ''),
    async (f) => {
      const count = !id && f.paymentMode === 'installments' ? Number(f.installmentCount) : 1;
      if (
        !id &&
        f.paymentMode === 'installments' &&
        (!Number.isInteger(count) || count < 2 || count > 120)
      )
        throw Error('Informe de 2 a 120 parcelas.');
      const x = {
        ...p,
        id: id || uid(),
        name: f.name,
        date: f.date || '',
        value: Number(f.value),
        recurring: !isPart && count === 1 && !!f.recurring,
      };
      if (!f.invoiceMonth) throw Error('Informe a competência da fatura.');
      x.invoiceMonth = f.invoiceMonth;
      x.planningDate = f.planningDate || '';
      installmentAmounts(x.value, 1);
      const m = billMonth(x, c);
      if (!m) throw Error('Defina a competência ou as datas do cartão.');
      if (x.planningDate && (x.planningDate.slice(0, 7) !== m || !parseDate(x.planningDate, 'day')))
        throw Error('A data no planejamento deve pertencer à competência da fatura.');
      if (!c.due && !c.planningDay && !c.invoiceBudgets?.[m]?.date && !x.planningDate)
        throw Error('Informe a data no planejamento.');
      const rows = count > 1 ? installmentRows(x, c, count) : [x],
        changed = new Set(rows.map((r) => billMonth(r, c)));
      if (id) {
        changed.add(billMonth(p, c));
        S.purchases = S.purchases.map((p) => (p.id === id ? x : p));
      } else S.purchases.push(...rows);
      c.paid = (c.paid || []).filter((v) => !changed.has(v));
      await save();
      notify(
        count > 1
          ? count + ' parcelas adicionadas a partir de ' + fmtMonth(m)
          : 'Compra salva · Fatura ' + fmtMonth(m)
      );
    }
  );
  if (!id) {
    document.querySelector('#field-value').addEventListener('input', updateInstallmentPreview);
    document
      .querySelector('#field-installmentCount')
      .addEventListener('input', updateInstallmentPreview);
    updateInstallmentPreview();
  }
}
function cardCopyCandidates(c, m) {
  let prev = shift(m, -1);
  return S.purchases.filter(
    (p) =>
      p.card === c.id &&
      !p.installmentGroupId &&
      !(p.installmentCount > 1) &&
      billMonth(p, c) === prev &&
      !S.purchases.some((q) => q.card === c.id && q.copiedFrom === p.id && billMonth(q, c) === m)
  );
}
function removePurchase(id) {
  const p = S.purchases.find((x) => x.id === id);
  if (!p) return;
  const c = S.cards.find((c) => c.id === p.card);
  modal(
    'Excluir lançamento',
    `<p>${esc(p.name)}${p.installmentCount > 1 ? ' · Parcela ' + p.installmentNumber + '/' + p.installmentCount : ''} · ${money(p.value)}</p>` +
      (p.installmentGroupId
        ? '<label for="delete-scope">O que deseja excluir?</label><select id="delete-scope" name="scope"><option value="one">Somente esta parcela</option><option value="remaining">Esta e as próximas parcelas em aberto</option></select><p>Ao excluir as próximas parcelas, faturas já pagas são preservadas.</p>'
        : '<p>Confirme a exclusão deste lançamento.</p>'),
    async (f) => {
      const selected = S.purchases.filter((x) =>
        f.scope === 'remaining' && p.installmentGroupId
          ? x.installmentGroupId === p.installmentGroupId &&
            x.installmentNumber >= p.installmentNumber &&
            !(c.paid || []).includes(billMonth(x, c))
          : x.id === id
      );
      if (!selected.length) throw Error('Não há parcelas em aberto para excluir.');
      const ids = new Set(selected.map((x) => x.id)),
        months = new Set(selected.map((x) => billMonth(x, c)));
      S.purchases = S.purchases.filter((x) => !ids.has(x.id));
      c.paid = (c.paid || []).filter((m) => !months.has(m));
      await save();
      notify(selected.length + ' lançamento(s) excluído(s).');
    },
    'Excluir'
  );
}
// END installment feature

function copyCardMonth(id) {
  let c = S.cards.find((c) => c.id === id),
    target = month,
    ps = cardCopyCandidates(c, target);
  modal(
    'Copiar compras · ' + esc(c.name),
    `<p>De ${fmtMonth(shift(target, -1))} para ${fmtMonth(target)}. Selecione os lançamentos desejados; o pagamento da fatura não será copiado.</p>` +
      (ps.length
        ? `<button type="button" onclick="document.querySelectorAll('#form .copy-purchase').forEach(x=>x.checked=true)">Selecionar todos</button>` +
          ps
            .map(
              (p) =>
                `<label class="copy-purchase-row"><input class="copy-purchase" type="checkbox" name="copy_${p.id}"> <span>${esc(p.name)}</span><b>${money(p.value)}</b></label>`
            )
            .join('') +
          (!c.due && !c.planningDay && !c.invoiceBudgets?.[target]?.date
            ? field(
                'Data da fatura no planejamento',
                'planningDate',
                target + '-10',
                'date',
                'required'
              )
            : '')
        : blank('Não há compras disponíveis no mês anterior ou elas já foram copiadas.')),
    async (f) => {
      let selected = ps.filter((p) => f['copy_' + p.id]);
      if (!selected.length) throw Error('Selecione ao menos um lançamento.');
      if (f.planningDate && f.planningDate.slice(0, 7) !== target)
        throw Error('Selecione uma data dentro da competência de destino.');
      for (let p of selected) {
        if (!cardCopyCandidates(c, target).some((x) => x.id === p.id)) continue;
        S.purchases.push({
          id: uid(),
          card: id,
          name: p.name,
          value: p.value,
          recurring: !!p.recurring,
          date: p.date ? dateDay(target, +p.date.slice(8)) : '',
          invoiceMonth: target,
          planningDate:
            c.invoiceBudgets?.[target]?.date ||
            (c.planningDay || c.due ? dateDay(target, c.planningDay || c.due) : f.planningDate),
          copiedFrom: p.id,
        });
      }
      c.paid = (c.paid || []).filter((m) => m !== target);
      await save();
      notify('Compras copiadas para ' + fmtMonth(target));
    },
    'Adicionar ao mês'
  );
}

window.addEventListener('unhandledrejection', (e) => {
  notify('Erro: ' + e.reason.message);
  console.error(e.reason);
});
loadState()
  .then(render)
  .catch((e) => {
    document.querySelector('main').textContent =
      'Não foi possível abrir os dados locais: ' +
      e.message +
      ' Abra no navegador habitual com o armazenamento habilitado.';
  });

function dashboardBarLabel(kind, m, value) {
  const names = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  return kind + '\n' + names[Number(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4) + '\n' + money(value);
}
const dashboardTip = document.createElement('div');
dashboardTip.className = 'dashboard-tooltip';
dashboardTip.id = 'dashboard-bar-tooltip';
dashboardTip.setAttribute('role', 'tooltip');
dashboardTip.hidden = true;
document.body.appendChild(dashboardTip);
function positionDashboardTip(x, y) {
  const box = dashboardTip.getBoundingClientRect();
  dashboardTip.style.left = Math.max(8, Math.min(x + 14, window.innerWidth - box.width - 8)) + 'px';
  dashboardTip.style.top =
    Math.max(8, Math.min(y + 14, window.innerHeight - box.height - 8)) + 'px';
}
function showDashboardTip(bar, x, y) {
  dashboardTip.textContent = bar.dataset.tooltip;
  const swatch = document.createElement('span');
  swatch.className =
    'dashboard-tooltip-swatch' + (bar.classList.contains('outgoing') ? ' outgoing' : '');
  swatch.setAttribute('aria-hidden', 'true');
  dashboardTip.prepend(swatch);
  dashboardTip.hidden = false;
  bar.setAttribute('aria-describedby', dashboardTip.id);
  positionDashboardTip(x, y);
}
function hideDashboardTip() {
  dashboardTip.hidden = true;
  document
    .querySelectorAll('.chart-bar[aria-describedby]')
    .forEach((b) => b.removeAttribute('aria-describedby'));
}
document.addEventListener('pointerover', (e) => {
  const bar = e.target.closest('.chart-bar[data-tooltip]');
  if (bar) showDashboardTip(bar, e.clientX, e.clientY);
});
document.addEventListener('pointermove', (e) => {
  if (!dashboardTip.hidden && e.target.closest('.chart-bar[data-tooltip]'))
    positionDashboardTip(e.clientX, e.clientY);
});
document.addEventListener('pointerout', (e) => {
  if (e.target.closest('.chart-bar[data-tooltip]')) hideDashboardTip();
});
document.addEventListener('focusin', (e) => {
  const bar = e.target.closest('.chart-bar[data-tooltip]');
  if (bar) {
    const r = bar.getBoundingClientRect();
    showDashboardTip(bar, r.left + r.width / 2, r.top);
  }
});
document.addEventListener('focusout', (e) => {
  if (e.target.closest('.chart-bar[data-tooltip]')) hideDashboardTip();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideDashboardTip();
});
window.addEventListener('resize', hideDashboardTip);
document.addEventListener('scroll', hideDashboardTip, true);

// BEGIN card credit feature
function cardCredit(c, m) {
  const paid = new Set(c.paid || []),
    pending = S.purchases.filter((p) => p.card === c.id && !paid.has(billMonth(p, c)));
  const committed = roundMoney(sum(pending)),
    limit = Number(c.limit) || 0;
  const byMonth = new Map();
  let undated = 0,
    withoutMonth = 0;
  for (const p of pending) {
    const key = billMonth(p, c);
    if (!/^\d{4}-\d{2}$/.test(key) || parseDate(key, 'month') !== key) {
      undated++;
      withoutMonth += Number(p.value || 0);
    } else byMonth.set(key, (byMonth.get(key) || 0) + Number(p.value || 0));
  }
  const openMonths = [...byMonth.keys()].sort();
  const subtotal = (filter) =>
    roundMoney(openMonths.filter(filter).reduce((total, key) => total + byMonth.get(key), 0));
  return {
    committed,
    available: Math.max(0, roundMoney(limit - committed)),
    exceeded: Math.max(0, roundMoney(committed - limit)),
    undated,
    withoutMonth: roundMoney(withoutMonth),
    previous: subtotal((key) => key < m),
    current: subtotal((key) => key === m),
    future: subtotal((key) => key > m),
    openMonths,
  };
}
function cardCreditDetails(c, m, credit) {
  const others = credit.openMonths.filter((key) => key !== m);
  return `<div class="credit-breakdown"><strong>Composição do limite usado</strong><dl><dt>Meses anteriores em aberto</dt><dd data-credit="previous">${money(credit.previous)}</dd><dt>Mês selecionado em aberto</dt><dd data-credit="current">${money(credit.current)}</dd><dt>Meses seguintes em aberto</dt><dd data-credit="future">${money(credit.future)}</dd>${credit.undated ? `<dt>Compras sem competência</dt><dd>${money(credit.withoutMonth)}</dd>` : ''}</dl>${others.length ? `<details><summary>Ver outras faturas em aberto</summary><div class="credit-months">${others.map((key) => `<button type="button" onclick="openCardMonth('${esc(key)}')">${fmtMonth(key)}</button>`).join('')}</div></details>` : ''}</div>`;
}
function openCardMonth(m) {
  if (parseDate(m, 'month') !== m) return;
  month = m;
  render();
}
async function toggleCardPayment(id, m) {
  const c = S.cards.find((c) => c.id === id);
  if (!c || !invoiceInfo(c, m).ps.length) return;
  const button = m === month ? document.querySelector('[data-card-payment="' + id + '"]') : null;
  if (button?.disabled) return;
  if (button) {
    button.disabled = true;
    button.textContent = 'Salvando…';
  }
  const paid = !(c.paid || []).includes(m);
  c.paid = paid ? [...(c.paid || []), m] : c.paid.filter((x) => x !== m);
  try {
    await save();
    const updated = cardCredit(
      S.cards.find((c) => c.id === id),
      m
    );
    notify(
      (paid ? 'Fatura paga.' : 'Fatura reaberta.') +
        ' Limite disponível: ' +
        money(updated.available)
    );
  } catch (e) {
    notify('Não foi possível atualizar a fatura. ' + e.message);
  } finally {
    if (button) button.disabled = false;
  }
}
// END card credit feature

// BEGIN salary links feature
function incomeEntryLink(e) {
  if (e.kind !== 'income' || !e.date) return null;
  const m = e.date.slice(0, 7),
    norm = (s) =>
      String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
  const legacy =
    (e.source?.sheet === 'Mensal' && ['entrada', 'salario'].includes(norm(e.name))) ||
    norm(e.name) === 'salario';
  let candidates = [];
  for (const schedule of S.incomeSchedules || []) {
    for (const part of schedule.parts || []) {
      const key = `salary:${schedule.seriesId || schedule.id}:${part.id}:${m}`;
      const explicit =
        e.salaryKey === key ||
        (e.scheduleId === schedule.id &&
          +e.date.slice(8) ===
            Math.min(+part.day, new Date(+m.slice(0, 4), +m.slice(5), 0).getDate()));
      const active = m >= schedule.start && (!schedule.end || m <= schedule.end);
      if (
        explicit ||
        ((legacy || e.recurring || norm(e.name) === norm(schedule.name)) &&
          (active || (legacy && m < schedule.start)) &&
          e.date === dateDay(m, part.day) &&
          roundMoney(e.value) === roundMoney(part.value))
      )
        candidates.push({ schedule, part, key, active, explicit });
    }
  }
  if (!candidates.length) return null;
  if (candidates.some((x) => x.explicit)) candidates = candidates.filter((x) => x.explicit);
  else if (candidates.some((x) => x.active)) candidates = candidates.filter((x) => x.active);
  else {
    const start = candidates.map((x) => x.schedule.start).sort()[0];
    candidates = candidates.filter((x) => x.schedule.start === start);
  }
  const unique = [...new Map(candidates.map((x) => [x.key, x])).values()];
  if (unique.length !== 1) return null;
  return unique[0];
}
function planningIncome(e) {
  const link = incomeEntryLink(e);
  if (!link) return e.salaryKey ? { ...e, recurring: true } : e;
  const generic = /^(entrada|sal[aá]rio)$/i.test(String(e.name || '').trim());
  return {
    ...e,
    name: generic ? link.schedule.name : e.name,
    recurring: true,
    salaryKey: e.salaryKey || link.key,
    scheduleId: e.scheduleId || link.schedule.id,
  };
}
function salaryEntries(m) {
  let generated = [];
  const linked = new Set(
    S.entries.map((e) => e.salaryKey || incomeEntryLink(e)?.key).filter(Boolean)
  );
  for (const schedule of S.incomeSchedules || []) {
    if (m < schedule.start || (schedule.end && m > schedule.end)) continue;
    for (const part of schedule.parts) {
      const key = `salary:${schedule.seriesId || schedule.id}:${part.id}:${m}`;
      if (linked.has(key)) continue;
      generated.push({
        id: key,
        salaryKey: key,
        scheduleId: schedule.id,
        name: schedule.name,
        date: dateDay(m, part.day),
        value: part.value,
        kind: 'income',
        paid: false,
        recurring: true,
        virtual: true,
      });
    }
  }
  return generated;
}

function materializeIncome(x) {
  let found = S.entries.find((e) => e.id === x.id);
  if (found) {
    if (x.recurring) {
      found.recurring = true;
      if (x.salaryKey) found.salaryKey = x.salaryKey;
      if (x.scheduleId) found.scheduleId = x.scheduleId;
      found.name = x.name;
    }
    return found;
  }
  let entry = { ...x };
  delete entry.virtual;
  S.entries.push(entry);
  return entry;
}
// END salary links feature

// BEGIN expense recurrence feature
const expenseNorm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
function expenseSeries() {
  const result = (S.expenseSchedules || []).map((s) => ({ ...s })),
    same = (e, t) =>
      e.kind === 'expense' &&
      (e.templateId === t.id ||
        (expenseNorm(e.name) === expenseNorm(t.name) &&
          expenseNorm(e.category) === expenseNorm(t.category)));
  for (const t of S.templates.filter((t) => t.recurring)) {
    const rows = S.entries.filter((e) => same(e, t)),
      days = new Set(
        t.day ? [Number(t.day)] : rows.map((e) => Number(e.date?.slice(8))).filter(Boolean)
      );
    for (const e of rows.filter(
      (e) => e.templateId === t.id && e.expenseSeriesKey?.startsWith('template:')
    ))
      days.add(Number(e.expenseSeriesKey.split(':').pop()));
    for (const day of days) {
      const start = t.start || rows.map((e) => e.date.slice(0, 7)).sort()[0] || month;
      result.push({
        key: 'template:' + t.id + ':' + day,
        templateId: t.id,
        name: t.name,
        category: t.category,
        bankId: t.bankId,
        value: Number(t.value),
        day,
        start,
        end: t.end || '',
      });
    }
  }
  const groups = new Map();
  for (const e of S.entries) {
    if (e.kind !== 'expense' || !e.recurring || e.templateId || S.templates.some((t) => same(e, t)))
      continue;
    const group = [
      expenseNorm(e.name),
      expenseNorm(e.category),
      +e.date.slice(8),
      e.start || '',
      e.end || '',
    ].join('|');
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(e);
  }
  for (const rows of groups.values()) {
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const e = rows[0];
    if (
      result.some(
        (s) =>
          s.key === e.expenseSeriesKey ||
          (expenseNorm(s.name) === expenseNorm(e.name) &&
            expenseNorm(s.category) === expenseNorm(e.category) &&
            s.day === +e.date.slice(8))
      )
    )
      continue;
    result.push({
      key: e.expenseSeriesKey || 'legacy:' + e.id,
      name: e.name,
      category: e.category,
      bankId: e.bankId,
      value: Number(e.value),
      day: +e.date.slice(8),
      start: e.start || e.date.slice(0, 7),
      end: e.end || '',
    });
  }
  return result;
}
function expenseLink(e, series = expenseSeries()) {
  if (e.kind !== 'expense') return null;
  if (e.expenseSeriesKey) return series.find((s) => s.key === e.expenseSeriesKey) || null;
  const m = e.date.slice(0, 7),
    matches = series.filter(
      (s) =>
        m >= s.start &&
        (!s.end || m <= s.end) &&
        e.date === dateDay(m, s.day) &&
        (e.templateId
          ? s.templateId === e.templateId
          : expenseNorm(e.name) === expenseNorm(s.name) &&
            expenseNorm(e.category) === expenseNorm(s.category))
    );
  return matches.length === 1 ? matches[0] : null;
}
function expenseBlocked(key, m, state = S) {
  const r = state.expenseRecurrenceRules?.[key];
  return !!(r && (r.all || (r.ranges || []).some((p) => m >= p.from && m <= p.to)));
}
function expenseRows(m) {
  const series = expenseSeries(),
    existing = S.entries.filter((e) => e.kind === 'expense'),
    used = new Set(),
    rows = [];
  for (const e of existing) {
    const s = expenseLink(e, series),
      occ = e.expenseMonth || e.date.slice(0, 7);
    if (s) used.add(e.expenseKey || s.key + ':' + occ);
    if (!e.date.startsWith(m) || e.excluded || (s && expenseBlocked(s.key, occ))) continue;
    rows.push(
      s
        ? {
            ...e,
            bankId: e.bankId ?? s.bankId ?? '',
            recurring: true,
            expenseSeriesKey: s.key,
            expenseMonth: occ,
            expenseKey: e.expenseKey || s.key + ':' + occ,
          }
        : e
    );
  }
  for (const s of series) {
    if (
      m < s.start ||
      (s.end && m > s.end) ||
      expenseBlocked(s.key, m) ||
      used.has(s.key + ':' + m)
    )
      continue;
    const d = dateDay(m, s.day);
    if (
      existing.some(
        (e) =>
          e.date === d &&
          expenseNorm(e.name) === expenseNorm(s.name) &&
          expenseNorm(e.category) === expenseNorm(s.category)
      )
    )
      continue;
    rows.push({
      id: 'expense:' + s.key + ':' + m,
      kind: 'expense',
      name: s.name,
      category: s.category,
      bankId: s.bankId || '',
      value: s.value,
      date: d,
      paid: false,
      recurring: true,
      virtual: true,
      templateId: s.templateId,
      expenseSeriesKey: s.key,
      expenseMonth: m,
      expenseKey: s.key + ':' + m,
    });
  }
  return rows;
}
function entries(m) {
  return [
    ...S.entries
      .filter((x) => x.kind !== 'expense' && x.date.startsWith(m) && !x.excluded)
      .map(planningIncome),
    ...expenseRows(m),
    ...salaryEntries(m),
    ...bills(m),
    ...contributions(m),
  ];
}
function materializeExpense(x) {
  let found = S.entries.find((e) => e.id === x.id);
  if (found) {
    Object.assign(found, {
      bankId: x.bankId || '',
      expenseSeriesKey: x.expenseSeriesKey,
      expenseKey: x.expenseKey,
      expenseMonth: x.expenseMonth,
      recurring: true,
    });
    return found;
  }
  const e = { ...x };
  delete e.virtual;
  S.entries.push(e);
  return e;
}
function recurrenceFormFields(x, date) {
  return (
    `<label><input type="checkbox" name="recurring" ${x.recurring ? 'checked' : ''}> Despesa recorrente mensal</label>` +
    field('Primeiro mês da recorrência', 'start', x.start || date.slice(0, 7), 'month') +
    field('Último mês (opcional)', 'end', x.end || '', 'month') +
    '<p>As próximas ocorrências entram automaticamente no mesmo dia do mês, dentro da vigência. Os valores já confirmados permanecem individuais.</p>'
  );
}
function entryForm(kind, date, id, template) {
  const x =
      entries(month).find((e) => e.id === id) ||
      S.entries.find((e) => e.id === id) ||
      template ||
      {},
    series = kind === 'expense' && x.expenseSeriesKey;
  modal(
    id ? 'Editar lançamento' : kind === 'income' ? 'Entrada esporádica' : 'Nova despesa',
    field('Descrição', 'name', x.name || '', 'text', 'required maxlength="120"') +
      amount('Valor', 'value', x.value || '') +
      field('Data', 'date', x.date || date, 'date', 'required') +
      (kind === 'expense'
        ? cat(x.category) + bankField(id ? (x.bankId ?? '') : template?.bankId)
        : '') +
      (kind === 'expense' && !series
        ? recurrenceFormFields(x, x.date || date)
        : series
          ? '<p>Esta alteração afeta somente esta ocorrência. Para alterar a recorrência, use a Biblioteca de despesas.</p>'
          : x.recurring
            ? '<p>Esta alteração afeta somente este recebimento. O cadastro da entrada fixa será mantido.</p>'
            : ''),
    async (f) => {
      if (kind === 'expense' && f.recurring && (!f.start || (f.end && f.end < f.start)))
        throw Error('Confira o início e o fim da recorrência.');
      const v = { ...x, ...f, value: +f.value, kind, paid: !!x.paid, id: id || uid() };
      delete v.virtual;
      if (kind === 'expense') {
        v.recurring = !!series || !!f.recurring;
        if (!series && v.recurring) {
          const day = +f.date.slice(8),
            t = template?.recurring ? template : null;
          let model = t || { id: uid() };
          if (!t) {
            model = {
              ...model,
              name: f.name,
              value: +f.value,
              category: f.category,
              bankId: f.bankId || '',
              recurring: true,
              day,
              start: f.start,
              end: f.end || '',
            };
            S.templates.push(model);
          }
          v.templateId = model.id;
          v.expenseSeriesKey = 'template:' + model.id + ':' + day;
          v.expenseMonth = f.date.slice(0, 7);
          v.expenseKey = v.expenseSeriesKey + ':' + v.expenseMonth;
        }
        if (!v.recurring) {
          delete v.start;
          delete v.end;
          delete v.templateId;
          delete v.expenseSeriesKey;
          delete v.expenseKey;
          delete v.expenseMonth;
        }
      }
      if (id && S.entries.some((e) => e.id === id))
        S.entries = S.entries.map((e) => (e.id === id ? v : e));
      else S.entries.push(v);
      await save();
    }
  );
}
function templateForm(id) {
  const t = S.templates.find((t) => t.id === id) || {};
  modal(
    'Cadastro de despesa',
    field('Nome', 'name', t.name || '', 'text', 'required') +
      cat(t.category) +
      amount('Valor padrão', 'value', t.value || '') +
      bankField(id ? (t.bankId ?? '') : undefined) +
      `<label><input name="recurring" type="checkbox" ${t.recurring ? 'checked' : ''}> Recorrente mensal</label>` +
      field(
        'Dia do mês (para recorrência)',
        'day',
        t.day || 5,
        'number',
        'min="1" max="31" required'
      ) +
      field('Início da recorrência', 'start', t.start || month, 'month') +
      field('Fim da recorrência (opcional)', 'end', t.end || '', 'month') +
      '<p>Ao marcar recorrente, os lançamentos aparecem automaticamente no planejamento durante a vigência.</p>',
    async (f) => {
      if (f.recurring && (!f.start || (f.end && f.end < f.start)))
        throw Error('Confira o período da recorrência.');
      const x = {
        ...t,
        ...f,
        id: id || uid(),
        value: +f.value,
        day: +f.day,
        recurring: !!f.recurring,
      };
      if (id)
        S.templates = S.templates
          .filter((t) => !t.expenseDeleted)
          .map((t) => (t.id === id ? x : t));
      else S.templates.push(x);
      await save();
    }
  );
}
function copyMonth() {
  const prev = S.entries.filter(
    (x) =>
      x.date.startsWith(shift(month, -1)) &&
      x.kind === 'expense' &&
      !x.recurring &&
      !x.excluded &&
      !expenseLink(x)
  );
  modal(
    'Copiar despesas avulsas do mês anterior',
    prev
      .map(
        (x) =>
          `<label><input type="checkbox" name="${x.id}" checked> ${esc(x.name)} · ${money(x.value)}</label>`
      )
      .join('') ||
      blank('Nenhuma despesa avulsa para copiar. Recorrências são geradas automaticamente.'),
    async (f) => {
      prev
        .filter((x) => f[x.id])
        .forEach((x) =>
          S.entries.push({ ...x, id: uid(), date: dateDay(month, +x.date.slice(8)), paid: false })
        );
      await save();
    },
    'Adicionar ao mês'
  );
}
let expenseDeleteDraft = null;
function startExpenseDelete(date = '', id = '', catalogId = '') {
  const m = date ? date.slice(0, 7) : month,
    defs = expenseSeries(),
    rows = entries(m).filter(
      (e) =>
        e.kind === 'expense' &&
        (catalogId
          ? defs.some((s) => s.templateId === catalogId && s.key === e.expenseSeriesKey)
          : id
            ? e.id === id
            : !date || e.date === date)
    ),
    ordinary = rows.filter((e) => !e.bill),
    cards = rows.filter((e) => e.bill);
  if (!rows.length && !catalogId) return notify('Não há despesas para excluir.');
  expenseDeleteDraft = {
    month: m,
    date,
    catalogId,
    revision,
    ordinary: ordinary.map((e) => e.id),
    cards: cards.map((e) => e.bill),
    series: catalogId
      ? defs.filter((s) => s.templateId === catalogId)
      : [
          ...new Map(
            ordinary
              .filter((e) => e.expenseSeriesKey)
              .map((e) => [e.expenseSeriesKey, defs.find((s) => s.key === e.expenseSeriesKey)])
          ).values(),
        ].filter(Boolean),
    decisions: [],
    index: 0,
    includeCards: false,
  };
  modal(
    id
      ? 'Excluir despesa'
      : 'Limpar despesas ' + (date ? 'do ciclo ' + fmtDate(date) : 'de ' + fmtMonth(m)),
    `<p>${id ? 'Deseja excluir esta despesa?' : 'Deseja mesmo apagar as despesas ' + (date ? 'deste ciclo' : 'deste mês') + '?'}</p><p>${ordinary.length} despesas; ${cards.length} faturas. Entradas e aportes das metas não fazem parte desta limpeza.</p>` +
      (cards.length
        ? '<label><input type="checkbox" name="cards"> Excluir também as compras das faturas deste mês</label><p>Ao incluir cartões, as compras desta competência serão removidas e o crédito correspondente será liberado. Parcelas dos outros meses permanecem.</p>'
        : '') +
      (catalogId
        ? '<p>Este cadastro é recorrente. O cadastro sai da biblioteca somente ao excluir todas as suas recorrências; excluir um mês ou período preserva a programação restante.</p>'
        : '') +
      '<p>Você escolherá o alcance de cada recorrência antes da confirmação final. Um backup criptografado será criado ao concluir.</p>',
    async (f) => {
      expenseDeleteDraft.includeCards = !!f.cards;
      nextExpenseDeleteStep();
    },
    'Sim, continuar'
  );
}
function expenseScopeChanged() {
  const period = $('#expense-delete-scope').value === 'period';
  $('#expense-delete-period').hidden = !period;
  document.querySelectorAll('#expense-delete-period input').forEach((i) => {
    i.disabled = !period;
    i.required = period;
  });
}
function nextExpenseDeleteStep() {
  const d = expenseDeleteDraft,
    s = d.series[d.index];
  if (s) {
    modal(
      'Despesa recorrente ' + (d.index + 1) + ' de ' + d.series.length,
      `<h3>${esc(s.name)} · dia ${String(s.day).padStart(2, '0')}</h3><p>Esta é uma despesa recorrente. Qual alcance deseja para a exclusão?</p><label for="expense-delete-scope">Excluir</label><select id="expense-delete-scope" name="scope" onchange="expenseScopeChanged()"><option value="month">Somente ${fmtMonth(d.month)}</option><option value="all">Todas as recorrências, inclusive meses anteriores</option><option value="period">Um período de meses</option><option value="keep">Manter esta recorrência</option></select><div id="expense-delete-period" hidden>` +
        field('De', 'from', d.month, 'month') +
        field('Até', 'to', d.month, 'month') +
        '</div><p>“Todas” também remove ocorrências pagas. A exclusão só será aplicada na confirmação final; cancelar preserva todas as despesas.</p>',
      async (f) => {
        if (f.scope === 'period' && (!f.from || !f.to || f.from > f.to))
          throw Error('Selecione um período válido.');
        d.decisions.push({
          key: s.key,
          name: s.name,
          scope: f.scope,
          from: f.scope === 'period' ? f.from : d.month,
          to: f.scope === 'period' ? f.to : d.month,
        });
        d.index++;
        nextExpenseDeleteStep();
      },
      'Continuar'
    );
    expenseScopeChanged();
    return;
  }
  const oneOff = d.ordinary.filter(
    (id) => !entries(d.month).find((e) => e.id === id)?.expenseSeriesKey
  ).length;
  modal(
    'Revisar exclusão',
    `<p>${oneOff} despesas avulsas serão removidas.</p>` +
      d.decisions
        .map(
          (x) =>
            `<p><b>${esc(x.name)}</b>: ${x.scope === 'keep' ? 'manter' : x.scope === 'all' ? 'excluir todas as recorrências' : x.scope === 'month' ? 'excluir ' + fmtMonth(d.month) : 'excluir de ' + fmtMonth(x.from) + ' a ' + fmtMonth(x.to)}</p>`
        )
        .join('') +
      `<p>${d.includeCards ? d.cards.length + ' faturas terão suas compras removidas.' : 'As compras dos cartões serão preservadas.'}</p><p>Será salvo um backup criptografado antes da exclusão.</p>`,
    async () => {
      await commitExpenseDelete(d);
      expenseDeleteDraft = null;
    },
    'Confirmar exclusão'
  );
}
async function commitExpenseDelete(d) {
  if (revision !== d.revision) throw Error('Os dados mudaram. Cancele e revise a seleção.');
  const next = structuredClone(S),
    series = expenseSeries(),
    selected = new Set(d.ordinary),
    decisions = new Map(d.decisions.map((x) => [x.key, x]));
  next.expenseRecurrenceRules = next.expenseRecurrenceRules || {};
  for (const decision of d.decisions) {
    if (decision.scope === 'keep') continue;
    const seriesDef = series.find((s) => s.key === decision.key);
    if (seriesDef && !seriesDef.templateId) {
      next.expenseSchedules = next.expenseSchedules || [];
      if (!next.expenseSchedules.some((s) => s.key === seriesDef.key))
        next.expenseSchedules.push({ ...seriesDef });
    }
    const rule = next.expenseRecurrenceRules[decision.key] || { ranges: [] };
    if (decision.scope === 'all') rule.all = true;
    else rule.ranges = [...(rule.ranges || []), { from: decision.from, to: decision.to }];
    next.expenseRecurrenceRules[decision.key] = rule;
  }
  next.entries = next.entries.filter((e) => {
    if (e.kind !== 'expense') return true;
    const link = expenseLink(e, series),
      decision = link && decisions.get(link.key);
    if (decision) {
      if (decision.scope === 'keep') return true;
      const m = e.expenseMonth || e.date.slice(0, 7);
      return !(decision.scope === 'all' || (m >= decision.from && m <= decision.to));
    }
    return !selected.has(e.id);
  });
  if (d.includeCards) {
    const cards = new Set(d.cards);
    next.purchases = next.purchases.filter(
      (p) =>
        !cards.has(p.card) ||
        billMonth(
          p,
          S.cards.find((c) => c.id === p.card)
        ) !== d.month
    );
    for (const c of next.cards.filter((c) => cards.has(c.id))) {
      c.paid = (c.paid || []).filter((m) => m !== d.month);
      if (c.invoiceBudgets) delete c.invoiceBudgets[d.month];
    }
  }
  if (d.catalogId && d.decisions.length && d.decisions.every((x) => x.scope === 'all')) {
    const t = next.templates.find((t) => t.id === d.catalogId);
    if (t) {
      t.recurring = false;
      t.expenseDeleted = true;
    }
  }
  const r = await window.horizon.destructiveSave(next, d.revision);
  S = next;
  revision = r.revision;
  render();
  notify('Exclusão concluída. Backup criptografado anterior preservado.');
}
async function removePlanningEntry(id) {
  const e = entries(month).find((e) => e.id === id);
  if (!e) return;
  if (e.kind === 'expense') return startExpenseDelete('', id);
  if (
    !confirm(
      e.recurring
        ? 'Excluir este recebimento somente nesta competência?'
        : 'Excluir este lançamento?'
    )
  )
    return;
  if (e.recurring) materializeIncome(e).excluded = true;
  else S.entries = S.entries.filter((x) => x.id !== id);
  await save();
}
function removeExpenseCatalog(id) {
  const t = S.templates.find((t) => t.id === id);
  if (t?.recurring) {
    if (expenseSeries().some((s) => s.templateId === id)) return startExpenseDelete('', '', id);
    return modal(
      'Excluir cadastro recorrente',
      `<p>Tem certeza que deseja excluir ${esc(t.name)}? Este cadastro não possui dia ou ocorrências vinculadas.</p><p>Será criado um backup criptografado.</p>`,
      async () => {
        const next = structuredClone(S),
          model = next.templates.find((t) => t.id === id);
        model.recurring = false;
        model.expenseDeleted = true;
        const r = await window.horizon.destructiveSave(next, revision);
        S = next;
        revision = r.revision;
        render();
      },
      'Excluir cadastro'
    );
  }
  return remove('templates', id);
}
// END expense recurrence feature

// BEGIN banks and categories feature
const prefCollator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
function activeBanks() {
  return (S.banks || []).filter((b) => !b.archived);
}
function defaultBank() {
  return activeBanks().some((b) => b.id === S.defaultBankId) ? S.defaultBankId : '';
}
function newGoalBank(goalId) {
  const g = S.goals.find((g) => g.id === goalId);
  return g && Object.hasOwn(g, 'bankId') ? g.bankId : defaultBank();
}
function bankName(id) {
  if (!id) return 'Sem banco';
  const b = (S.banks || []).find((b) => b.id === id);
  return b ? b.name + (b.archived ? ' (arquivado)' : '') : 'Banco não cadastrado';
}
function bankField(value, label = 'Banco de pagamento') {
  const selected = value === undefined ? defaultBank() : value || '',
    banks = (S.banks || []).filter((b) => !b.archived || b.id === selected);
  return (
    '<label for="field-bankId">' +
    esc(label) +
    '</label><select id="field-bankId" name="bankId"><option value="">Sem banco</option>' +
    banks
      .map(
        (b) =>
          '<option value="' +
          esc(b.id) +
          '" ' +
          (selected === b.id ? 'selected' : '') +
          '>' +
          esc(b.name) +
          (b.archived ? ' (arquivado)' : '') +
          '</option>'
      )
      .join('') +
    (selected && !banks.some((b) => b.id === selected)
      ? '<option value="' + esc(selected) + '" selected>Banco não cadastrado</option>'
      : '') +
    '</select>' +
    (banks.length
      ? ''
      : '<p class="bank-help">Cadastre bancos e escolha o padrão em Configurações.</p>')
  );
}
function bankText(record) {
  return record.bankId || activeBanks().length ? bankName(record.bankId) : '';
}
function cycleBanks(rows) {
  const groups = new Map();
  for (const x of rows.filter((x) => x.kind === 'expense' || x.kind === 'goal')) {
    const id = x.bankId || '',
      g = groups.get(id) || { bankId: id, total: 0, open: 0 };
    g.total += Math.round(Number(x.value || 0) * 100);
    if (!x.paid) g.open += Math.round(Number(x.value || 0) * 100);
    groups.set(id, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, total: g.total / 100, open: g.open / 100 }))
    .sort((a, b) => prefCollator.compare(bankName(a.bankId), bankName(b.bankId)));
}
function cycleBankSummary(rows) {
  const groups = cycleBanks(rows);
  if (!groups.length) return '';
  return (
    '<div class="cycle-bank-summary" aria-label="Distribuição por banco"><div class="bank-summary-title">Distribuição por banco</div>' +
    groups
      .map(
        (g) =>
          '<div class="cycle-bank-row" data-bank-id="' +
          esc(g.bankId) +
          '"><span>' +
          esc(bankName(g.bankId)) +
          '</span><span>Total <b>' +
          money(g.total) +
          '</b> · Em aberto <b data-bank-open>' +
          money(g.open) +
          '</b></span></div>'
      )
      .join('') +
    '<small>Despesas e aportes deste ciclo. Não consulta saldos bancários.</small></div>'
  );
}
function bankForm(id) {
  const current = (S.banks || []).find((b) => b.id === id) || {};
  modal(
    id ? 'Editar banco' : 'Novo banco',
    field('Nome do banco', 'name', current.name || '', 'text', 'required maxlength="80"') +
      '<label><input name="isDefault" type="checkbox" ' +
      (id ? (S.defaultBankId === id ? 'checked' : '') : !activeBanks().length ? 'checked' : '') +
      '> Usar como padrão nos novos lançamentos</label><p>Organização visual para separar pagamentos. Nenhum acesso à conta bancária é realizado.</p>',
    async (f) => {
      const name = f.name.trim();
      if (!name) throw Error('Informe o nome do banco.');
      if (
        (S.banks || []).some((b) => b.id !== id && prefCollator.compare(b.name.trim(), name) === 0)
      )
        throw Error('Este banco já está cadastrado.');
      const bank = { ...current, id: id || uid(), name, archived: !!current.archived };
      S.banks = S.banks || [];
      if (id) S.banks = S.banks.map((b) => (b.id === id ? bank : b));
      else S.banks.push(bank);
      if (f.isDefault) {
        bank.archived = false;
        S.defaultBankId = bank.id;
      } else if (S.defaultBankId === id)
        S.defaultBankId = activeBanks().find((b) => b.id !== id)?.id || '';
      await save();
    }
  );
}
async function setDefaultBank(id) {
  if (!activeBanks().some((b) => b.id === id)) return;
  S.defaultBankId = id;
  await save();
}
async function archiveBank(id) {
  const b = (S.banks || []).find((b) => b.id === id);
  if (!b) return;
  if (
    !confirm(
      (b.archived ? 'Reativar' : 'Arquivar') +
        ' o banco ' +
        b.name +
        '? Os vínculos dos lançamentos são preservados.'
    )
  )
    return;
  b.archived = !b.archived;
  if (b.archived && S.defaultBankId === id) S.defaultBankId = activeBanks()[0]?.id || '';
  await save();
}
function orderedCategories() {
  const list = [...S.categories];
  if (S.categorySortMode === 'manual') return list;
  return list.sort((a, b) => prefCollator.compare(a, b) * (S.categorySortMode === 'desc' ? -1 : 1));
}
function compareCategoryKeys(a, b) {
  const order = orderedCategories(),
    ra = order.indexOf(a),
    rb = order.indexOf(b);
  return (ra < 0 ? order.length : ra) - (rb < 0 ? order.length : rb) || prefCollator.compare(a, b);
}
function cat(value) {
  const options = orderedCategories();
  if (value && !options.includes(value)) options.push(value);
  return (
    '<label>Categoria</label><select name="category">' +
    options
      .map((c) => '<option ' + (c === value ? 'selected' : '') + '>' + esc(c) + '</option>')
      .join('') +
    '</select>'
  );
}
async function sortCategories() {
  S.categorySortMode =
    S.categorySortMode === 'desc' || S.categorySortMode === 'manual' ? 'asc' : 'desc';
  S.categories = orderedCategories();
  await save();
}
async function moveCategory(from, to, after = false) {
  const list = orderedCategories();
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  )
    return;
  let target = to + (after ? 1 : 0);
  const [name] = list.splice(from, 1);
  if (from < target) target--;
  list.splice(target, 0, name);
  S.categories = list;
  S.categorySortMode = 'manual';
  await save();
  return list.indexOf(name);
}
async function moveCategoryBy(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= S.categories.length) return;
  const moved = await moveCategory(index, next, delta > 0);
  document.querySelector('[data-category-index="' + moved + '"] .category-grip')?.focus();
}
let categoryDragIndex = null;
function categoryDragStart(e, index) {
  categoryDragIndex = index;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('application/x-horizon-category', String(index));
  e.currentTarget.closest('.category-row').classList.add('is-dragging');
}
function categoryDragOver(e) {
  if (categoryDragIndex === null) return;
  e.preventDefault();
  const row = e.currentTarget,
    r = row.getBoundingClientRect();
  row.classList.toggle('drop-after', e.clientY > r.top + r.height / 2);
  row.classList.toggle('drop-before', e.clientY <= r.top + r.height / 2);
}
function categoryDragEnd() {
  categoryDragIndex = null;
  document
    .querySelectorAll('.category-row')
    .forEach((r) => r.classList.remove('drop-before', 'drop-after', 'is-dragging'));
}
async function categoryDrop(e, index) {
  e.preventDefault();
  if (categoryDragIndex === null) return;
  const from = categoryDragIndex,
    r = e.currentTarget.getBoundingClientRect(),
    after = e.clientY > r.top + r.height / 2;
  categoryDragEnd();
  try {
    await moveCategory(from, index, after);
  } catch (error) {
    notify(error.message);
  }
}
function categoryGrip() {
  return (
    '<svg viewBox="0 0 16 22" width="16" height="22" fill="currentColor" aria-hidden="true">' +
    [4, 11, 18]
      .map((y) => '<circle cx="5" cy="' + y + '" r="1.4"/><circle cx="11" cy="' + y + '" r="1.4"/>')
      .join('') +
    '</svg>'
  );
}
function categoriesPanel() {
  const mode = S.categorySortMode || 'asc',
    next = mode === 'asc' ? 'Z a A' : 'A a Z';
  return (
    '<div class="card"><div class="row"><h3 class="spacer">Categorias</h3><button data-category-sort title="Ordenar de ' +
    next +
    '" aria-label="Ordenar categorias de ' +
    next +
    '" onclick="sortCategories()">' +
    (mode === 'desc' ? 'Z–A ↑' : 'A–Z ↓') +
    '</button></div><p class="bank-help">' +
    (mode === 'manual' ? 'Ordem personalizada.' : 'Ordem alfabética.') +
    ' Arraste pelas bolinhas para definir a ordem.</p><div class="category-list">' +
    orderedCategories()
      .map(
        (c, i) =>
          '<div class="item category-row" data-category-index="' +
          i +
          '" ondragover="categoryDragOver(event)" ondragleave="if(!this.contains(event.relatedTarget))this.classList.remove(\'drop-before\',\'drop-after\')" ondrop="categoryDrop(event,' +
          i +
          ')"><button type="button" class="icon category-grip" draggable="true" title="Arraste para mover. Também aceita as teclas seta acima e abaixo." aria-label="Mover categoria ' +
          esc(c) +
          '" ondragstart="categoryDragStart(event,' +
          i +
          ')" ondragend="categoryDragEnd()" onkeydown="if(event.key===\'ArrowUp\'||event.key===\'ArrowDown\'){event.preventDefault();moveCategoryBy(' +
          i +
          ",event.key==='ArrowUp'?-1:1)}\">" +
          categoryGrip() +
          '</button><span class="name">' +
          esc(c) +
          '</span><button class="icon" aria-label="Editar categoria ' +
          esc(c) +
          '" onclick="categoryForm(\'' +
          encodeURIComponent(c).replace(/'/g, '%27') +
          '\')">✎</button></div>'
      )
      .join('') +
    '</div><button class="section" onclick="categoryForm()">+ Categoria</button></div>'
  );
}
function banksPanel() {
  return (
    '<div class="card"><div class="row"><h3 class="spacer">Bancos</h3><button onclick="bankForm()">+ Banco</button></div><p class="bank-help">O padrão preenche somente novos lançamentos. Nos registros antigos, selecione o banco pelo lápis ou no cadastro da recorrência.</p>' +
    (activeBanks()
      .map(
        (b) =>
          '<div class="item bank-setting-row"><span class="name">' +
          esc(b.name) +
          (S.defaultBankId === b.id ? '<small>Padrão para novos lançamentos</small>' : '') +
          '</span>' +
          (S.defaultBankId !== b.id
            ? '<button class="icon" aria-label="Definir ' +
              esc(b.name) +
              ' como padrão" onclick="setDefaultBank(\'' +
              b.id +
              '\')">Padrão</button>'
            : '') +
          '<button class="icon" aria-label="Editar banco ' +
          esc(b.name) +
          '" onclick="bankForm(\'' +
          b.id +
          '\')">✎</button><button class="icon" aria-label="Arquivar banco ' +
          esc(b.name) +
          '" onclick="archiveBank(\'' +
          b.id +
          '\')">Arquivar</button></div>'
      )
      .join('') ||
      '<p>Nenhum banco cadastrado.</p><div class="row"><button onclick="bankFormWithName(\'Inter\')">+ Inter</button><button onclick="bankFormWithName(\'Mercado Pago\')">+ Mercado Pago</button></div>') +
    ((S.banks || []).some((b) => b.archived)
      ? '<details class="section"><summary>Bancos arquivados</summary>' +
        (S.banks || [])
          .filter((b) => b.archived)
          .map(
            (b) =>
              '<div class="item"><span class="name">' +
              esc(b.name) +
              '</span><button onclick="archiveBank(\'' +
              b.id +
              '\')">Reativar</button></div>'
          )
          .join('') +
        '</details>'
      : '') +
    '</div>'
  );
}
function bankFormWithName(name) {
  bankForm();
  document.querySelector('#field-name').value = name;
}
function settings() {
  return (
    header('Configurações', 'Bancos, categorias, proteção e backups locais.') +
    '<div class="columns preferences-columns"><div class="card"><h3>Backup criptografado</h3><p>Guarde uma cópia protegida com a senha em uso.</p><button onclick="encryptedBackup()">Criar backup criptografado</button><h3 class="section">Importar dados anteriores</h3><p>A importação substitui os registros após confirmação e preserva um backup.</p><button onclick="importEncryptedData()">Importar uma cópia</button></div><div class="card"><h3>Senha e bloqueio</h3><p>Bloqueio após 5 minutos sem interação e ao bloquear ou suspender o Windows.</p><button onclick="passwordForm()">Alterar senha</button> <button onclick="window.horizon.lock()">Bloquear agora</button></div>' +
    banksPanel() +
    categoriesPanel() +
    '</div>'
  );
}
// END banks and categories feature

function goalBalanceColor(value) {
  return value > 0 ? 'positive' : value < 0 ? 'negative' : 'graphite';
}
function goalIncomeTotals(g) {
  const rows = S.contributions.filter((c) => c.goal === g.id);
  const confirmed = roundMoney(sum(rows.filter((c) => c.paid).map((c) => ({ value: c.actual })))),
    open = roundMoney(sum(rows.filter((c) => !c.paid))),
    original = roundMoney(sum(rows));
  return { confirmed, open, original, forecast: roundMoney(confirmed + open) };
}
