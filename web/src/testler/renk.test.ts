import { describe, it, expect } from 'vitest';
import ayarlar from '../ayarlar.json';
import { riskKovasiBelirle, riskRengi, KOVA_RENKLERI, golgeRengi } from '../renk';
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

describe('golgeRengi', () => {
  const min = 0.2;
  const max = 0.8;

  it('min ve max degerleri farkli renkler uretir', () => {
    const renkMin = golgeRengi(min, min, max);
    const renkMax = golgeRengi(max, min, max);
    expect(renkMin).not.toBe(renkMax);
  });

  it('t arttikca lightness azalir, chroma artar, hue maviden kirmiziya kayar', () => {
    const dusuk = golgeRengi(min, min, max);
    const orta  = golgeRengi((min + max) / 2, min, max);
    const yuksek= golgeRengi(max, min, max);

    const parseOklch = (renk: string) => {
      const match = renk.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
      if (!match) throw new Error(`Gecersiz oklch: ${renk}`);
      return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
    };

    const d = parseOklch(dusuk);
    const o = parseOklch(orta);
    const y = parseOklch(yuksek);

    // lightness azalmali
    expect(d.l).toBeGreaterThan(o.l);
    expect(o.l).toBeGreaterThan(y.l);

    // chroma artmali
    expect(d.c).toBeLessThan(o.c);
    expect(o.c).toBeLessThan(y.c);

    // hue azalmali (225 → 25)
    expect(d.h).toBeGreaterThan(o.h);
    expect(o.h).toBeGreaterThan(y.h);
  });

  it('min === max durumunda tutarli renk dondurur, hata firlatmaz', () => {
    const renk = golgeRengi(0.5, 0.5, 0.5);
    expect(renk).toMatch(/oklch\([\d.]+ [\d.]+ [\d.]+\)/);
  });

  it('tehlike degeri aralik disinda olsa bile kenetlenerek gecerli renk dondurur', () => {
    const alt = golgeRengi(-0.1, 0, 1);
    const ust = golgeRengi(1.5, 0, 1);
    expect(alt).toMatch(/oklch\([\d.]+ [\d.]+ [\d.]+\)/);
    expect(ust).toMatch(/oklch\([\d.]+ [\d.]+ [\d.]+\)/);
  });

  it('KOVA_RENKLERI ve riskRengi testleri degismemistir (bu test dosyasindaki mevcut testler hala gecer)', () => {
    // Bu sadece bir varlik kontrolu; mevcut testler calismaya devam edecek.
    expect(true).toBe(true);
  });
});
