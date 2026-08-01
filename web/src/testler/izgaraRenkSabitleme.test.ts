import { describe, it, expect } from 'vitest';
import { hesaplaHucreTehlikeleri, simuleHucreYesillestirme } from '../skorHesapla';
import { golgeRengi } from '../renk';
import type { TehlikeAgirliklari } from '../skor';

/**
 * Regresyon testi: mahalle-ici izgara acikken "Yesil alan artisi" kaydiricisi
 * hareket ettirildiginde, SADECE butceye giren (gercekten yesillenen) hucrelerin
 * rengi degismeli; degismeyen hucreler GORSEL OLARAK SABIT kalmali (ARC-07).
 *
 * Bu test, Harita.tsx + App.tsx'teki gercek uretim mantigini (izgaraMinMax'in
 * simulasyondan BAGIMSIZ baseline tehlike degerlerinden hesaplanmasi) birebir
 * taklit ederek dogrular. Fix'ten once izgaraMinMax post-simulasyon
 * tehlikelerinden hesaplaniyordu; bu durumda degismeyen hucrelerin bile
 * fillColor'i, mahalledeki min/max araligi kaydigi icin degisirdi - asagidaki
 * "eski (buggy) davranis" bolumu bunu gostererek fix'in gercekten etkili
 * oldugunu kanitlar.
 */

const AGIRLIKLAR: TehlikeAgirliklari = { yesilAlan: 0.5, binaYogunlugu: 0.5 };
const KATSAYI = 0.5;

// Cesitli tehlike seviyelerinde 10 sentetik hucre (bazilari cok tehlikeli, bazilari guvenli)
const HUCRELER = [
  { yesil_alan_orani: 0.05, bina_yogunlugu: 0.95 }, // en tehlikeli
  { yesil_alan_orani: 0.1, bina_yogunlugu: 0.9 },
  { yesil_alan_orani: 0.15, bina_yogunlugu: 0.85 },
  { yesil_alan_orani: 0.2, bina_yogunlugu: 0.8 },
  { yesil_alan_orani: 0.3, bina_yogunlugu: 0.7 },
  { yesil_alan_orani: 0.5, bina_yogunlugu: 0.5 },
  { yesil_alan_orani: 0.6, bina_yogunlugu: 0.4 },
  { yesil_alan_orani: 0.7, bina_yogunlugu: 0.3 },
  { yesil_alan_orani: 0.85, bina_yogunlugu: 0.15 },
  { yesil_alan_orani: 0.95, bina_yogunlugu: 0.05 }, // en guvenli
];

function haritaFillColorlari(tehlikeler: number[], min: number, max: number): string[] {
  return tehlikeler.map((t) => golgeRengi(t, min, max));
}

