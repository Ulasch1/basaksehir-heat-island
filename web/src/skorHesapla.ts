/**
 * ARC-04 eklenti: Uygulama-seviyesi skor hesaplama yardimcisi.
 *
 * Bu modul, skor.ts'deki temel fonksiyonlari kullanarak:
 * - Tum mahallelerin mevcut risk skorlarini hesaplar,
 * - Tek bir mahallenin projeksiyon nufusuna gore riskini hesaplar,
 * - En yuksek tehlike ve en yuksek risk sahibi mahallelerin farkli olup olmadigini tespit eder.
 */

import { hesaplaTehlike, olcekleMaruziyet, hesaplaRisk, simuleNufus, hesaplaGerekliYesilAlanOrani, maruziyetYeniMahalleyleHesapla } from './skor';
import type { TehlikeAgirliklari, MahalleGirdi } from './skor';
import type { MahalleSinir, BaglamSite } from './veriKaynagi';
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

export interface TipolojiEtiketleme {
  etiket: string;
  mudahale: string;
}

/**
 * AI kumeleme servisinin dondurdugu tipoloji index'i (0, 1, 2, ...) SEMANTIK
 * OLARAK SABIT DEGILDIR - hangi index'in "yogun yapili" karaktere denk gelecegi
 * veri setine ve KMeans'in ic isleyisine bagli, garanti edilmis bir sira yok.
 * Bu fonksiyon index'in SAYISAL DEGERINE degil, o index'e atanan mahallelerin
 * GERCEK bina yogunlugu ORTALAMASINA bakar, kumeleri bu ortalamaya gore
 * (dusukten yuksege) siralar ve etiket/mudahale metnini bu SIRAYA gore esler.
 * Boylece AI hangi index'i hangi gruba verirse versin, en dusuk yogunluklu
 * grup her zaman siralamaDusuktenYuksege[0]'i alir. Canli AI ve statik yedek
 * veri (kume merkezi bilgisi hic saklanmayan onbellek) icin AYNI mantikla
 * calisir, cunku hesaplama sunucunun merkez bilgisine degil, zaten elde olan
 * mahalle yogunluk verisine dayanir.
 *
 * Gozlenen farkli index sayisi ile siralamaDusuktenYuksege.length uyusmuyorsa
 * (ornegin bir kume bu veri diliminde hic mahalle almadiysa) fazla index'ler
 * esleme almadan atlanir; UI tarafi zaten "esleme bulunamadi" durumunu
 * (etiket = undefined) destekliyor.
 */
