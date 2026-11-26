// Dados inteiramente fictícios para testes e capturas de divulgação.
'use strict';
const { empty } = require('../src/vault.cjs');
module.exports = () => {
  const s = empty();
  s.categories.push('Cartão');
  s.banks = [
    { id: 'demo-a', name: 'Banco Aurora' },
    { id: 'demo-b', name: 'Banco Horizonte' },
  ];
  s.defaultBankId = 'demo-a';
  s.incomeSchedules = [
    {
      id: 'demo-salary',
      name: 'Salário',
      value: 6000,
      start: '2026-01',
      end: '',
      parts: [
        { id: 'part-a', day: 5, value: 3000 },
        { id: 'part-b', day: 20, value: 3000 },
      ],
    },
  ];
  s.cycles = [5, 20].map((day) => ({
    id: 'cycle-' + day,
    date: '2026-11-' + String(day).padStart(2, '0'),
  }));
  s.entries = [
    {
      id: 'income-a',
      kind: 'income',
      name: 'Salário',
      date: '2026-11-05',
      value: 3000,
      paid: true,
    },
    {
      id: 'income-b',
      kind: 'income',
      name: 'Salário',
      date: '2026-11-20',
      value: 3000,
      paid: true,
    },
    ...[
      ['Moradia', 1200, 'Moradia', 5, true],
      ['Internet', 120, 'Outros', 5, true],
      ['Mercado', 650, 'Alimentação', 20, false],
      ['Transporte', 220, 'Transporte', 20, false],
    ].map(([name, value, category, day, paid], i) => ({
      id: 'expense-' + i,
      name,
      value,
      category,
      kind: 'expense',
      date: '2026-11-' + String(day).padStart(2, '0'),
      paid,
      bankId: i % 2 ? 'demo-b' : 'demo-a',
    })),
  ];
  s.goals = [
    {
      id: 'goal-demo',
      name: 'Reserva de emergência',
      target: 9000,
      start: '2026-09',
      end: '2027-08',
      bankId: 'demo-b',
    },
  ];
  s.contributions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8 + i, 5));
    return {
      id: 'contribution-' + i,
      goal: 'goal-demo',
      date: d.toISOString().slice(0, 10),
      value: 750,
      actual: i < 3 ? 750 : 0,
      paid: i < 3,
      bankId: 'demo-b',
    };
  });
  s.withdrawals = [
    {
      id: 'withdrawal-a',
      goal: 'goal-demo',
      name: 'Despesa emergencial ilustrativa',
      date: '2026-11-10',
      value: 180,
      paid: true,
      bankId: 'demo-b',
    },
    {
      id: 'withdrawal-b',
      goal: 'goal-demo',
      name: 'Reserva para manutenção',
      date: '2027-01-10',
      value: 400,
      paid: false,
      bankId: 'demo-b',
    },
  ];
  s.cards = [
    {
      id: 'card-demo-a',
      name: 'Cartão Aurora',
      limit: 2500,
      theme: 'orange',
      close: 15,
      due: 22,
      bankId: 'demo-a',
      paid: [],
    },
    {
      id: 'card-demo-b',
      name: 'Cartão Horizonte',
      limit: 4000,
      theme: 'purple',
      close: 8,
      due: 15,
      bankId: 'demo-b',
      paid: [],
    },
  ];
  s.purchases = [
    {
      id: 'purchase-a',
      card: 'card-demo-a',
      name: 'Assinatura ilustrativa',
      value: 45,
      date: '2026-11-02',
      invoiceMonth: '2026-11',
      planningDate: '2026-11-22',
    },
    ...Array.from({ length: 3 }, (_, i) => ({
      id: 'purchase-part-' + i,
      card: 'card-demo-b',
      name: 'Equipamento de estudo',
      value: 200,
      date: '2026-10-01',
      invoiceMonth: '2026-' + String(10 + i).padStart(2, '0'),
      planningDate: '2026-' + String(10 + i).padStart(2, '0') + '-15',
      installmentCount: 3,
      installmentNumber: i + 1,
      installmentGroupId: 'demo-series',
      installmentTotal: 600,
      installmentFirstMonth: '2026-10',
    })),
  ];
  return s;
};
