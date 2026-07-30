import { describe, it, expect } from 'vitest';
import {
  hesaplaMevcutSkorlar,
  hesaplaProjeksiyonRiski,
  tehlikeRiskUyusmazliginiBul,
} from '../skorHesapla';
import type { MahalleVeri, SkorAyarlari } from '../skorHesapla';

// Sabit ayar objesi (ayarlar.json ile ayni yapi)
const VARSAYILAN_AYARLAR: SkorAyarlari = {
  tehlike_agirliklari: { yesil_alan: 0.5, bina_yogunlugu: 0.5 },
  maruziyet_alt_siniri: 0.1,
};

// UYUSMAZLIK icin ornek veri:
// TehlikeliAmaTenha: cok yuksek bina yogunlugu, dusuk yesil alan -> en yuksek tehlike,
//                    ama cok dusuk nufus -> dusuk maruziyet -> dusuk risk.
// OrtaTehlikeliKalabalik: orta seviye tehlike, cok yuksek nufus -> en yuksek risk.
const UYUSMAZLIK_MAHALLELER: MahalleVeri[] = [
  {
    ad: 'TehlikeliAmaTenha',
    yesilAlanOrani: 0.1,
    binaYogunlugu: 0.9,
    nufus: 10,
    zarfAlanKm2: 1.0,
  },
  {
    ad: 'OrtaTehlikeliKalabalik',
    yesilAlanOrani: 0.5,
    binaYogunlugu: 0.5,
    nufus: 1000,
    zarfAlanKm2: 1.0,
  },
  {
    ad: 'Diger1',
    yesilAlanOrani: 0.3,
    binaYogunlugu: 0.7,
    nufus: 500,
    zarfAlanKm2: 1.0,
  },
  {
    ad: 'Diger2',
    yesilAlanOrani: 0.7,
    binaYogunlugu: 0.3,
    nufus: 200,
    zarfAlanKm2: 1.0,
  },
];

// ESLESEN DURUM: ayni mahalle en yuksek tehlikeye de en yuksek riske de sahip.
const ESLESEN_MAHALLELER: MahalleVeri[] = [
  {
    ad: 'Baskan',
    yesilAlanOrani: 0.05,
    binaYogunlugu: 0.95,
    nufus: 2000,
    zarfAlanKm2: 1.0,
  },
  {
    ad: 'Ikinci',
    yesilAlanOrani: 0.3,
    binaYogunlugu: 0.7,
    nufus: 500,
    zarfAlanKm2: 1.0,
  },
];

// PROJEKSIYON testi icin kucuk veri seti
const PROJEKSIYON_MAHALLELER: MahalleVeri[] = [
  {
    ad: 'A',
    yesilAlanOrani: 0.2,
    binaYogunlugu: 0.8,
    nufus: 100,
    zarfAlanKm2: 1.0,
  },
  {
    ad: 'B',
    yesilAlanOrani: 0.5,
    binaYogunlugu: 0.5,
    nufus: 200,
    zarfAlanKm2: 1.0,
  },
];

