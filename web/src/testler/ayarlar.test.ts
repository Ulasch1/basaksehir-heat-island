import { describe, it, expect } from 'vitest';
import ayarlar from '../ayarlar.json';

// REQ-F-09: renk_esikleri artik null degil, gercek veriye dayali sabit deger.
describe('ayarlar.json - renk_esikleri (REQ-F-09)', () => {
  it('dusuk ve yuksek esikleri sayisal olarak dolu olmali (null degil)', () => {
    expect(ayarlar.renk_esikleri.dusuk).not.toBeNull();
    expect(ayarlar.renk_esikleri.yuksek).not.toBeNull();
    expect(typeof ayarlar.renk_esikleri.dusuk).toBe('number');
    expect(typeof ayarlar.renk_esikleri.yuksek).toBe('number');
  });

  it('dusuk esik yuksek esikten kucuk olmali (mantikli sira)', () => {
    expect(ayarlar.renk_esikleri.dusuk).toBeLessThan(ayarlar.renk_esikleri.yuksek);
  });

  it('beklenen sabit degerlere esit olmali (0.12 / 0.43)', () => {
    expect(ayarlar.renk_esikleri.dusuk).toBeCloseTo(0.12, 5);
    expect(ayarlar.renk_esikleri.yuksek).toBeCloseTo(0.43, 5);
  });

  it('diger ayar alanlari bu degisiklikten etkilenmemis olmali', () => {
    expect(ayarlar.tehlike_agirliklari).toEqual({ yesil_alan: 0.5, bina_yogunlugu: 0.5 });
    expect(ayarlar.simulasyon_bina_azaltma_katsayisi).toBe(0.5);
    expect(ayarlar.maruziyet_alt_siniri).toBe(0.1);
    expect(ayarlar.kumeleme_kume_sayisi).toBe(3);
    expect(ayarlar.projeksiyon_ufku_yil).toBe(5);
    expect(ayarlar.tipoloji_mudahale_eslemesi).toEqual({});
    expect(ayarlar.yerlesim_zarfi_r_metre).toBe(100);
  });
});
