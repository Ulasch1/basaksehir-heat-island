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
  const t = aralik === 0 ? 0.5 : Math.min(Math.max((tehlike - min) / aralik, 0), 1);
  const l = 0.85 - t * (0.85 - 0.60);   // 0.85 -> 0.60
  const c = 0.05 + t * (0.19 - 0.05);  // 0.05 -> 0.19
  const h = 225 + t * (25 - 225);      // 225 -> 25
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}
