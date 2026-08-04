/**
 * ARC-04: Skor Modulu
 *
 * Tehlike = agirlikli ortalama((1 - yesilAlanOrani), binaYogunlugu)
 * Maruziyet = min-max olceklenmis nufus yogunlugu, alt sinir 0.1
 * Risk = Tehlike * Maruziyet
 *
 * Tum fonksiyonlar saf (pure) olup dis dunyaya (DOM, ag, dosya) erismez.
 * Tanimlayicilar ASCII Turkce kelimeler kullanir.
 */

export interface TehlikeAgirliklari {
  /** yesil alan eksikligine verilen agirlik (varsayilan 0.5) */
  yesilAlan: number;
  /** bina yogunluguna verilen agirlik (varsayilan 0.5) */
  binaYogunlugu: number;
}

export interface MahalleGirdi {
  ad: string;
  /** 0..1 arasi */
  yesilAlanOrani: number;
  /** 0..1 arasi */
  binaYogunlugu: number;
  /** mahalle nufusu */
  nufus: number;
  /** km2 cinsinden mahalle yuzolcumu */
  alanKm2: number;
}

export interface Skorlar {
  ad: string;
  tehlike: number;
  maruziyet: number;
  risk: number;
}

/**
 * Tehlike skorunu hesaplar.
 * Formul: (wYesil * (1 - yesilAlanOrani) + wBina * binaYogunlugu) / (wYesil + wBina)
 * Varsayilan agirliklar (0.5, 0.5) ile duz aritmetik ortalama olur.
 */
export function hesaplaTehlike(
  yesilAlanOrani: number,
  binaYogunlugu: number,
  agirliklar: TehlikeAgirliklari = { yesilAlan: 0.5, binaYogunlugu: 0.5 }
): number {
  const { yesilAlan: wYesil, binaYogunlugu: wBina } = agirliklar;
  const pay = wYesil * (1 - yesilAlanOrani) + wBina * binaYogunlugu;
  const payda = wYesil + wBina;
  if (payda === 0) {
    throw new Error('hesaplaTehlike: agirliklar toplami sifir olamaz');
  }
  return pay / payda;
}

/**
 * Nufus yogunluklarini min-max olcekleme ile [altSinir, 1] araligina ceker.
 * En dusuk yogunluk altSinir'i, en yuksek yogunluk 1'i alir.
 * Eger tum degerler ayni ise (max === min), fark yaratacak bilgi olmadigi icin
 * tum elemanlara 1 atanir.
 */
export function olcekleMaruziyet(
  nufusYogunluklari: number[],
  altSinir: number = 0.1
): number[] {
  if (nufusYogunluklari.length === 0) {
    throw new Error('olcekleMaruziyet: bos dizi ile cagrilamaz');
  }
  const min = Math.min(...nufusYogunluklari);
  const max = Math.max(...nufusYogunluklari);

  if (max === min) {
    // Tum degerler esit, bilgi yok; her biri en yuksek maruziyeti (1) alir
    return nufusYogunluklari.map(() => 1);
  }

  const aralik = max - min;
  return nufusYogunluklari.map((x) => altSinir + (1 - altSinir) * ((x - min) / aralik));
}

/**
 * Risk = Tehlike * Maruziyet
 */
export function hesaplaRisk(tehlike: number, maruziyet: number): number {
  return tehlike * maruziyet;
}

/**
 * Yesil alan arttirimi simulasyonu.
 * artisPuani yuzde puan cinsinden verilir: yesilAlanOrani += artisPuani/100
 * Bina yogunlugu buna karsilik katsayi * (artisPuani/100) kadar azalir.
 * Her iki deger [0,1] araligina sikistirilir.
 * Maruziyet degismez.
 */
export function simuleYesilAlan(
  mahalle: {
    ad: string;
    yesilAlanOrani: number;
    binaYogunlugu: number;
    maruziyet: number;
    agirliklar?: TehlikeAgirliklari;
  },
  artisPuani: number,
  katsayi: number
): Skorlar {
  const delta = artisPuani / 100;
  const yeniYesil = Math.min(Math.max(mahalle.yesilAlanOrani + delta, 0), 1);
  const yeniBina = Math.min(Math.max(mahalle.binaYogunlugu - delta * katsayi, 0), 1);

  const agirliklar = mahalle.agirliklar ?? { yesilAlan: 0.5, binaYogunlugu: 0.5 };
  const yeniTehlike = hesaplaTehlike(yeniYesil, yeniBina, agirliklar);
  const yeniRisk = hesaplaRisk(yeniTehlike, mahalle.maruziyet);

  return {
    ad: mahalle.ad,
    tehlike: yeniTehlike,
    maruziyet: mahalle.maruziyet,
    risk: yeniRisk,
  };
}

/**
 * Nufus degisimi simulasyonu.
 * Tek bir mahallenin nufusu artar; tum mahallelerin maruziyetleri
 * yeniden hesaplanir. Tehlike degerleri nufustan etkilenmez.
 * Girdi sirasi korunur.
 */
