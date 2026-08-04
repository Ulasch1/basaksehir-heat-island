import { describe, it, expect } from 'vitest';
import { hesaplaGerekliArtisPuani } from '../skor';
import { hesaplaHedefRiskCozumu } from '../skorHesapla';
import type { TehlikeAgirliklari } from '../skor';

/**
 * QA ek testleri: "Hedef risk çözücü" (hesaplaGerekliArtisPuani / hesaplaHedefRiskCozumu)
 * için mevcut skor.test.ts / skorHesapla.test.ts kapsamındaki mutlu-yol testlerinin
 * ötesinde, gerçek kullanıcının "Hedef risk" sayı girdisine (Simulasyon.tsx) yazabileceği
 * uç değerleri ve ağırlık/katsayı sınır durumlarını kapsar.
 */

const AGIRLIKLAR: TehlikeAgirliklari = { yesilAlan: 0.5, binaYogunlugu: 0.5 };

describe('hesaplaGerekliArtisPuani - uc vakalar', () => {
  it('negatif hedefTehlike: crash yok, mumkun=false doner (tehlike hicbir zaman negatif olamaz)', () => {
    const sonuc = hesaplaGerekliArtisPuani(
      { yesilAlanOrani: 0.5, binaYogunlugu: 0.5 },
      -0.1,
      0.5,
      AGIRLIKLAR,
    );
    expect(sonuc.mumkun).toBe(false);
    expect(sonuc.gerekliArtisPuani).toBeNull();
  });

  it('wYesil=0: yesil alan artisi tehlikeyi hic etkilemez, sadece bina azalisi katkida bulunur', () => {
    const agirliklar: TehlikeAgirliklari = { yesilAlan: 0, binaYogunlugu: 1 };
    // katsayi > 0 oldugunda bina hala azaliyor, hedefe ulasilabilir olmali
    const sonuc = hesaplaGerekliArtisPuani(
      { yesilAlanOrani: 0.2, binaYogunlugu: 0.6 },
      0.1,
      0.5,
      agirliklar,
    );
    expect(sonuc.mumkun).toBe(true);
    // bina 0.6 -> 0.1 icin delta*katsayi = 0.5 => delta = 1 => puan 100
    expect(sonuc.gerekliArtisPuani).toBeCloseTo(100, 5);
  });

  it('wYesil=0 VE katsayi=0: hicbir delta tehlikeyi degistiremez, sonsuz dongu/crash olmadan mumkun=false doner', () => {
    const agirliklar: TehlikeAgirliklari = { yesilAlan: 0, binaYogunlugu: 1 };
    const sonuc = hesaplaGerekliArtisPuani(
      { yesilAlanOrani: 0.2, binaYogunlugu: 0.6 },
      0.1,
      0,
      agirliklar,
    );
    expect(sonuc.mumkun).toBe(false);
    expect(sonuc.gerekliArtisPuani).toBeNull();
  });

  it('agirliklar toplami sifirsa hata firlatir (hesaplaTehlike ile ayni sozlesme)', () => {
    const agirliklar: TehlikeAgirliklari = { yesilAlan: 0, binaYogunlugu: 0 };
    expect(() =>
      hesaplaGerekliArtisPuani({ yesilAlanOrani: 0.2, binaYogunlugu: 0.6 }, 0.1, 0.5, agirliklar),
    ).toThrow();
  });

  it('hedefTehlike tam olarak baseline tehlikeye esitse mumkun=true, puan=0 (sinir durumu)', () => {
    // yesil 0.5, bina 0.5, agirliklar esit -> tehlike = 0.5
    const sonuc = hesaplaGerekliArtisPuani(
      { yesilAlanOrani: 0.5, binaYogunlugu: 0.5 },
      0.5,
      0.5,
      AGIRLIKLAR,
    );
    expect(sonuc.mumkun).toBe(true);
    expect(sonuc.gerekliArtisPuani).toBe(0);
  });
});

describe('hesaplaHedefRiskCozumu - uc vakalar', () => {
  it('hedefRisk negatif girildiginde crash yok, mumkun=false doner', () => {
    const sonuc = hesaplaHedefRiskCozumu(
      { yesilAlanOrani: 0.5, binaYogunlugu: 0.5 },
      0.8,
      -0.05,
      0.5,
      AGIRLIKLAR,
    );
    expect(sonuc.mumkun).toBe(false);
    expect(sonuc.zatenAltinda).toBe(false);
    expect(sonuc.gerekliYesilArtisPuaniHam).toBeNull();
    expect(sonuc.gerekliYesilArtisPuaniGosterim).toBeNull();
    expect(sonuc.sliderAraligindaMi).toBe(false);
  });

  it('hedefRisk 1 gibi buyuk bir deger icin (dusuk maruziyetle hedefTehlike > baseline) zatenAltinda=true olur', () => {
    const sonuc = hesaplaHedefRiskCozumu(
      { yesilAlanOrani: 0.1, binaYogunlugu: 0.9 },
      0.5,
      1,
      0.5,
      AGIRLIKLAR,
    );
    expect(sonuc.zatenAltinda).toBe(true);
    expect(sonuc.mumkun).toBe(true);
  });

  it('maruziyet sifir ise hata firlatir (0a bolme yerine acik hata)', () => {
    expect(() =>
      hesaplaHedefRiskCozumu({ yesilAlanOrani: 0.5, binaYogunlugu: 0.5 }, 0, 0.1, 0.5, AGIRLIKLAR),
    ).toThrow();
  });

  it('"Slider\'a uygula" butonunun Math.ceil(gosterim) mantigi (Simulasyon.tsx REPLIKASYONU): sonuc her zaman gosterimden buyuk veya esit tam sayidir', () => {
    const sonuc = hesaplaHedefRiskCozumu(
      { yesilAlanOrani: 0.2, binaYogunlugu: 0.6 },
      1,
      0.6,
      0.5,
      AGIRLIKLAR,
    );
    expect(sonuc.mumkun).toBe(true);
    expect(sonuc.sliderAraligindaMi).toBe(true);
    const uygulanacakDeger = Math.ceil(sonuc.gerekliYesilArtisPuaniGosterim!);
    expect(Number.isInteger(uygulanacakDeger)).toBe(true);
    expect(uygulanacakDeger).toBeGreaterThanOrEqual(sonuc.gerekliYesilArtisPuaniGosterim!);
    expect(uygulanacakDeger).toBeLessThanOrEqual(30); // slider max
  });
});
