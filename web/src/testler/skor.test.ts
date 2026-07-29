import { describe, it, expect } from 'vitest';
import {
  hesaplaTehlike,
  olcekleMaruziyet,
  hesaplaRisk,
  simuleYesilAlan,
  simuleNufus,
  secBudceKisitli,
} from '../skor';
import type { MahalleGirdi, Skorlar } from '../skor';

// ----- TC'lerde kullanilacak sabit 10 mahallelik ornek veri -----
// Samlar mahallesi nufus yonunden aykiri dusuk degerlidir.
// Diger mahallelerin en dusuk nufusunun (200) yaklasik 1/13'u kadardir.
const MAHALLELER: MahalleGirdi[] = [
  {
    ad: 'Samlar',
    yesilAlanOrani: 0.1,
    binaYogunlugu: 0.8,
    nufus: 13,
    alanKm2: 1.0,
  },
  {
    ad: 'Ornek Mahalle 1',
    yesilAlanOrani: 0.2,
    binaYogunlugu: 0.6,
    nufus: 200,
    alanKm2: 1.0,
  },
  {
    ad: 'Ornek Mahalle 2',
    yesilAlanOrani: 0.15,
    binaYogunlugu: 0.7,
    nufus: 300,
    alanKm2: 1.0,
  },
  {
    ad: 'Ornek Mahalle 3',
    yesilAlanOrani: 0.25,
    binaYogunlugu: 0.5,
    nufus: 400,
    alanKm2: 1.0,
  },
  {
    ad: 'Ornek Mahalle 4',
    yesilAlanOrani: 0.3,
    binaYogunlugu: 0.4,
    nufus: 500,
    alanKm2: 1.0,
  },
  {
    ad: 'Ornek Mahalle 5',
    yesilAlanOrani: 0.35,
    binaYogunlugu: 0.3,
    nufus: 600,
    alanKm2: 1.0,
  },
  {
    ad: 'Ornek Mahalle 6',
    yesilAlanOrani: 0.4,
    binaYogunlugu: 0.2,
    nufus: 700,
    alanKm2: 1.0,
  },
  {
    ad: 'Ornek Mahalle 7',
    yesilAlanOrani: 0.45,
    binaYogunlugu: 0.1,
    nufus: 800,
    alanKm2: 1.0,
  },
  {
    ad: 'Ornek Mahalle 8',
    yesilAlanOrani: 0.5,
    binaYogunlugu: 0.9,
    nufus: 900,
    alanKm2: 1.0,
  },
  {
    ad: 'Ornek Mahalle 9',
    yesilAlanOrani: 0.55,
    binaYogunlugu: 0.85,
    nufus: 1000,
    alanKm2: 1.0,
  },
];