export function tipolojiEtiketEslemesiTure(
  tipolojiSonuclari: { ad: string; tipoloji: number }[],
  mahalleVerileri: { ad: string; binaYogunlugu: number }[],
  siralamaDusuktenYuksege: TipolojiEtiketleme[]
): Record<string, TipolojiEtiketleme> {
  const binaYogunluguByAd = new Map(mahalleVerileri.map((m) => [m.ad, m.binaYogunlugu]));

  const toplamByIndex = new Map<number, { toplam: number; sayi: number }>();
  for (const s of tipolojiSonuclari) {
    const binaYogunlugu = binaYogunluguByAd.get(s.ad);
    if (binaYogunlugu === undefined) continue;
    const mevcut = toplamByIndex.get(s.tipoloji) ?? { toplam: 0, sayi: 0 };
    mevcut.toplam += binaYogunlugu;
    mevcut.sayi += 1;
    toplamByIndex.set(s.tipoloji, mevcut);
  }

  const ortalamaByIndex = [...toplamByIndex.entries()].map(([index, { toplam, sayi }]) => ({
    index,
    ortalamaBinaYogunlugu: toplam / sayi,
  }));
  ortalamaByIndex.sort((a, b) => a.ortalamaBinaYogunlugu - b.ortalamaBinaYogunlugu);

  const esleme: Record<string, TipolojiEtiketleme> = {};
  ortalamaByIndex.forEach((item, sira) => {
    const etiketleme = siralamaDusuktenYuksege[sira];
    if (etiketleme) {
      esleme[String(item.index)] = etiketleme;
    }
  });

  return esleme;
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
 * Verilen bir hücre tehlikesi ve tüm hücre tehlikeleri dizisi ile hücrenin
 * yüzdelik dilimini hesaplar: hücrenin tehlikesi, tüm tehlikelerin yüzde
 * kaçına eşit veya büyüktür (daha yüksek tehlikeli hücre sayısına göre).
 * Boş dizi için null döner.
 */
export function hucreTehlikeYuzdelikDilimiHesapla(
  hucreTehlike: number,
  tumHucreTehlikeleri: number[]
): number | null {
  if (tumHucreTehlikeleri.length === 0) return null;
  const ustSayisi = tumHucreTehlikeleri.filter((t) => t >= hucreTehlike).length;
  return (ustSayisi / tumHucreTehlikeleri.length) * 100;
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

export function hucreBazliMahalleSkoruHesapla(
  hucreOzellikleri: { yesil_alan_orani: number; bina_yogunlugu: number }[],
  maruziyet: number,
  agirliklar: TehlikeAgirliklari
): { tehlike: number; maruziyet: number; risk: number } | null {
  if (hucreOzellikleri.length === 0) return null;
  const ortalamaYesil =
    hucreOzellikleri.reduce((toplam, h) => toplam + h.yesil_alan_orani, 0) / hucreOzellikleri.length;
  const ortalamaBina =
    hucreOzellikleri.reduce((toplam, h) => toplam + h.bina_yogunlugu, 0) / hucreOzellikleri.length;
  const tehlike = hesaplaTehlike(ortalamaYesil, ortalamaBina, agirliklar);
  const risk = hesaplaRisk(tehlike, maruziyet);
  return { tehlike, maruziyet, risk };
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

export interface TermalStresEsikleri {
  tehlike: number;
  maruziyet: number;
}

export type BaskinBilesen = 'bina_yogunlugu' | 'yesil_alan_eksikligi';

export function hucreBaskinBileseniBelirle(
  yesilAlanOrani: number,
  binaYogunlugu: number,
  agirliklar: TehlikeAgirliklari
): BaskinBilesen {
  const yesilKatkisi = agirliklar.yesilAlan * (1 - yesilAlanOrani);
  const binaKatkisi = agirliklar.binaYogunlugu * binaYogunlugu;
  return binaKatkisi > yesilKatkisi ? 'bina_yogunlugu' : 'yesil_alan_eksikligi';
}

/**
 * Senaryo 3 (Termal Stres ve Nüfus Baskısı): seçili ızgara hücresinin tehlikesi VE
 * seçili mahallenin maruziyeti (nüfus baskısı) birlikte eşik/üzerindeyse dinamik bir
 * mikro-müdahale önerisi metni döner, aksi halde null döner. Sınırda eşitlik (>=) de
 * öneri tetikler. hucreTehlike ve maruziyet farklı bir düzlemden geliyor olsa bile
 * (hücre vs mahalle) bu fonksiyon sadece iki sayı ve iki eşik karşılaştırır, kaynak
 * bilmez - çağıran taraf (App.tsx) hangi hücre/mahalle olduğunu seçer.
 */
export function hucreTermalStresOnerisiBelirle(
  hucreTehlike: number,
  maruziyet: number,
  yesilAlanOrani: number,
  binaYogunlugu: number,
  agirliklar: TehlikeAgirliklari,
  esikler: TermalStresEsikleri
): string | null {
  if (hucreTehlike >= esikler.tehlike && maruziyet >= esikler.maruziyet) {
    const baskin = hucreBaskinBileseniBelirle(yesilAlanOrani, binaYogunlugu, agirliklar);
    if (baskin === 'bina_yogunlugu') {
      return 'Yüksek nüfus yoğunluğu ısı stresini artırıyor. Bu hücrede tehlikenin asıl kaynağı bina yoğunluğu; yatayda ağaçlandırma için yer kısıtlı olduğundan gölgelendirme yapıları (pergola, tenteli yaya geçidi) ve geçirgen/su tutan zemin kaplaması öncelikli olmalıdır.';
    }
    return 'Yüksek nüfus yoğunluğu ısı stresini artırıyor. Bu hücrede tehlikenin asıl kaynağı yeşil alan eksikliği, bina yoğunluğu değil; bina zaten hücrenin küçük bir kısmını kaplıyor, dikim için fiziksel yer var. Bu nedenle aktif ağaçlandırma ve yeşil alan kazanımı önceliklendirilmelidir.';
  }
  return null;
}

export function noktaHalkaIcindeMi(nokta: number[], halka: number[][]): boolean {
  let icinde = false;
  for (let i = 0, j = halka.length - 1; i < halka.length; j = i++) {
    const xi = halka[i][0], yi = halka[i][1];
    const xj = halka[j][0], yj = halka[j][1];
    const kesisiyorMu = (yi > nokta[1]) !== (yj > nokta[1]) &&
      nokta[0] < ((xj - xi) * (nokta[1] - yi)) / (yj - yi) + xi;
    if (kesisiyorMu) icinde = !icinde;
  }
  return icinde;
}

export function noktaTekPoligondaMi(nokta: number[], poligon: number[][][]): boolean {
  if (poligon.length === 0) return false;
  const disHalka = poligon[0];
  const icindeDis = noktaHalkaIcindeMi(nokta, disHalka);
  if (!icindeDis) return false;
  for (let i = 1; i < poligon.length; i++) {
    if (noktaHalkaIcindeMi(nokta, poligon[i])) return false;
  }
  return true;
}

export function noktaSinirIcindeMi(nokta: number[], sinir: MahalleSinir): boolean {
  if (sinir.type === 'Polygon') {
    return noktaTekPoligondaMi(nokta, sinir.coordinates as number[][][]);
  }
  if (sinir.type === 'MultiPolygon') {
    const poligonlar = sinir.coordinates as number[][][][];
    for (const poligon of poligonlar) {
      if (noktaTekPoligondaMi(nokta, poligon)) return true;
    }
  }
  return false;
}

export function hucreMerkeziHesapla(sinir: MahalleSinir): [number, number] | null {
  const noktalar: number[][] = [];
  if (sinir.type === 'Polygon') {
    const disHalka = (sinir.coordinates as number[][][])[0];
    if (disHalka && disHalka.length > 0) {
      const halkaNoktalari = disHalka.slice(0, -1);
      noktalar.push(...halkaNoktalari);
    }
  } else if (sinir.type === 'MultiPolygon') {
    const poligonlar = sinir.coordinates as number[][][][];
    for (const poligon of poligonlar) {
      const disHalka = poligon[0];
      if (disHalka && disHalka.length > 0) {
        const halkaNoktalari = disHalka.slice(0, -1);
        noktalar.push(...halkaNoktalari);
      }
    }
  }
  if (noktalar.length === 0) return null;
  let sumX = 0, sumY = 0;
  for (const [x, y] of noktalar) {
    sumX += x;
    sumY += y;
  }
  return [sumX / noktalar.length, sumY / noktalar.length];
}

export function hucreIcindekiSiteyiBul(
  hucre: { sinir: MahalleSinir },
  siteler: BaglamSite[]
): BaglamSite | null {
  const merkez = hucreMerkeziHesapla(hucre.sinir);
  if (!merkez) return null;
  for (const site of siteler) {
    if (noktaSinirIcindeMi(merkez, site.sinir)) return site;
  }
  return null;
}

function sinirBoundingBoxHesapla(sinir: MahalleSinir): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const noktalar: number[][] = [];
  if (sinir.type === 'Polygon') {
    const halkalar = sinir.coordinates as number[][][];
    for (const halka of halkalar) {
      noktalar.push(...halka);
    }
  } else if (sinir.type === 'MultiPolygon') {
    const poligonlar = sinir.coordinates as number[][][][];
    for (const poligon of poligonlar) {
      for (const halka of poligon) {
        noktalar.push(...halka);
      }
    }
  }
  if (noktalar.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of noktalar) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function boundingBoxlarKesisiyorMu(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function siteMahalleyleKesisiyorMu(site: BaglamSite, mahalleSinir: MahalleSinir): boolean {
  const siteBbox = sinirBoundingBoxHesapla(site.sinir);
  const mahalleBbox = sinirBoundingBoxHesapla(mahalleSinir);
  if (!siteBbox || !mahalleBbox) return false;
  return boundingBoxlarKesisiyorMu(siteBbox, mahalleBbox);
}

/**
 * Yerlesim zarfinin (zarf_alan_km2) mahallenin toplam idari alanina (alan_km2) oranini
 * hesaplar. 0-1 arasi bir deger doner (diger oranlarla - bina_yogunlugu, yesil_alan_orani -
 * ayni birim/olcek, gosterimde cagiran taraf * 100 ile yuzdeye cevirir). Zarf tanimi geregi
 * (bina tamponu + mahalle siniriyla kesisim) zarf alani mahalle alanini asamaz, yani deger
 * matematiksel olarak [0,1] araliginda olmali; alanKm2 <= 0 ise (olmamasi gereken ama
 * savunmaci kontrol) hata firlatir - projedeki diger saf fonksiyonlarla (skor.ts'teki
 * hesaplaTehlike/olcekleMaruziyet/simuleNufus, bu dosyadaki hesaplaProjeksiyonRiski) AYNI
 * konvansiyon: gecersiz sayisal girdi icin throw new Error, sessizce 0 donup gizlememek.
 */
export function hesaplaZarfOrani(alanKm2: number, zarfAlanKm2: number): number {
  if (alanKm2 <= 0) {
    throw new Error('hesaplaZarfOrani: alanKm2 sifir veya negatif olamaz');
  }
  return zarfAlanKm2 / alanKm2;
}

export interface ImarOnDegerlendirmeSonucu {
  projeMaruziyeti: number;
  hedefTehlike: number;
  mumkun: boolean;
  gerekliYesilAlanOrani: number | null;
}

/**
 * Imar plani on degerlendirme hesaplayicisi.
 *
 * Bu fonksiyon, mevcut skor formullerinin (skor.ts) CEBIRSEL TERSINI kullanir;
 * YENI bir formül degil, var olan hesaplarin ters yonde cozulmesidir.
 * Calisma adimlari:
 * 1. Projenin kendi nufus yogunlugunu mevcut mahalle yogunluklarina ekleyip
 *    olcekleMaruziyet ile yeni maruziyetini hesaplar.
 * 2. Hedef tehlikeyi, hedef riskin proje maruziyetine bolunmesiyle bulur.
 * 3. hesaplaTehlike'nin cebirsel tersi ile bu hedef tehlikeyi saglayacak
 *    gerekli yesil alan oranini cozer; mumkun degilse (y > 1) raporlar.
 *
 * @param mahalleler - mevcut mahalle verileri (ad, yesilAlanOrani, binaYogunlugu, nufus, zarfAlanKm2)
 * @param projeAlanKm2 - yeni projenin yerlesim zarfi alani (km2)
 * @param projeNufus - projenin hedef nufusu
 * @param projeBinaYogunlugu - projenin sabit bina yogunlugu
 * @param hedefRisk - ulasilmak istenen risk skoru
 * @param ayarlar - agirlik ve alt sinir ayarlari
 * @returns ImarOnDegerlendirmeSonucu
 * @throws projeAlanKm2 <= 0 hatasi
 */
export function hesaplaImarOnDegerlendirme(
  mahalleler: MahalleVeri[],
  projeAlanKm2: number,
  projeNufus: number,
  projeBinaYogunlugu: number,
  hedefRisk: number,
  ayarlar: SkorAyarlari
): ImarOnDegerlendirmeSonucu {
  if (projeAlanKm2 <= 0) {
    throw new Error('hesaplaImarOnDegerlendirme: projeAlanKm2 sifir veya negatif olamaz');
  }

  const mevcutYogunluklar = mahalleler.map((m) => m.nufus / m.zarfAlanKm2);
  const projeYogunluk = projeNufus / projeAlanKm2;
  const projeMaruziyeti = maruziyetYeniMahalleyleHesapla(
    mevcutYogunluklar,
    projeYogunluk,
    ayarlar.maruziyet_alt_siniri
  );

  const hedefTehlike = hedefRisk / projeMaruziyeti;

  const agirliklar: TehlikeAgirliklari = {
    yesilAlan: ayarlar.tehlike_agirliklari.yesil_alan,
    binaYogunlugu: ayarlar.tehlike_agirliklari.bina_yogunlugu,
  };

  const { mumkun, gerekliYesilAlanOrani } = hesaplaGerekliYesilAlanOrani(
    hedefTehlike,
    projeBinaYogunlugu,
    agirliklar
  );

  return { projeMaruziyeti, hedefTehlike, mumkun, gerekliYesilAlanOrani };
}
