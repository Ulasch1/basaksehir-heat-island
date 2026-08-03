export type RiskKovasi = 'dusuk' | 'orta' | 'yuksek';

export interface RenkEsikleri {
  dusuk: number;
  yuksek: number;
}

/** Risk skorunu, verilen sabit esiklere gore uc kovadan birine atar. */
export function riskKovasiBelirle(risk: number, esikler: RenkEsikleri): RiskKovasi {
  if (risk < esikler.dusuk) return 'dusuk';
  if (risk < esikler.yuksek) return 'orta';
  return 'yuksek';
}

/** Her kovaya karsilik gelen sabit OKLCH renk (goreceli degil, kovaya bagli sabit). */
export const KOVA_RENKLERI: Record<RiskKovasi, string> = {
  dusuk: 'oklch(0.62 0.12 225)',
  orta: 'oklch(0.78 0.15 90)',
  yuksek: 'oklch(0.63 0.19 25)',
};

/** Kisayol: risk skorundan dogrudan CSS renk string'ine gider. */
export function riskRengi(risk: number, esikler: RenkEsikleri): string {
  return KOVA_RENKLERI[riskKovasiBelirle(risk, esikler)];
}

/** Mahalle ici izgara gosterimi icin surekli OKLCH renk gradyani. */
export function golgeRengi(tehlike: number, min: number, max: number): string {
  const aralik = max - min;
  const t = aralik === 0 ? 0.5 : Math.min((tehlike - min) / aralik, 1);
  const l = Math.min(Math.max(0.85 - t * (0.85 - 0.60), 0), 1);
  const c = Math.max(0.05 + t * (0.19 - 0.05), 0);
  const h = 225 + t * (25 - 225);
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/**
 * Operasyonel baglam katmani (site poligonlari, yol agi, OSB siniri) icin SABIT renkler.
 * Risk renklerinden (KOVA_RENKLERI) BILINCLI olarak farkli hue'lar kullanilir, boylece
 * kullanici bu bilgilendirme katmanini risk/tehlike gostergesiyle KARISTIRMAZ.
 */
export const BAGLAM_RENKLERI = {
  site: 'oklch(0.75 0.08 305)',
  siteKontur: 'oklch(0.55 0.12 305)',
  yolBuyuksehir: 'oklch(0.55 0.16 40)',
  yolIlce: 'oklch(0.55 0.14 200)',
  osbSinir: 'oklch(0.5 0.02 90)',
} as const;

export type YolSorumlulugu = 'buyuksehir' | 'ilce';

/** Yol sorumluluguna gore sabit renk dondurur (baglam katmani, risk renklerinden bagimsiz). */
export function yolSorumlulukRengi(sorumluluk: YolSorumlulugu): string {
  return sorumluluk === 'buyuksehir' ? BAGLAM_RENKLERI.yolBuyuksehir : BAGLAM_RENKLERI.yolIlce;
}

/**
 * Simulasyon onizleme rengi: haritada secili mahalle icin bir senaryo (yesil alan
 * artisi veya nufus artisi) calisirken kullanilir. Kasitli olarak risk kovalarindan
 * (KOVA_RENKLERI: 225/90/25 hue) ve baglam katmanindan (BAGLAM_RENKLERI: 305/40/200
 * hue) FARKLI bir hue (275, mor/indigo) secildi, boylece "bu gercek mevcut risk mi,
 * yoksa bir onizleme mi" sorusu renkten ayirt edilebilir kalir - ikisi asla ayni
 * hue'yu paylasmaz.
 */
export const SIMULASYON_RENGI = {
  dolgu: 'oklch(0.68 0.17 275)',
  kontur: 'oklch(0.5 0.19 275)',
} as const;