describe('skorHesapla modul testleri', () => {
  // TC-01: hesaplaMevcutSkorlar el ile hesaplanan bir degerle dogrulanir
  it('hesaplaMevcutSkorlar - TehlikeliAmaTenha icin risk dogru', () => {
    const skorlar = hesaplaMevcutSkorlar(UYUSMAZLIK_MAHALLELER, VARSAYILAN_AYARLAR);
    const tehlikeli = skorlar[0];
    // tehlike: (0.5*(1-0.1) + 0.5*0.9) = 0.9
    expect(tehlikeli.tehlike).toBeCloseTo(0.9, 5);
    // Yogunluk: 10, min=10, max=1000 => maruziyet=0.1
    expect(tehlikeli.maruziyet).toBeCloseTo(0.1, 5);
    // risk: 0.9 * 0.1 = 0.09
    expect(tehlikeli.risk).toBeCloseTo(0.09, 5);
  });

  // TC-02: Bos dizi durumu
  it('hesaplaMevcutSkorlar bos dizide bos dizi dondurur', () => {
    const sonuc = hesaplaMevcutSkorlar([], VARSAYILAN_AYARLAR);
    expect(sonuc).toEqual([]);
  });

  // TC-03: zarfAlanKm2 yogunlukta kullanilir (REQ-F-24) - farkli zarf alani ayni nufusta farkli maruziyet uretir
  it('hesaplaMevcutSkorlar yogunlugu zarfAlanKm2 ile hesaplar', () => {
    const testVeri: MahalleVeri[] = [
      {
        ad: 'Genis',
        yesilAlanOrani: 0.5,
        binaYogunlugu: 0.5,
        nufus: 100,
        zarfAlanKm2: 2.0,
      },
      {
        ad: 'Dar',
        yesilAlanOrani: 0.5,
        binaYogunlugu: 0.5,
        nufus: 100,
        zarfAlanKm2: 1.0,
      },
    ];
    const skorlar = hesaplaMevcutSkorlar(testVeri, VARSAYILAN_AYARLAR);
    // Yogunluklar: Genis=50, Dar=100 -> farkli => maruziyetler farkli olmali
    expect(skorlar[0].maruziyet).not.toBeCloseTo(skorlar[1].maruziyet);
  });

  // TC-04: hesaplaProjeksiyonRiski el ile dogrulama
  it('hesaplaProjeksiyonRiski projeksiyon riskini dogru hesaplar', () => {
    // A mahallesinin nufusu 100'den 150'ye cikar (%50 artis)
    const sonuc = hesaplaProjeksiyonRiski(PROJEKSIYON_MAHALLELER, 0, 150, VARSAYILAN_AYARLAR);
    // Yeni yogunluklar: A=150, B=200 => maruziyet A=0.1, B=1
    // A'nin tehlike: 0.5*(1-0.2)+0.5*0.8 = 0.8, risk=0.08
    expect(sonuc.tehlike).toBeCloseTo(0.8, 5);
    expect(sonuc.maruziyet).toBeCloseTo(0.1, 5);
    expect(sonuc.risk).toBeCloseTo(0.08, 5);
  });

  // TC-05: hedefIndex sinir disi hatasi
  it('hesaplaProjeksiyonRiski sinir disi hedefIndex hatasi firlatir', () => {
    expect(() => hesaplaProjeksiyonRiski(PROJEKSIYON_MAHALLELER, -1, 150, VARSAYILAN_AYARLAR)).toThrow();
    expect(() => hesaplaProjeksiyonRiski(PROJEKSIYON_MAHALLELER, 99, 150, VARSAYILAN_AYARLAR)).toThrow();
  });

  // TC-06: Uyusmazlik durumu (en yuksek tehlike ile en yuksek risk farkli mahalleler)
  it('tehlikeRiskUyusmazliginiBul uyusmazlik durumunu dogru tespit eder', () => {
    const skorlar = hesaplaMevcutSkorlar(UYUSMAZLIK_MAHALLELER, VARSAYILAN_AYARLAR);
    const sonuc = tehlikeRiskUyusmazliginiBul(skorlar);
    expect(sonuc.uyusmuyor).toBe(true);
    expect(sonuc.enYuksekTehlikeAd).toBe('TehlikeliAmaTenha');
    expect(sonuc.enYuksekRiskAd).toBe('OrtaTehlikeliKalabalik');
  });

  // TC-07: Eslesme durumu (ayni mahalle her ikisinde de en yuksek)
  it('tehlikeRiskUyusmazliginiBul eslesme durumunda false doner', () => {
    const skorlar = hesaplaMevcutSkorlar(ESLESEN_MAHALLELER, VARSAYILAN_AYARLAR);
    const sonuc = tehlikeRiskUyusmazliginiBul(skorlar);
    expect(sonuc.uyusmuyor).toBe(false);
    expect(sonuc.enYuksekTehlikeAd).toBe('Baskan');
    expect(sonuc.enYuksekRiskAd).toBe('Baskan');
  });

  // TC-08: Bos liste
  it('tehlikeRiskUyusmazliginiBul bos liste ile false, isimler null', () => {
    const sonuc = tehlikeRiskUyusmazliginiBul([]);
    expect(sonuc.uyusmuyor).toBe(false);
    expect(sonuc.enYuksekTehlikeAd).toBeNull();
    expect(sonuc.enYuksekRiskAd).toBeNull();
  });
});
