import { describe, it, expect } from 'vitest';
import ayarlar from '../ayarlar.json';
import { riskKovasiBelirle, riskRengi, KOVA_RENKLERI } from '../renk';
import type { RenkEsikleri } from '../renk';

const esikler: RenkEsikleri = ayarlar.renk_esikleri;

describe('riskKovasiBelirle', () => {
  it('risk dusuk esigin altindaysa "dusuk" kovasini dondurmeli', () => {
    expect(riskKovasiBelirle(0.05, esikler)).toBe('dusuk');
    expect(riskKovasiBelirle(0.10, esikler)).toBe('dusuk'); // esikten kucuk her deger
  });

  it('risk dusuk esige esit veya yuksek esigin altindaysa "orta" kovasini dondurmeli', () => {
    expect(riskKovasiBelirle(esikler.dusuk, esikler)).toBe('orta'); // sinir degeri dusuk icine girmez
    expect(riskKovasiBelirle(0.25, esikler)).toBe('orta');
  });

  it('risk yuksek esige esit veya daha buyukse "yuksek" kovasini dondurmeli', () => {
    expect(riskKovasiBelirle(esikler.yuksek, esikler)).toBe('yuksek'); // sinir degeri yuksek
    expect(riskKovasiBelirle(0.6, esikler)).toBe('yuksek');
    expect(riskKovasiBelirle(0.9, esikler)).toBe('yuksek');
  });
});

describe('KOVA_RENKLERI', () => {
  it('her kova icin sabit OKLCH renk tanimlanmis olmali', () => {
    expect(KOVA_RENKLERI.dusuk).toBe('oklch(0.62 0.12 225)');
    expect(KOVA_RENKLERI.orta).toBe('oklch(0.78 0.15 90)');
    expect(KOVA_RENKLERI.yuksek).toBe('oklch(0.63 0.19 25)');
  });
});

describe('riskRengi', () => {
  it('dusuk kovadaki riskler icin KOVA_RENKLERI.dusuk degerini dondurmeli', () => {
    expect(riskRengi(0.05, esikler)).toBe(KOVA_RENKLERI.dusuk);
    expect(riskRengi(0.10, esikler)).toBe(KOVA_RENKLERI.dusuk);
  });

  it('orta kovadaki riskler icin KOVA_RENKLERI.orta degerini dondurmeli', () => {
    expect(riskRengi(0.25, esikler)).toBe(KOVA_RENKLERI.orta);
    expect(riskRengi(0.30, esikler)).toBe(KOVA_RENKLERI.orta);
  });

  it('yuksek kovadaki riskler icin KOVA_RENKLERI.yuksek degerini dondurmeli', () => {
    expect(riskRengi(0.5, esikler)).toBe(KOVA_RENKLERI.yuksek);
    expect(riskRengi(0.9, esikler)).toBe(KOVA_RENKLERI.yuksek);
  });

  it('ayni kovaya dusen iki farkli risk degerinin renkleri esit olmali (goreceli degil, sabit)', () => {
    const renk1 = riskRengi(0.5, esikler);
    const renk2 = riskRengi(0.9, esikler);
    expect(renk1).toBe(renk2);
    // Her iki deger de yuksek kovaya dusmeli, dolayisiyla KOVA_RENKLERI.yuksek ile eslesmeli
    expect(renk1).toBe(KOVA_RENKLERI.yuksek);
  });
});
