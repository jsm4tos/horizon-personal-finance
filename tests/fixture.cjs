// Synthetic records only. Tests must never depend on the user's active database.
const { empty } = require('../src/vault.cjs');
module.exports = () => {
  const s = empty();
  s.categories.push('Cartão');
  s.cards = [
    {
      id: 'test-nubank',
      name: 'Nubank teste',
      limit: 1000,
      theme: 'purple',
      close: null,
      due: null,
      paid: [],
    },
    {
      id: 'test-bank',
      name: 'Cartão teste',
      limit: 500,
      theme: 'orange',
      close: 14,
      due: 20,
      paid: [],
    },
  ];
  s.goals = [
    { id: 'test-goal', name: 'Meta de teste', target: 7200, start: '2026-08', end: '2027-07' },
  ];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(2026, 7 + i, 15)),
      m = d.toISOString().slice(0, 7);
    for (const day of ['05', '10', '25'])
      s.contributions.push({
        id: 'test-aporte-' + i + '-' + day,
        goal: 'test-goal',
        date: m + '-' + day,
        value: 100,
        actual: i === 0 ? 100 : 0,
        paid: i === 0,
      });
  }
  s.entries = [
    {
      id: 'test-income',
      name: 'Receita de teste',
      date: '2026-08-05',
      kind: 'income',
      value: 1000,
      paid: false,
    },
    {
      id: 'test-expense',
      name: 'Despesa de teste',
      date: '2026-08-05',
      kind: 'expense',
      value: 250,
      category: 'Outros',
      paid: false,
    },
  ];
  s.cycles = [{ id: 'test-cycle', date: '2026-08-05' }];
  s.templates = [{ id: 'test-template', name: 'Modelo de despesa', category: 'Outros', value: 50 }];
  s.incomeSchedules = [];
  return s;
};