describe('ARC-04 Skor Modulu Testleri', () => {
  // TC-01: hesaplaTehlike temel dogrulama
  it('TC-01: hesaplaTehlike(0.20, 0.60) -> 0.70', () => {
    // Beklenen sabit deger, ayri hesaplama yapilmaz
    expect(hesaplaTehlike(0.2, 0.6)).toBeCloseTo(0.7);
  });

  // TC-02: olcekleMaruziyet, Samlar dahil 10 yogunluk girisi
  it('TC-02: olcekleMaruziyet min-max olcekler, Samlar 0.1 alir', () => {
    // Samlar nufus yogunlugu 13, digerleri 200-1000 araliginda
    const yogunluklar = [13, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const maruziyetler = olcekleMaruziyet(yogunluklar, 0.1);

    // En dusuk (Samlar) 0.1, en yuksek 1
    expect(maruziyetler[0]).toBeCloseTo(0.1);
    expect(maruziyetler[maruziyetler.length - 1]).toBeCloseTo(1);

    // Tum degerler [0.1, 1] araliginda
    maruziyetler.forEach((m) => {
      expect(m).toBeGreaterThanOrEqual(0.1);
      expect(m).toBeLessThanOrEqual(1);
    });
  });

  // Ek test: Tum degerler esitse 1 dondurur
  it('olcekleMaruziyet tum esit girdide 1 dondurur', () => {
    const esit = [5, 5, 5];
    const sonuc = olcekleMaruziyet(esit);
    expect(sonuc).toEqual([1, 1, 1]);
  });

  // TC-03: hesaplaRisk(0.70, 0.50) -> 0.35
  it('TC-03: hesaplaRisk(0.70, 0.50) -> 0.35', () => {
    expect(hesaplaRisk(0.7, 0.5)).toBeCloseTo(0.35);
  });

  // TC-04: Samlar'in riski 0'dan buyuk olmali (maruziyet alt siniri 0.1 sayesinde)
  it('TC-04: Samlar aykiri deger olsa da risk sifir olmaz', () => {
    // Samlar icin yogunluk 13 -> maruziyet 0.1
    const samlarMaruziyet = olcekleMaruziyet([13, 200, 300, 400, 500])[0];
    const samlarTehlike = hesaplaTehlike(
      MAHALLELER[0].yesilAlanOrani,
      MAHALLELER[0].binaYogunlugu
    ); // 0.1,0.8 -> 0.85
    const risk = hesaplaRisk(samlarTehlike, samlarMaruziyet);
    expect(risk).toBeGreaterThan(0);
    // tam deger: 0.85 * 0.1 = 0.085
    expect(risk).toBeCloseTo(0.085);
  });

  // TC-05: simuleYesilAlan, yesil oran yuzde puan artar
  it('TC-05: simuleYesilAlan ile yesil oran yuzde puan artar (+10 -> 0.30)', () => {
    const mahalle = {
      ad: 'Test',
      yesilAlanOrani: 0.2,
      binaYogunlugu: 0.6,
      maruziyet: 0.5,
    };
    const sonuc = simuleYesilAlan(mahalle, 10, 0.5);
    expect(sonuc.tehlike).toBeCloseTo(0.625); // 0.5*(1-0.3)+0.5*0.55 = 0.35+0.275=0.625
  });

  // TC-06: ayni simulasyonda bina yogunlugu azalir
  it('TC-06: simuleYesilAlan bina yogunlugunu dogru azaltir', () => {
    const mahalle = {
      ad: 'Test',
      yesilAlanOrani: 0.2,
      binaYogunlugu: 0.6,
      maruziyet: 0.5,
    };
    const sonuc = simuleYesilAlan(mahalle, 10, 0.5);
    // Bina yogunlugu 0.55 olmali, kontrol etmek icin yeniden hesaplayalim
    // Dogrudan bina degeri dondurulmedigi icin, tehlike uzerinden dolayli kontrol ediyoruz zaten.
    // Guvenilir olmasi icin baska bir test: yeni bina 0.55 ise tehlike=0.625 dogrulanir.
    expect(sonuc.tehlike).toBeCloseTo(0.625);
    // Risk de hesaplanmis olmali
    expect(sonuc.risk).toBeCloseTo(0.625 * 0.5);
  });

  // TC-07: Modul saf kalir, DOM veya ag gerektirmez
  it('TC-07: Fonksiyonlar saf ve sayisal girdi/cikti calisir', () => {
    // Herhangi bir fonksiyon cagrisi, node ortaminda hata vermez
    const t = hesaplaTehlike(0.2, 0.6);
    expect(typeof t).toBe('number');
    // Ikinci bir fonksiyon
    const r = hesaplaRisk(0.5, 0.5);
    expect(typeof r).toBe('number');
  });

  // TC-22: simuleNufus bir mahalle nufusu artinca tum maruziyetler degisir
  it('TC-22: simuleNufus bir mahalle nufus artisi tum maruziyetleri gunceller', () => {
    // Orijinal maruziyetler
    const orijinalYogunluklar = MAHALLELER.map((m) => m.nufus / m.alanKm2);
    const orijinalMaruziyet = olcekleMaruziyet(orijinalYogunluklar, 0.1);

    // Samlar (index 0) nufusunu %50 arttir
    const artisOrani = 0.5;
    const sonucSkorlar = simuleNufus(MAHALLELER, 0, artisOrani);

    // Maruziyetleri cek
    const yeniMaruziyet = sonucSkorlar.map((s) => s.maruziyet);

    // Uclar hala 0.1 ve 1 mi?
    const minYeni = Math.min(...yeniMaruziyet);
    const maxYeni = Math.max(...yeniMaruziyet);
    expect(minYeni).toBeCloseTo(0.1);
    expect(maxYeni).toBeCloseTo(1);

    // En az bir maruziyet degeri eski halinden farkli olmali
    const eslesmeSayisi = yeniMaruziyet.filter(
      (val, i) => Math.abs(val - orijinalMaruziyet[i]) < 1e-10
    ).length;
    // Tamami ayni kalmamali
    expect(eslesmeSayisi).toBeLessThan(yeniMaruziyet.length);
  });

  // TC-23: secBudceKisitli dogru indeksleri ve yuzdeyi verir
  it('TC-23: secBudceKisitli risk sirasina gore ilk 3 mahalleyi secer', () => {
    // Risk skorlari: 0.1, 0.5, 0.9, 0.3, 0.7 -> toplam 2.5
    const testSkorlar: Skorlar[] = [
      { ad: 'A', tehlike: 0.5, maruziyet: 0.2, risk: 0.1 },
      { ad: 'B', tehlike: 1, maruziyet: 0.5, risk: 0.5 },
      { ad: 'C', tehlike: 0.9, maruziyet: 1, risk: 0.9 },
      { ad: 'D', tehlike: 0.3, maruziyet: 1, risk: 0.3 },
      { ad: 'E', tehlike: 0.7, maruziyet: 1, risk: 0.7 },
    ];

    const { secilenler, kapsananRiskYuzdesi } = secBudceKisitli(testSkorlar, 3);

    // Risk siralamasi: 0.9 (indeks 2), 0.7 (indeks 4), 0.5 (indeks 1) -> secilenler [2,4,1]
    expect(secilenler).toEqual([2, 4, 1]);

    // Risk toplami 2.5, secilenler 0.9+0.7+0.5 = 2.1 -> %84
    expect(kapsananRiskYuzdesi).toBeCloseTo(84);
  });

  // Yeni testler: hata kontrolu
  it('olcekleMaruziyet([]) hata firlatmali', () => {
    expect(() => olcekleMaruziyet([])).toThrow();
  });

  it('hesaplaTehlike toplam agirlik 0 hatasi', () => {
    expect(() => hesaplaTehlike(0.5, 0.5, { yesilAlan: 0, binaYogunlugu: 0 })).toThrow();
  });

  it('simuleNufus gecersiz hedefIndex hata firlatmali', () => {
    expect(() => simuleNufus(MAHALLELER, 99, 0.5)).toThrow();
  });

  // Negatif n ile cagrildiginda hata firlatir (bilinen hata duzeltildi).
  it('secBudceKisitli negatif n ile hata firlatir', () => {
    const skorlar: Skorlar[] = [
      { ad: 'A', tehlike: 0.5, maruziyet: 0.5, risk: 0.25 },
      { ad: 'B', tehlike: 0.5, maruziyet: 0.5, risk: 0.5 },
      { ad: 'C', tehlike: 0.5, maruziyet: 0.5, risk: 0.75 },
    ];
    expect(() => secBudceKisitli(skorlar, -1)).toThrow();
  });

  // TC-22 guclendirilmis versiyon: test-plani "TUM mahallelerin maruziyet
  // degerleri yeniden olceklenir" der, "en az biri" degil. Bu test, min ve
  // max ucundaki mahalleler haric (bunlarin degeri matematiksel olarak 0.1/1
  // sabit kalabilir, cunku min/max ucun kendisi degismedi) ara degerlerin
  // gercekten degistigini VE elle hesaplanmis sabit beklenen degerlerle
  // eslestigini dogrular.
  it('TC-22 (guclendirilmis): ara mahallelerin maruziyeti sabit degerlerle dogrulanir', () => {
    const orijinalYogunluklar = MAHALLELER.map((m) => m.nufus / m.alanKm2);
    const orijinalMaruziyet = olcekleMaruziyet(orijinalYogunluklar, 0.1);

    const sonucSkorlar = simuleNufus(MAHALLELER, 0, 0.5);
    const yeniMaruziyet = sonucSkorlar.map((s) => s.maruziyet);

    // Ucta olmayan (indeks 1..8) elemanlar degismis olmali. Indeks 0 (min,
    // degisen taraf) ve 9 (max, degismeyen taraf) ayrica asagida elle kontrol
    // edilir; 9 icin deger matematiksel olarak ayni kalir (max degismedi).
    for (let i = 1; i < yeniMaruziyet.length - 1; i++) {
      expect(Math.abs(yeniMaruziyet[i] - orijinalMaruziyet[i])).toBeGreaterThan(1e-9);
    }

    // Elle hesaplama: Samlar nufusu 13 -> 19.5 (indeks 0), digerleri sabit.
    // yogunluklar = [19.5, 200, 300, ..., 1000], min=19.5, max=1000, aralik=980.5
    // maruziyet_i = 0.1 + 0.9 * (x - 19.5) / 980.5
    expect(yeniMaruziyet[0]).toBeCloseTo(0.1); // Samlar hala minimumda
    expect(yeniMaruziyet[9]).toBeCloseTo(1); // Ornek Mahalle 9 hala maksimumda (max degismedi)
    expect(yeniMaruziyet[1]).toBeCloseTo(0.1 + 0.9 * ((200 - 19.5) / 980.5)); // ~0.2657
  });
});
