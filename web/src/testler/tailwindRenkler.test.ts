import { describe, it, expect } from 'vitest';
// @ts-expect-error tailwind.config.js has no type declarations
import tailwindConfig from '../../tailwind.config.js';

// REQ-F-09: harita uzerindeki risk renkleri (dusuk/orta/yuksek) ve accent tonu
// kilitlidir; kurumsal marka/renk guncellemeleri bu degerlere dokunmamali.
describe('tailwind.config.js kilitli semantik renkler', () => {
  const colors = (tailwindConfig as any).theme.extend.colors;

  it('accent tonu degismemis olmali', () => {
    expect(colors.accent).toBe('oklch(0.6 0.14 150)');
  });

  it('risk-dusuk (mavi) tonu degismemis olmali', () => {
    expect(colors['risk-dusuk']).toBe('oklch(0.62 0.12 225)');
  });

  it('risk-orta (sari) tonu degismemis olmali', () => {
    expect(colors['risk-orta']).toBe('oklch(0.78 0.15 90)');
  });

  it('risk-yuksek (kirmizi) tonu degismemis olmali', () => {
    expect(colors['risk-yuksek']).toBe('oklch(0.63 0.19 25)');
  });
});