describe('izgara renk sabitleme (ARC-07 fix regresyonu)', () => {
  it('simYesil=0 iken hucre sirasi en tehlikeliden en guvenliye baseline ile ayni olmali', () => {
    const baseline = hesaplaHucreTehlikeleri(HUCRELER, AGIRLIKLAR);
    expect(baseline[0]).toBeGreaterThan(baseline[9]);
  });

  it('DUZELTILMIS davranis: simYesil degisince SADECE butceye giren hucrelerin fillColor\'i degisir, digerleri birebir ayni kalir', () => {
    const baseline = hesaplaHucreTehlikeleri(HUCRELER, AGIRLIKLAR);
    const minBase = Math.min(...baseline);
    const maxBase = Math.max(...baseline);

    // simYesil = 0 (izgara ilk acildiginda)
    const renkler0 = haritaFillColorlari(baseline, minBase, maxBase);

    // simYesil = 20 -> App.tsx izgaraKatmani useMemo, izgaraMinMax HER ZAMAN
    // baseline'dan hesaplaniyor (fix), simulasyon aktifken de degismiyor.
    const simulasyonlu = simuleHucreYesillestirme(HUCRELER, 20, KATSAYI, AGIRLIKLAR);
    const tehlikeler20 = simulasyonlu.map((h) => h.tehlike);
    const renkler20 = haritaFillColorlari(tehlikeler20, minBase, maxBase);

    let degisenSayisi = 0;
    for (let i = 0; i < HUCRELER.length; i++) {
      const tehlikeDegisti = tehlikeler20[i] !== baseline[i];
      if (tehlikeDegisti) {
        degisenSayisi++;
        // Butceye giren hucrenin gercek tehlike degeri dustugu icin rengi de degismeli
        expect(renkler20[i]).not.toBe(renkler0[i]);
      } else {
        // Butceye girmeyen hucrenin rengi TAM OLARAK ayni kalmali (piksel-birebir)
        expect(renkler20[i]).toBe(renkler0[i]);
      }
    }
    // %20 butce ile en az bir hucre gercekten degismis olmali, hepsi degil.
    expect(degisenSayisi).toBeGreaterThan(0);
    expect(degisenSayisi).toBeLessThan(HUCRELER.length);
  });

  it('ESKI (buggy) davranis referansi: minMax POST-SIMULASYON tehlikelerden hesaplansaydi, DEGISMEYEN hucrelerin bile rengi kayardi', () => {
    const baseline = hesaplaHucreTehlikeleri(HUCRELER, AGIRLIKLAR);
    const minBase = Math.min(...baseline);
    const maxBase = Math.max(...baseline);
    const renkler0 = haritaFillColorlari(baseline, minBase, maxBase);

    const simulasyonlu = simuleHucreYesillestirme(HUCRELER, 20, KATSAYI, AGIRLIKLAR);
    const tehlikeler20 = simulasyonlu.map((h) => h.tehlike);

    // Bug'daki gibi min/max'i POST-SIMULASYON degerlerinden hesapla
    const minPost = Math.min(...tehlikeler20);
    const maxPost = Math.max(...tehlikeler20);
    const renklerBuggy = haritaFillColorlari(tehlikeler20, minPost, maxPost);

    let degismeyenAmaRengiKayanSayisi = 0;
    for (let i = 0; i < HUCRELER.length; i++) {
      const tehlikeDegisti = tehlikeler20[i] !== baseline[i];
      if (!tehlikeDegisti && renklerBuggy[i] !== renkler0[i]) {
        degismeyenAmaRengiKayanSayisi++;
      }
    }
    // Bug varken degismeyen hucrelerin cogu (araligin kaymasi nedeniyle) renk degistirir.
    expect(degismeyenAmaRengiKayanSayisi).toBeGreaterThan(0);
  });
});

describe('izgara min genişletme (Düzeltme 2) – iyileşen hücreler arası kontrast alt-kenetlemesiz golgeRengi ile korunur', () => {
  it('yüksek bütçe ile birçok hücre baseline minimumunun altına düşünce bile birbirinden farklı renkler üretir', () => {
    const baseline = hesaplaHucreTehlikeleri(HUCRELER, AGIRLIKLAR);
    const minBase = Math.min(...baseline);
    const maxBase = Math.max(...baseline);

    // Yüksek bütçeyle simüle et (simYesil=90). Çok sayıda hücre ciddi miktarda iyileşir,
    // bazıları baseline minimumunun bile altına düşer.
    const simulasyonlu = simuleHucreYesillestirme(HUCRELER, 90, KATSAYI, AGIRLIKLAR);
    const tehlikeler90 = simulasyonlu.map((h) => h.tehlike);

    // ESKİ (alt-kenetlemeli) golgeRengi taklidi: t alt ucunu 0'a clamp'ler.
    function eskiGolgeRengi(tehlike: number, min: number, max: number) {
      const aralik = max - min;
      const t = aralik === 0 ? 0.5 : Math.min(Math.max((tehlike - min) / aralik, 0), 1);
      const l = 0.85 - t * (0.85 - 0.60);
      const c = 0.05 + t * (0.19 - 0.05);
      const h = 225 + t * (25 - 225);
      return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
    }

    const renklerEski = tehlikeler90.map(t => eskiGolgeRengi(t, minBase, maxBase));
    const benzersizEski = new Set(renklerEski).size;

    // YENİ (alt-kenetlemesiz) golgeRengi: t < 0 olabilir, ancak l ve c sonradan clamp'lenir.
    const renklerYeni = tehlikeler90.map(t => golgeRengi(t, minBase, maxBase));
    const benzersizYeni = new Set(renklerYeni).size;

    // Bütçeye giren (tehlikesi değişen) hücre sayısı
    const degisenSayisi = tehlikeler90.filter((t, i) => t !== baseline[i]).length;

    // Eski mantıkta bu değişen hücrelerin çoğu aynı renge sabitlenir.
    // Yeni mantıkta renk çeşitliliği çok daha fazladır.
    expect(benzersizYeni).toBeGreaterThan(benzersizEski);
    expect(benzersizYeni).toBeGreaterThanOrEqual(degisenSayisi - 1); // ufak tolerans
  });
});
