import { describe, expect, it } from 'vitest';
import { escapar } from '../src/ui/seguranca';

describe('escapar (texto de pessoas nunca vira código)', () => {
  it('troca os caracteres perigosos', () => {
    expect(escapar('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(escapar(`Tom & Jerry's`)).toBe('Tom &amp; Jerry&#39;s');
  });
  it('não mexe em texto comum', () => {
    expect(escapar('Vovó Ana, 80 anos!')).toBe('Vovó Ana, 80 anos!');
  });
  it('aguenta vazio e números', () => {
    expect(escapar(null)).toBe('');
    expect(escapar(undefined)).toBe('');
    expect(escapar(42)).toBe('42');
  });
});
