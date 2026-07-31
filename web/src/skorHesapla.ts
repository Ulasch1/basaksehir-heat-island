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
import type { MahalleSinir } from './veriKaynagi';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

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

/**
 * Yesil alan simulasyonu SADECE secili mahallenin riskini degistirir, digerleri
 * baseline'da sabit kalir. Bu fonksiyon secili mahallenin yeni riskini mevcutSkorlar
 * dizisine uygulayip, risk azalan sirada yeniden siraladiginda secili mahallenin
 * yeni sirasini (1-indexed) dondurur.
 */
export function hesaplaSimuleRank(
  mevcutSkorlar: MahalleSkoru[],
  seciliAd: string,
  yeniRisk: number
): number | null {
  const guncellenmis = mevcutSkorlar.map((s) =>
    s.ad === seciliAd ? { ...s, risk: yeniRisk } : s
  );
  const sirali = [...guncellenmis].sort((a, b) => b.risk - a.risk);
  const idx = sirali.findIndex((s) => s.ad === seciliAd);
  return idx >= 0 ? idx + 1 : null;
}

/**
 * Yesil alan artisi simulasyonunu HUCRE DUZEYINDE uygular: eklenen yesil alan
 * TUM hucrelere esit dagitilmaz, en yuksek tehlikeli (en "kirmizi") hucrelere
 * oncelik verilir (gercekci mudahale senaryosu: en kotu yerler once iyilesir).
 * Hucreler esit agirlikli kabul edilir (her hucre = 1 birim), gercek m2 alani
 * veri semasinda yok.
 *
 * Mantik:
 * 1. delta = artisPuani / 100
 * 2. butce = delta * hucreler.length (toplam "yesillendirme butcesi", hucre-birimi)
 * 3. Hucreler BASELINE tehlikelerine gore AZALAN sirada siralanir (en kirmizi once),
 *    orijinal index korunur.
 * 4. Sirali listede gezilir: ihtiyac = 1 - yesil_alan_orani, alinan = min(ihtiyac,
 *    kalanButce), yeniYesil = yesil_alan_orani + alinan,
 *    yeniBina = max(0, bina_yogunlugu - katsayi * alinan), kalanButce -= alinan.
 *    Butce biterse (kalanButce <= 0) kalan (daha az kirmizi) hucreler DEGISMEDEN kalir.
 * 5. Her hucre icin yeni tehlike hesaplaTehlike(yeniYesil, yeniBina, agirliklar) ile
 *    hesaplanir.
 * 6. Sonuc ORIJINAL sirada (girdi dizisiyle ayni index sirasinda) dondurulur; siralama
 *    sadece dahili islem icindir, cikti sirasi bozulmaz.
 *
 * artisPuani === 0 ise tum hucreler DEGISMEDEN (baseline tehlike ile) doner.
 */
export function simuleHucreYesillestirme(
  hucreler: { yesil_alan_orani: number; bina_yogunlugu: number }[],
  artisPuani: number,
  katsayi: number,
  agirliklar: TehlikeAgirliklari
): { yesil_alan_orani: number; bina_yogunlugu: number; tehlike: number }[] {
  if (hucreler.length === 0) return [];

  if (artisPuani === 0) {
    return hucreler.map((h) => ({
      yesil_alan_orani: h.yesil_alan_orani,
      bina_yogunlugu: h.bina_yogunlugu,
      tehlike: hesaplaTehlike(h.yesil_alan_orani, h.bina_yogunlugu, agirliklar),
    }));
  }

  const delta = artisPuani / 100;
  let kalanButce = delta * hucreler.length;

  const baselineTehlikeler = hucreler.map((h) =>
    hesaplaTehlike(h.yesil_alan_orani, h.bina_yogunlugu, agirliklar)
  );

  const indeksli = hucreler.map((h, i) => ({ ...h, orijinalIndex: i, baseline: baselineTehlikeler[i] }));
  indeksli.sort((a, b) => b.baseline - a.baseline);

  const sonuc: { yesil_alan_orani: number; bina_yogunlugu: number; tehlike: number }[] =
    new Array(hucreler.length);

  for (const h of indeksli) {
    let yeniYesil = h.yesil_alan_orani;
    let yeniBina = h.bina_yogunlugu;
    if (kalanButce > 0) {
      const ihtiyac = 1 - h.yesil_alan_orani;
      const alinan = Math.min(ihtiyac, kalanButce);
      yeniYesil = h.yesil_alan_orani + alinan;
      yeniBina = Math.max(0, h.bina_yogunlugu - katsayi * alinan);
      kalanButce -= alinan;
    }
    sonuc[h.orijinalIndex] = {
      yesil_alan_orani: yeniYesil,
      bina_yogunlugu: yeniBina,
      tehlike: hesaplaTehlike(yeniYesil, yeniBina, agirliklar),
    };
  }

  return sonuc;
}

