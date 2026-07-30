/**
 * ARC-04 eklenti: Uygulama-seviyesi skor hesaplama yardimcisi.
 *
 * Bu modul, skor.ts'deki temel fonksiyonlari kullanarak:
 * - Tum mahallelerin mevcut risk skorlarini hesaplar,
 * - Tek bir mahallenin projeksiyon nufusuna gore riskini hesaplar,
 * - En yuksek tehlike ve en yuksek risk sahibi mahallelerin farkli olup olmadigini tespit eder.
 */

import { hesaplaTehlike, olcekleMaruziyet, hesaplaRisk, simuleNufus } from './skor';
import type { TehlikeAgirliklari, MahalleGirdi } from './skor';

export interface MahalleVeri {
  ad: string;
  yesilAlanOrani: number;
  binaYogunlugu: number;
  nufus: number;
  zarfAlanKm2: number;
}

export interface SkorAyarlari {
  tehlike_agirliklari: { yesil_alan: number; bina_yogunlugu: number };
  maruziyet_alt_siniri: number;
}

export interface MahalleSkoru {
  ad: string;
  yesilAlanOrani: number;
  binaYogunlugu: number;
  nufus: number;
  zarfAlanKm2: number;
  tehlike: number;
  maruziyet: number;
  risk: number;
}

/**
 * Tum mahalleler icin MEVCUT DURUM skorlarini hesaplar (simulasyon uygulanmamis).
 * Yogunluk = nufus / zarfAlanKm2 (REQ-F-24, alan_km2 DEGIL).
 */
export function hesaplaMevcutSkorlar(mahalleler: MahalleVeri[], ayarlar: SkorAyarlari): MahalleSkoru[] {
  if (mahalleler.length === 0) {
    return [];
  }

  const yogunluklar = mahalleler.map((m) => m.nufus / m.zarfAlanKm2);
  const maruziyetler = olcekleMaruziyet(yogunluklar, ayarlar.maruziyet_alt_siniri);

  const agirliklar: TehlikeAgirliklari = {
    yesilAlan: ayarlar.tehlike_agirliklari.yesil_alan,
    binaYogunlugu: ayarlar.tehlike_agirliklari.bina_yogunlugu,
  };

  return mahalleler.map((m, i) => {
    const tehlike = hesaplaTehlike(m.yesilAlanOrani, m.binaYogunlugu, agirliklar);
    const maruziyet = maruziyetler[i];
    const risk = hesaplaRisk(tehlike, maruziyet);
    return {
      ad: m.ad,
      yesilAlanOrani: m.yesilAlanOrani,
      binaYogunlugu: m.binaYogunlugu,
      nufus: m.nufus,
      zarfAlanKm2: m.zarfAlanKm2,
      tehlike,
      maruziyet,
      risk,
    };
  });
}

export interface ProjeksiyonRiski {
  tehlike: number;
  maruziyet: number;
  risk: number;
}

/**
 * TEK bir mahallenin, verilen bir projeksiyon nufusuna gore RISK SKORUNU hesaplar
 * (REQ-F-22) - sadece nufus projeksiyonunu degil, o projeksiyondan turetilen risk
 * skorunu da uretmek bu fonksiyonun amaci. Diger mahallelerin nufusu SABIT tutulur,
 * sadece hedefIndex'teki mahallenin nufusu projeksiyonNufus'a degistirilir, sonra TUM
 * mahallelerin maruziyetleri bu yeni durumla yeniden olceklenir (skor.ts'in
 * simuleNufus'unun zaten yaptigi is), ve hedefIndex'teki sonuc dondurulur.
 */
export function hesaplaProjeksiyonRiski(
  mahalleler: MahalleVeri[],
  hedefIndex: number,
  projeksiyonNufus: number,
  ayarlar: SkorAyarlari
): ProjeksiyonRiski {
  if (hedefIndex < 0 || hedefIndex >= mahalleler.length) {
    throw new Error('hesaplaProjeksiyonRiski: hedefIndex mahalle dizisinin sinirlari disinda');
  }

  const mevcutNufus = mahalleler[hedefIndex].nufus;
  const artisOrani = mevcutNufus === 0 ? 0 : (projeksiyonNufus / mevcutNufus) - 1;

  const mahalleGirdiListesi: MahalleGirdi[] = mahalleler.map((m) => ({
    ad: m.ad,
    yesilAlanOrani: m.yesilAlanOrani,
    binaYogunlugu: m.binaYogunlugu,
    nufus: m.nufus,
    alanKm2: m.zarfAlanKm2, // REQ-F-24: zarf_alan_km2 kullanilir
  }));

  const agirliklar: TehlikeAgirliklari = {
    yesilAlan: ayarlar.tehlike_agirliklari.yesil_alan,
    binaYogunlugu: ayarlar.tehlike_agirliklari.bina_yogunlugu,
  };

  const simuleSonuclar = simuleNufus(mahalleGirdiListesi, hedefIndex, artisOrani, agirliklar, ayarlar.maruziyet_alt_siniri);
  const hedefSonuc = simuleSonuclar[hedefIndex];

  return {
    tehlike: hedefSonuc.tehlike,
    maruziyet: hedefSonuc.maruziyet,
    risk: hedefSonuc.risk,
  };
}

export interface TehlikeRiskUyusmazligi {
  uyusmuyor: boolean;
  enYuksekTehlikeAd: string | null;
  enYuksekRiskAd: string | null;
}

/**
 * REQ-F-12: en yuksek TEHLIKEYE sahip mahalle ile en yuksek RISKE sahip mahalle
 * farkliysa bunu tespit eder (kullanicaya oncelik listesinde vurgulanmasi icin).
 * Bunlar farkli olabilir cunku risk = tehlike * maruziyet; dusuk nufuslu ama yuksek
 * tehlikeli bir mahalle, yuksek nufuslu orta-tehlikeli bir mahalleden daha az risk
 * alabilir.
 */
export function tehlikeRiskUyusmazliginiBul(skorlar: MahalleSkoru[]): TehlikeRiskUyusmazligi {
  if (skorlar.length === 0) {
    return { uyusmuyor: false, enYuksekTehlikeAd: null, enYuksekRiskAd: null };
  }

  let enYuksekTehlike = skorlar[0].tehlike;
  let enYuksekTehlikeAd = skorlar[0].ad;
  let enYuksekRisk = skorlar[0].risk;
  let enYuksekRiskAd = skorlar[0].ad;

  for (let i = 1; i < skorlar.length; i++) {
    const s = skorlar[i];
    if (s.tehlike > enYuksekTehlike) {
      enYuksekTehlike = s.tehlike;
      enYuksekTehlikeAd = s.ad;
    }
    if (s.risk > enYuksekRisk) {
      enYuksekRisk = s.risk;
      enYuksekRiskAd = s.ad;
    }
  }

  return { uyusmuyor: enYuksekTehlikeAd !== enYuksekRiskAd, enYuksekTehlikeAd, enYuksekRiskAd };
}

/**
 * Verilen hucreler icin hesaplaTehlike ciktilarini hesaplar,
 * ayni sirada sayi dizisi dondurur.
 */
export function hesaplaHucreTehlikeleri(
  hucreler: { yesil_alan_orani: number; bina_yogunlugu: number }[],
  agirliklar: TehlikeAgirliklari
): number[] {
  return hucreler.map((h) =>
    hesaplaTehlike(h.yesil_alan_orani, h.bina_yogunlugu, agirliklar)
  );
}