export function simuleNufus(
  mahalleler: MahalleGirdi[],
  hedefIndex: number,
  artisOrani: number,
  agirliklar: TehlikeAgirliklari = { yesilAlan: 0.5, binaYogunlugu: 0.5 },
  altSinir: number = 0.1
): Skorlar[] {
  if (hedefIndex < 0 || hedefIndex >= mahalleler.length) {
    throw new Error('simuleNufus: hedefIndex mahalle dizisinin sinirlari disinda');
  }
  // a) Hedef mahallenin nufusunu arttir
  const yeniNufuslar = mahalleler.map((m, i) =>
    i === hedefIndex ? m.nufus * (1 + artisOrani) : m.nufus
  );

  // b) Nufus yogunlugu hesapla
  const yogunluklar = mahalleler.map(
    (m, i) => yeniNufuslar[i] / m.alanKm2
  );

  // c) Maruziyetleri olcekle
  const maruziyetler = olcekleMaruziyet(yogunluklar, altSinir);

  // d) Her mahalle icin tehlike (sabit)
  // e) Risk = tehlike * maruziyet
  return mahalleler.map((m, i) => {
    const tehlike = hesaplaTehlike(m.yesilAlanOrani, m.binaYogunlugu, agirliklar);
    const maruziyet = maruziyetler[i];
    return {
      ad: m.ad,
      tehlike,
      maruziyet,
      risk: hesaplaRisk(tehlike, maruziyet),
    };
  });
}

/**
 * Butce kisiti altinda en riskli n mahalleyi secer.
 * Mahalleler risk skoruna gore azalan sirada siralanir,
 * ilk n tanesinin orijinal index'leri ve kapsadiklari risk yuzdesi dondurulur.
 * n mahalle sayisindan fazlaysa tum mahalleler secilir.
 */
export function secBudceKisitli(
  mahalleler: Skorlar[],
  n: number
): { secilenler: number[]; kapsananRiskYuzdesi: number } {
  if (n < 0) {
    throw new Error('secBudceKisitli: n negatif olamaz');
  }

  // Orijinal indexleri ile birlikte kopyala
  const indeksli = mahalleler.map((m, i) => ({ ...m, orijinalIndex: i }));

  // Risk azalan sirada sirala
  indeksli.sort((a, b) => b.risk - a.risk);

  // Secilecek sayi, mevcut mahalleden fazla olamaz
  const secilecek = Math.min(n, mahalleler.length);
  const secilenler = indeksli.slice(0, secilecek).map((item) => item.orijinalIndex);

  const toplamRisk = mahalleler.reduce((toplam, m) => toplam + m.risk, 0);
  const secilenRiskToplam = secilenler.reduce((toplam, idx) => toplam + mahalleler[idx].risk, 0);

  const kapsananRiskYuzdesi = toplamRisk === 0 ? 0 : (secilenRiskToplam / toplamRisk) * 100;

  return { secilenler, kapsananRiskYuzdesi };
}

/**
 * hesaplaTehlike fonksiyonunun cebirsel tersi.
 * Verilen bir hedef tehlike skoru ve sabit bina yogunlugu icin,
 * o tehlikeyi saglayacak yesil alan oranini (y) cozer.
 *
 * Ileri formül: hedefTehlike = (wYesil*(1-y) + wBina*binaYogunlugu) / (wYesil+wBina)
 * Cozulen: y = 1 - (hedefTehlike*(wYesil+wBina) - wBina*binaYogunlugu) / wYesil
 *
 * @param hedefTehlike - ulasilmak istenen tehlike skoru
 * @param binaYogunlugu - projenin sabit bina yogunlugu
 * @param agirliklar - tehlike agirliklari (varsayilan { yesilAlan: 0.5, binaYogunlugu: 0.5 })
 * @returns GerekliYesilAlanSonucu: mumkun ve gerekliYesilAlanOrani (mumkun degilse null)
 * @throws wYesil === 0 hatasi
 */
export interface GerekliYesilAlanSonucu {
  mumkun: boolean;
  gerekliYesilAlanOrani: number | null;
}

export function hesaplaGerekliYesilAlanOrani(
  hedefTehlike: number,
  binaYogunlugu: number,
  agirliklar: TehlikeAgirliklari = { yesilAlan: 0.5, binaYogunlugu: 0.5 }
): GerekliYesilAlanSonucu {
  const { yesilAlan: wYesil, binaYogunlugu: wBina } = agirliklar;
  if (wYesil === 0) {
    throw new Error('hesaplaGerekliYesilAlanOrani: yesil alan agirligi sifirken bu hesap yapilamaz');
  }

  const y = 1 - (hedefTehlike * (wYesil + wBina) - wBina * binaYogunlugu) / wYesil;

  if (y > 1) {
    return { mumkun: false, gerekliYesilAlanOrani: null };
  }
  return { mumkun: true, gerekliYesilAlanOrani: Math.max(0, y) };
}

