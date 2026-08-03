import { describe, it, expect } from 'vitest';
import { hesaplaHucreTehlikeleri, simuleHucreYesillestirme } from '../skorHesapla';
import ayarlar from '../ayarlar.json';
import type { TehlikeAgirliklari } from '../skor';

/**
 * Bu dosya, App.tsx'teki izgaraKatmani useMemo içindeki hedef dallanma
 * mantiginin (simHedef === 'hucre' / 'mahalle') bir REPLIKASYONUDUR. App.tsx'in
 * kendisi component-seviyesinde test edilmez; bu testler sadece yeni dallanma
 * kuralinin davranisini dogrulamak icin saf fonksiyonlarla yazilmistir.
 *
 * Test senaryolari:
 *  a) simHedef='hucre', seciliHucreIndex=0, simYesil=20 → yalnizca 0. hucre degisir.
 *  b) simHedef='mahalle', seciliHucreIndex=0, simYesil=20 → tum hucreler degisir,
 *     en az bir baska hucrenin degistigi kanitlanir.
 */

const AGIRLIKLAR: TehlikeAgirliklari = {
  yesilAlan: ayarlar.tehlike_agirliklari.yesil_alan,
  binaYogunlugu: ayarlar.tehlike_agirliklari.bina_yogunlugu,
};
const KATSAYI = ayarlar.simulasyon_bina_azaltma_katsayisi;

// izgaraRenkSabitleme.test.ts'teki benzer 10 hucreden olusan sentetik set
const HUCRELER = [
  { yesil_alan_orani: 0.05, bina_yogunlugu: 0.95 },
  { yesil_alan_orani: 0.10, bina_yogunlugu: 0.90 },
  { yesil_alan_orani: 0.15, bina_yogunlugu: 0.85 },
  { yesil_alan_orani: 0.20, bina_yogunlugu: 0.80 },
  { yesil_alan_orani: 0.30, bina_yogunlugu: 0.70 },
  { yesil_alan_orani: 0.50, bina_yogunlugu: 0.50 },
  { yesil_alan_orani: 0.60, bina_yogunlugu: 0.40 },
  { yesil_alan_orani: 0.70, bina_yogunlugu: 0.30 },
  { yesil_alan_orani: 0.85, bina_yogunlugu: 0.15 },
  { yesil_alan_orani: 0.95, bina_yogunlugu: 0.05 },
];

function hesaplaHucreOzellikleriDallanma(
  hucreler: typeof HUCRELER,
  simHedef: 'mahalle' | 'hucre',
  seciliHucreIndex: number | null,
  simYesil: number,
  agirliklar: TehlikeAgirliklari,
  katsayi: number,
) {
  const baselineTehlikeler = hesaplaHucreTehlikeleri(hucreler, agirliklar);
  const baselineOzellikleri = hucreler.map((h, i) => ({
    yesil_alan_orani: h.yesil_alan_orani,
    bina_yogunlugu: h.bina_yogunlugu,
    tehlike: baselineTehlikeler[i],
  }));

  let hucreOzellikleri;
  if (simHedef === 'hucre' && seciliHucreIndex !== null && hucreler[seciliHucreIndex]) {
    hucreOzellikleri = [...baselineOzellikleri];
    const tekSonuc = simuleHucreYesillestirme(
      [hucreler[seciliHucreIndex]],
      simYesil,
      katsayi,
      agirliklar,
    );
    hucreOzellikleri[seciliHucreIndex] = tekSonuc[0];
  } else {
    hucreOzellikleri = simuleHucreYesillestirme(hucreler, simYesil, katsayi, agirliklar);
  }
  return { baseline: baselineOzellikleri, simule: hucreOzellikleri };
}

describe('simHedef uygulama dallanmasi (REPLIKASYON)', () => {
  it('simHedef="hucre" + seciliHucreIndex=0: sadece secili hucre degisir, digerleri baseline ile ayni kalir', () => {
    const sonuc = hesaplaHucreOzellikleriDallanma(
      HUCRELER,
      'hucre',
      0,
      20,
      AGIRLIKLAR,
      KATSAYI,
    );
    for (let i = 0; i < HUCRELER.length; i++) {
      if (i === 0) {
        // secili hucre, en az tehlike degeri farkli olmali
        expect(sonuc.simule[i].tehlike).not.toBe(sonuc.baseline[i].tehlike);
      } else {
        // diger tum hucreler aynen kalmali
        expect(sonuc.simule[i]).toEqual(sonuc.baseline[i]);
      }
    }
  });

  it('simHedef="mahalle" + seciliHucreIndex=0: hucre secili olsa da tum izgara degisir, en az bir diger hucre farklidir', () => {
    const sonuc = hesaplaHucreOzellikleriDallanma(
      HUCRELER,
      'mahalle',
      0,
      20,
      AGIRLIKLAR,
      KATSAYI,
    );
    let baskaHucreDegisti = false;
    for (let i = 1; i < HUCRELER.length; i++) {
      if (sonuc.simule[i].tehlike !== sonuc.baseline[i].tehlike) {
        baskaHucreDegisti = true;
        break;
      }
    }
    expect(baskaHucreDegisti).toBe(true);
  });
});