export type SiralamaModu = 'risk' | 'yesil' | 'bina';

export function siralaOncelikListesi(
  mevcutSkorlar: MahalleSkoru[],
  mod: SiralamaModu
): MahalleSkoru[] {
  const kopya = [...mevcutSkorlar];
  if (mod === 'risk') {
    return kopya.sort((a, b) => b.risk - a.risk);
  }
  if (mod === 'yesil') {
    return kopya.sort((a, b) => (1 - b.yesilAlanOrani) - (1 - a.yesilAlanOrani));
  }
  return kopya.sort((a, b) => b.binaYogunlugu - a.binaYogunlugu);
}

export interface OncelikCsvSatiri {
  sira: number;
  mahalle: string;
  tehlike: string;
  maruziyet: string;
  risk: string;
  tipoloji: string;
  guncel_mi: string;
}

export function oncelikCsvSatirlariOlustur(
  siraliSkorlar: MahalleSkoru[],
  tipolojiByAd: Record<string, number>,
  tipolojiEslemesi: Record<string, { etiket: string; mudahale: string }>,
  tipolojiGuncelDegil: boolean
): OncelikCsvSatiri[] {
  return siraliSkorlar.map((s, i) => {
    const tipolojiIndeks = tipolojiByAd[s.ad];
    const tipolojiEtiket =
      tipolojiIndeks != null ? (tipolojiEslemesi[String(tipolojiIndeks)]?.etiket ?? '') : '';
    return {
      sira: i + 1,
      mahalle: s.ad,
      tehlike: s.tehlike.toFixed(3),
      maruziyet: s.maruziyet.toFixed(3),
      risk: s.risk.toFixed(3),
      tipoloji: tipolojiEtiket,
      guncel_mi: tipolojiGuncelDegil ? 'hayir' : 'evet',
    };
  });
}

function csvAlaniTirnakla(deger: string): string {
  return `"${deger.replace(/"/g, '""')}"`;
}

export function oncelikCsvMetniOlustur(satirlar: OncelikCsvSatiri[]): string {
  const baslik = 'sira,mahalle,tehlike,maruziyet,risk,tipoloji,guncel_mi';
  const govde = satirlar.map((s) =>
    [
      s.sira,
      csvAlaniTirnakla(s.mahalle),
      s.tehlike,
      s.maruziyet,
      s.risk,
      csvAlaniTirnakla(s.tipoloji),
      s.guncel_mi,
    ].join(',')
  );
  return [baslik, ...govde].join('\n');
}

export function izgaraGeoJsonOlustur(
  hucreler: { sinir: MahalleSinir }[],
  hucreOzellikleri: { yesil_alan_orani: number; bina_yogunlugu: number; tehlike: number }[],
  simulasyonAktif: boolean
): FeatureCollection {
  const features: Feature[] = hucreler.map((h, i) => ({
    type: 'Feature' as const,
    geometry: h.sinir as unknown as Geometry,
    properties: {
      yesil_alan_orani: hucreOzellikleri[i].yesil_alan_orani,
      bina_yogunlugu: hucreOzellikleri[i].bina_yogunlugu,
      tehlike: hucreOzellikleri[i].tehlike,
      simulasyon_aktif: simulasyonAktif,
    },
  }));
  return { type: 'FeatureCollection', features };
}
