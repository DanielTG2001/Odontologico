describe('Blind cash closing difference (RN-02)', () => {
  function difference(counted: number, system: number) {
    return counted - system;
  }

  it('cuadrado', () => {
    expect(difference(1000, 1000)).toBe(0);
  });

  it('faltante', () => {
    expect(difference(900, 1000)).toBe(-100);
  });

  it('sobrante', () => {
    expect(difference(1050, 1000)).toBe(50);
  });
});
