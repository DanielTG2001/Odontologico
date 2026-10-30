import { jwtSecret } from './jwt-secret';

describe('jwtSecret', () => {
  it('exige un secreto largo en producción', () => {
    expect(() => jwtSecret(undefined, 'production')).toThrow('obligatorio');
    expect(() => jwtSecret('corto', 'production')).toThrow('32 caracteres');
    expect(jwtSecret('x'.repeat(32), 'production')).toBe('x'.repeat(32));
  });
  it('en desarrollo genera uno aleatorio y estable durante el proceso', () => {
    const a = jwtSecret(undefined, 'development');
    expect(a).toHaveLength(96);
    expect(jwtSecret(undefined, 'development')).toBe(a);
    expect(jwtSecret('dev', 'development')).toBe('dev');
  });
});
