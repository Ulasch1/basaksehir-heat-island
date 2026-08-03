import { describe, it, expect } from 'vitest';
import veriRaw from '../../public/veri.json';
import { hesaplaZarfOrani } from '../skorHesapla';

/**
 * Gercek public/veri.json uzerinden hesaplaZarfOrani regresyon testi.
 *
 * Not: skorHesapla.test.ts'teki sentetik "hesaplaZarfOrani" testinde
 * `hesaplaZarfOrani(9.35, 8.9776)` satiri "Samlar benzeri, yuksek zarf orani"
 * olarak yorumlanmis (~0.96). Ancak gercek veride Samlar'in zarf orani
 * ~0.12 (DUSUK) - projedeki en dusuk zarf oranlarindan biri. O sentetik
 * ornekte alan_km2 (9.35) Samlar'in gercek alanina (9.3522) kasitli/kasitsiz
 * yakin secilmis ama zarf_alan_km2 (8.9776) uydurma ve Samlar'in gercek
 * zarf_alan_km2'sinden (1.1281) tamamen farkli - yani yorum satiri yanlis
 * yone isaret ediyor (yuksek/dusuk etiketleri ters). Bu test gercek veriyle
 * doğru yonu sabitler.
 */
describe('hesaplaZarfOrani gercek veriyle', () => {
  const mahalleler = Object.values(veriRaw) as Array<{
    ad: string;
    alan_km2: number;
    zarf_alan_km2: number;
  }>;

  it('gercek veride tum mahalleler icin alan_km2 pozitif (guard tetiklenmez)', () => {
    for (const m of mahalleler) {
      expect(m.alan_km2).toBeGreaterThan(0);
    }
  });

  it('gercek veride tum zarf oranlari [0,1] araliginda kalir', () => {
    for (const m of mahalleler) {
      const oran = hesaplaZarfOrani(m.alan_km2, m.zarf_alan_km2);
      expect(oran).toBeGreaterThanOrEqual(0);
      expect(oran).toBeLessThanOrEqual(1);
    }
  });

  it('Samlar gercekte DUSUK zarf oranina sahip (~0.12), yuksek degil', () => {
    const samlar = mahalleler.find((m) => m.ad === 'Samlar')!;
    expect(samlar).toBeDefined();
    const oran = hesaplaZarfOrani(samlar.alan_km2, samlar.zarf_alan_km2);
    expect(oran).toBeCloseTo(0.1206, 3);
  });

  it('Altinsehir gercekte YUKSEK zarf oranina sahip (~0.97)', () => {
    const altinsehir = mahalleler.find((m) => m.ad === 'Altinsehir')!;
    expect(altinsehir).toBeDefined();
    const oran = hesaplaZarfOrani(altinsehir.alan_km2, altinsehir.zarf_alan_km2);
    expect(oran).toBeGreaterThan(0.9);
  });

  it('gercek veride hem dusuk (~%12) hem yuksek (~%96+) zarf orani birlikte gorulur (mahalleden mahalleye buyuk fark iddiasi dogrulanir)', () => {
    const oranlar = mahalleler.map((m) => hesaplaZarfOrani(m.alan_km2, m.zarf_alan_km2));
    expect(Math.min(...oranlar)).toBeLessThan(0.15);
    expect(Math.max(...oranlar)).toBeGreaterThan(0.9);
  });
});
