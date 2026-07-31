import { describe, it, expect } from 'vitest';
import {
  hesaplaMevcutSkorlar,
  hesaplaProjeksiyonRiski,
  tehlikeRiskUyusmazliginiBul,
  hesaplaHucreTehlikeleri,
  hesaplaSimuleRank,
  simuleHucreYesillestirme,
} from '../skorHesapla';
import type { MahalleVeri, SkorAyarlari } from '../skorHesapla';
import type { TehlikeAgirliklari } from '../skor';

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

describe('hesaplaHucreTehlikeleri', () => {
  const agirliklar: TehlikeAgirliklari = { yesilAlan: 0.5, binaYogunlugu: 0.5 };

  it('birden fazla hucre icin hesaplaTehlike ile dogru degerler uretir', () => {
    const hucreler = [
      { yesil_alan_orani: 0.2, bina_yogunlugu: 0.8 },
      { yesil_alan_orani: 0.6, bina_yogunlugu: 0.4 },
    ];
    const sonuclar = hesaplaHucreTehlikeleri(hucreler, agirliklar);
    // Hucre 1: (0.5*(1-0.2)+0.5*0.8) = 0.8
    // Hucre 2: (0.5*(1-0.6)+0.5*0.4) = 0.4
    expect(sonuclar).toHaveLength(2);
    expect(sonuclar[0]).toBeCloseTo(0.8, 5);
    expect(sonuclar[1]).toBeCloseTo(0.4, 5);
  });

  it('bos dizi girdisinde bos dizi doner', () => {
    const sonuclar = hesaplaHucreTehlikeleri([], agirliklar);
    expect(sonuclar).toEqual([]);
  });

  it('cikti sirasi girdi sirasiyla aynidir', () => {
    const hucreler = [
      { yesil_alan_orani: 0.1, bina_yogunlugu: 0.9 },
      { yesil_alan_orani: 0.5, bina_yogunlugu: 0.5 },
      { yesil_alan_orani: 0.9, bina_yogunlugu: 0.1 },
    ];
    const sonuclar = hesaplaHucreTehlikeleri(hucreler, agirliklar);
    // degerler: [0.9, 0.5, 0.1]
    expect(sonuclar[0]).toBeCloseTo(0.9, 5);
    expect(sonuclar[1]).toBeCloseTo(0.5, 5);
    expect(sonuclar[2]).toBeCloseTo(0.1, 5);
  });
});

describe('hesaplaSimuleRank', () => {
  it('secili mahallenin riski yukselince sirasi 1. olur (elle dogrulanmis)', () => {
    // A: y=0.2,b=0.8,n=100 -> tehlike=0.8, yogunluk=100 (min=100,max=300) -> maruziyet=0.1, risk=0.08
    // B: y=0.5,b=0.5,n=200 -> tehlike=0.5, yogunluk=200 -> maruziyet=0.55, risk=0.275
    // C: y=0.8,b=0.2,n=300 -> tehlike=0.2, yogunluk=300 -> maruziyet=1.0, risk=0.2
    // Baseline siralama (azalan risk): B(0.275) > C(0.2) > A(0.08)
    const testMahalleler: MahalleVeri[] = [
      { ad: 'A', yesilAlanOrani: 0.2, binaYogunlugu: 0.8, nufus: 100, zarfAlanKm2: 1.0 },
      { ad: 'B', yesilAlanOrani: 0.5, binaYogunlugu: 0.5, nufus: 200, zarfAlanKm2: 1.0 },
      { ad: 'C', yesilAlanOrani: 0.8, binaYogunlugu: 0.2, nufus: 300, zarfAlanKm2: 1.0 },
    ];
    const mevcutSkorlar = hesaplaMevcutSkorlar(testMahalleler, VARSAYILAN_AYARLAR);
    expect(mevcutSkorlar[0].risk).toBeCloseTo(0.08, 5);
    expect(mevcutSkorlar[1].risk).toBeCloseTo(0.275, 5);
    expect(mevcutSkorlar[2].risk).toBeCloseTo(0.2, 5);

    // A'nin riskini 0.3'e cikarirsak yeni siralama: A(0.3) > B(0.275) > C(0.2) -> A 1. sirada
    const yeniSira = hesaplaSimuleRank(mevcutSkorlar, 'A', 0.3);
    expect(yeniSira).toBe(1);
  });

  it('diger mahallelerin riskleri etkilenmez, girdi dizisi mutate edilmez', () => {
    const testMahalleler: MahalleVeri[] = [
      { ad: 'X', yesilAlanOrani: 0.3, binaYogunlugu: 0.7, nufus: 500, zarfAlanKm2: 1.0 },
      { ad: 'Y', yesilAlanOrani: 0.6, binaYogunlugu: 0.4, nufus: 600, zarfAlanKm2: 1.0 },
    ];
    const mevcutSkorlar = hesaplaMevcutSkorlar(testMahalleler, VARSAYILAN_AYARLAR);
    const yedekRiskler = mevcutSkorlar.map((s) => s.risk);
    hesaplaSimuleRank(mevcutSkorlar, 'X', 0.999);
    mevcutSkorlar.forEach((s, i) => {
      expect(s.risk).toBeCloseTo(yedekRiskler[i], 10);
    });
  });

  it('seciliAd mevcutSkorlar icinde bulunamazsa null doner', () => {
    const testMahalleler: MahalleVeri[] = [
      { ad: 'P', yesilAlanOrani: 0.4, binaYogunlugu: 0.6, nufus: 200, zarfAlanKm2: 1.0 },
    ];
    const mevcutSkorlar = hesaplaMevcutSkorlar(testMahalleler, VARSAYILAN_AYARLAR);
    expect(hesaplaSimuleRank(mevcutSkorlar, 'YokMahalle', 0.9)).toBeNull();
  });
});