/**
 * Mevcut nufus yogunluk listesine yeni bir mahalle yogunlugu ekler,
 * tum diziyi olcekleMaruziyet ile yeniden olcekler ve YALNIZCA
 * eklenen yeni elemanin (son eleman) maruziyet degerini dondurur.
 *
 * @param mevcutYogunluklar - mevcut mahallelerin yogunluklari (bos olabilir)
 * @param yeniYogunluk - eklenecek yeni mahallenin yogunlugu
 * @param altSinir - olceklemede kullanilacak alt sinir (varsayilan 0.1)
 * @returns yeni elemanin olceklenmis maruziyeti
 */
export function maruziyetYeniMahalleyleHesapla(
  mevcutYogunluklar: number[],
  yeniYogunluk: number,
  altSinir: number = 0.1
): number {
  const genisletilmis = [...mevcutYogunluklar, yeniYogunluk];
  const olceklenmis = olcekleMaruziyet(genisletilmis, altSinir);
  return olceklenmis[olceklenmis.length - 1];
}

export interface HedefTehlikeCozumSonucu {
  /** hedefTehlike'ye ulasilabilir mi (clamp'ler nedeniyle imkansiz olabilir) */
  mumkun: boolean;
  /** yuzde puan cinsinden (simuleYesilAlan'in artisPuani parametresiyle AYNI birim),
   * HAM/yuvarlanmamis. mumkun=false ise null. */
  gerekliArtisPuani: number | null;
}

/**
 * simuleYesilAlan'in CEBIRSEL TERSI. Verilen bir hedef tehlike skoruna ulasmak icin
 * gereken MINIMUM yesil alan artis puanini (d) bulur; simuleYesilAlan'daki AYNI iki
 * clamp'i (yeniYesil <= 1, yeniBina >= 0) ve AYNI katsayi baglantisini kullanir, yeni
 * bir varsayim eklemez. tehlike(delta) parcali-dogrusal ve delta'da monoton azalandir
 * (katsayi >= 0 varsayimiyla); bu fonksiyon kirilim noktalarini (yesil orani 1'e, bina
 * yogunlugu 0'a doydugu delta degerlerini) bulup dogru segmentte lineer denklemi cozer.
 *
 * Mevcut (delta=0) tehlike zaten hedefTehlike'nin altinda/esitse mumkun=true,
 * gerekliArtisPuani=0 doner (cagiran taraf bunu ayrica "zaten hedefte" olarak
 * yorumlayabilir).
 */
export function hesaplaGerekliArtisPuani(
  mahalle: { yesilAlanOrani: number; binaYogunlugu: number },
  hedefTehlike: number,
  katsayi: number,
  agirliklar: TehlikeAgirliklari = { yesilAlan: 0.5, binaYogunlugu: 0.5 }
): HedefTehlikeCozumSonucu {
  const { yesilAlan: wYesil, binaYogunlugu: wBina } = agirliklar;
  const payda = wYesil + wBina;
  if (payda === 0) {
    throw new Error('hesaplaGerekliArtisPuani: agirliklar toplami sifir olamaz');
  }

  const y0 = mahalle.yesilAlanOrani;
  const b0 = mahalle.binaYogunlugu;

  const tehlikeAtDelta = (delta: number): number => {
    const yeniYesil = Math.min(Math.max(y0 + delta, 0), 1);
    const yeniBina = Math.min(Math.max(b0 - delta * katsayi, 0), 1);
    return hesaplaTehlike(yeniYesil, yeniBina, agirliklar);
  };

  const baselineTehlike = tehlikeAtDelta(0);
  if (baselineTehlike <= hedefTehlike) {
    return { mumkun: true, gerekliArtisPuani: 0 };
  }

  // Kirilim noktalari: yesil orani 1'e, bina yogunlugu 0'a doydugu delta degerleri.
  const bpYesil = Math.max(0, 1 - y0);
  const bpBina = katsayi > 0 ? Math.max(0, b0 / katsayi) : Infinity;

  const kirilimlar = [...new Set([0, bpYesil, bpBina].filter((d) => Number.isFinite(d)))].sort(
    (a, b) => a - b
  );

  for (let i = 0; i < kirilimlar.length; i++) {
    const dStart = kirilimlar[i];
    const dEnd = i + 1 < kirilimlar.length ? kirilimlar[i + 1] : Infinity;
    if (dEnd <= dStart) continue;

    const tehlikeStart = tehlikeAtDelta(dStart);
    if (tehlikeStart <= hedefTehlike) {
      return { mumkun: true, gerekliArtisPuani: dStart * 100 };
    }

    const yesilAktif = dStart < bpYesil;
    const binaAktif = dStart < bpBina;
    const egim = -(wYesil * (yesilAktif ? 1 : 0) + wBina * katsayi * (binaAktif ? 1 : 0)) / payda;

    if (egim === 0) {
      continue;
    }

    const dCozum = dStart + (hedefTehlike - tehlikeStart) / egim;

    if (dCozum <= dEnd + 1e-9) {
      return { mumkun: true, gerekliArtisPuani: dCozum * 100 };
    }
  }

  return { mumkun: false, gerekliArtisPuani: null };
}
