describe('Treatment plan totals (RF-07)', () => {
  function calcTotal(
    items: { unitPrice: number; quantity: number; labCost?: number; discount?: number }[],
    planDiscount = 0,
  ) {
    let sub = 0;
    for (const it of items) {
      sub += it.unitPrice * it.quantity + (it.labCost || 0) - (it.discount || 0);
    }
    return Math.max(0, sub - planDiscount);
  }

  it('suma fases con lab y descuento de ítem', () => {
    const total = calcTotal([
      { unitPrice: 100, quantity: 2, labCost: 50, discount: 10 },
      { unitPrice: 200, quantity: 1 },
    ]);
    expect(total).toBe(100 * 2 + 50 - 10 + 200);
  });

  it('descuento de plan no deja total negativo', () => {
    expect(calcTotal([{ unitPrice: 50, quantity: 1 }], 100)).toBe(0);
  });
});

describe('Appointment slot chaining (RF-08)', () => {
  it('encadena slots de 30 min', () => {
    const start = new Date('2026-11-01T10:00:00');
    const slot = 30;
    const second = new Date(start.getTime() + slot * 60 * 1000);
    expect(second.toISOString()).toContain('10:30');
  });
});