describe('simuleHucreYesillestirme', () => {
  const agirliklar: TehlikeAgirliklari = { yesilAlan: 0.5, binaYogunlugu: 0.5 };

  it('artisPuani=0 iken tum hucreler baseline tehlike ile aynen doner', () => {
    const hucreler = [
      { yesil_alan_orani: 0.1, bina_yogunlugu: 0.9 },
      { yesil_alan_orani: 0.5, bina_yogunlugu: 0.5 },
      { yesil_alan_orani: 0.8, bina_yogunlugu: 0.2 },
    ];
    const sonuc = simuleHucreYesillestirme(hucreler, 0, 1.0, agirliklar);
    expect(sonuc).toHaveLength(3);
    hucreler.forEach((h, i) => {
      expect(sonuc[i].yesil_alan_orani).toBeCloseTo(h.yesil_alan_orani, 10);
      expect(sonuc[i].bina_yogunlugu).toBeCloseTo(h.bina_yogunlugu, 10);
    });
    expect(sonuc[0].tehlike).toBeCloseTo(0.9, 5);
    expect(sonuc[1].tehlike).toBeCloseTo(0.5, 5);
    expect(sonuc[2].tehlike).toBeCloseTo(0.2, 5);
  });

  it('butce sinirliyken en kirmizi hucre once (kismen) iyilesir, en az kirmizi hucreye dokunulmaz', () => {
    const hucreler = [
      { yesil_alan_orani: 0.1, bina_yogunlugu: 0.9 },
      { yesil_alan_orani: 0.5, bina_yogunlugu: 0.5 },
      { yesil_alan_orani: 0.9, bina_yogunlugu: 0.1 },
    ];
    const sonuc = simuleHucreYesillestirme(hucreler, 25, 1.0, agirliklar);
    expect(sonuc[0].yesil_alan_orani).toBeCloseTo(0.85, 5);
    expect(sonuc[0].bina_yogunlugu).toBeCloseTo(0.15, 5);
    expect(sonuc[1].yesil_alan_orani).toBeCloseTo(0.5, 5);
    expect(sonuc[1].bina_yogunlugu).toBeCloseTo(0.5, 5);
    expect(sonuc[1].tehlike).toBeCloseTo(0.5, 5);
    expect(sonuc[2].yesil_alan_orani).toBeCloseTo(0.9, 5);
    expect(sonuc[2].bina_yogunlugu).toBeCloseTo(0.1, 5);
    expect(sonuc[2].tehlike).toBeCloseTo(0.1, 5);
  });

  it('bina yogunlugu katsayiya gore azalir ve 0 altina inmez (clamp)', () => {
    const hucreler = [{ yesil_alan_orani: 0.2, bina_yogunlugu: 0.6 }];
    const sonuc = simuleHucreYesillestirme(hucreler, 100, 1.0, agirliklar);
    expect(sonuc[0].yesil_alan_orani).toBeCloseTo(1.0, 5);
    expect(sonuc[0].bina_yogunlugu).toBeCloseTo(0, 5);

    const sonuc2 = simuleHucreYesillestirme(hucreler, 100, 0.25, agirliklar);
    expect(sonuc2[0].bina_yogunlugu).toBeCloseTo(0.4, 5);
  });

  it('cikti sirasi girdi sirasiyla ayni kalir (siralama sadece dahili islem icin)', () => {
    const hucreler = [
      { yesil_alan_orani: 0.9, bina_yogunlugu: 0.1 },
      { yesil_alan_orani: 0.1, bina_yogunlugu: 0.9 },
      { yesil_alan_orani: 0.5, bina_yogunlugu: 0.5 },
    ];
    const sonuc = simuleHucreYesillestirme(hucreler, 5, 1.0, agirliklar);
    expect(sonuc).toHaveLength(3);
    expect(sonuc[0].yesil_alan_orani).toBeCloseTo(0.9, 5);
    expect(sonuc[1].yesil_alan_orani).toBeCloseTo(0.25, 5);
    expect(sonuc[1].bina_yogunlugu).toBeCloseTo(0.75, 5);
    expect(sonuc[2].yesil_alan_orani).toBeCloseTo(0.5, 5);
    expect(sonuc[2].bina_yogunlugu).toBeCloseTo(0.5, 5);
  });
});
