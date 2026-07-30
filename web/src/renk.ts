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
