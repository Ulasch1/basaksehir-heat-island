import { describe, it, expect } from 'vitest';
import { hesaplaHucreTehlikeleri, simuleHucreYesillestirme } from '../skorHesapla';
import type { TehlikeAgirliklari } from '../skor';

/**
 * Regresyon testi (round 2): Harita.tsx'teki `izgaraGeoJsonKey` mantigini
 * birebir taklit eder. Bu key, `<IzgaraGeoJSON>` React elemaninin `key` prop'u
 * olarak kullanilir; Leaflet'in `addData` cagirisi sadece MOUNT aninda
 * calistigindan (bkz. leaflet-src.js addData / GeoJSON.js updateGeoJSON),
 * `data` prop'u degisse bile key sabit kalirsa hucreler asla gercek DOM/canvas
 * seviyesinde guncellenmez. Bu test, simYesil her degistiginde uretilen key'in
 * de gercekten degistigini (remount tetiklenecegini) ve ayni simYesil icin
 * key'in stabil kaldigini (gereksiz remount olmadigini) dogrular.
 */

const AGIRLIKLAR: TehlikeAgirliklari = { yesilAlan: 0.5, binaYogunlugu: 0.5 };
const KATSAYI = 0.5;

const HUCRELER = [
  { yesil_alan_orani: 0.05, bina_yogunlugu: 0.95 },
  { yesil_alan_orani: 0.1, bina_yogunlugu: 0.9 },
  { yesil_alan_orani: 0.15, bina_yogunlugu: 0.85 },
  { yesil_alan_orani: 0.2, bina_yogunlugu: 0.8 },
  { yesil_alan_orani: 0.3, bina_yogunlugu: 0.7 },
  { yesil_alan_orani: 0.5, bina_yogunlugu: 0.5 },
  { yesil_alan_orani: 0.6, bina_yogunlugu: 0.4 },
  { yesil_alan_orani: 0.7, bina_yogunlugu: 0.3 },
  { yesil_alan_orani: 0.85, bina_yogunlugu: 0.15 },
  { yesil_alan_orani: 0.95, bina_yogunlugu: 0.05 },
];

/** Harita.tsx'teki izgaraGeoJsonKey useMemo'sunun birebir kopyasi. */
function izgaraGeoJsonKeyHesapla(izgaraKatmani: {
  ad: string;
  tehlikeler: number[];
  simulasyonAktif: boolean;
} | null): string {
  if (!izgaraKatmani) return '';
  const tehlikeToplami = izgaraKatmani.tehlikeler.reduce((acc, t) => acc + t, 0);
  return `izgara-${izgaraKatmani.ad}-${izgaraKatmani.simulasyonAktif}-${tehlikeToplami.toFixed(6)}`;
}

/** App.tsx'teki izgaraKatmani useMemo'sunun bir simYesil degeri icin birebir kopyasi. */
function izgaraKatmaniHesapla(ad: string, simYesil: number) {
  const simulasyonAktif = simYesil > 0;
  const baseline = hesaplaHucreTehlikeleri(HUCRELER, AGIRLIKLAR);
  const hucreOzellikleri = simulasyonAktif
    ? simuleHucreYesillestirme(HUCRELER, simYesil, KATSAYI, AGIRLIKLAR)
    : HUCRELER.map((h, i) => ({
        yesil_alan_orani: h.yesil_alan_orani,
        bina_yogunlugu: h.bina_yogunlugu,
        tehlike: baseline[i],
      }));
  const tehlikeler = hucreOzellikleri.map((h) => h.tehlike);
  return { ad, tehlikeler, baselineTehlikeler: baseline, simulasyonAktif };
}

describe('izgaraGeoJsonKey (round 2 remount regresyonu)', () => {
  it('simYesil 0 -> >0 gecisinde key degisir (remount tetiklenir)', () => {
    const katman0 = izgaraKatmaniHesapla('Kayabaşı', 0);
    const katman10 = izgaraKatmaniHesapla('Kayabaşı', 10);
    const key0 = izgaraGeoJsonKeyHesapla(katman0);
    const key10 = izgaraGeoJsonKeyHesapla(katman10);
    expect(key0).not.toBe(key10);
  });

  it('kaydirici kademeli olarak ilerlerken (1 puan artislar) her adimda key degisir', () => {
    const keyler = new Set<string>();
    for (let simYesil = 0; simYesil <= 30; simYesil++) {
      const katman = izgaraKatmaniHesapla('Kayabaşı', simYesil);
      keyler.add(izgaraGeoJsonKeyHesapla(katman));
    }
    // 31 farkli simYesil degeri (0..30) icin 31 farkli key uretilmeli.
    expect(keyler.size).toBe(31);
  });

  it('ayni simYesil icin key tekrar hesaplandiginda DEGISMEZ (gereksiz remount olmaz)', () => {
    const katmanA = izgaraKatmaniHesapla('Kayabaşı', 15);
    const katmanB = izgaraKatmaniHesapla('Kayabaşı', 15);
    expect(izgaraGeoJsonKeyHesapla(katmanA)).toBe(izgaraGeoJsonKeyHesapla(katmanB));
  });

  it('mahalle degisince key degisir (eski davranistan miras kalan mahalle-bazli ayirim korunuyor)', () => {
    const katmanKayabasi = izgaraKatmaniHesapla('Kayabaşı', 5);
    const katmanBaska = izgaraKatmaniHesapla('Şahintepe', 5);
    expect(izgaraGeoJsonKeyHesapla(katmanKayabasi)).not.toBe(izgaraGeoJsonKeyHesapla(katmanBaska));
  });

  it('izgaraKatmani null ise bos key doner (guard clause)', () => {
    expect(izgaraGeoJsonKeyHesapla(null)).toBe('');
  });
});
