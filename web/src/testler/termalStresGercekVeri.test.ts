import { describe, it, expect } from 'vitest';
import ayarlar from '../ayarlar.json';
import veriRaw from '../../public/veri.json';
import izgaraRaw from '../../public/izgara.json';
import { hesaplaMevcutSkorlar, hesaplaHucreTehlikeleri, hucreTermalStresOnerisiBelirle } from '../skorHesapla';
import type { TehlikeAgirliklari } from '../skor';

/**
 * REQ-F-29 regresyon testi: gercek public/veri.json + public/izgara.json
 * uzerinden hucreTermalStresOnerisiBelirle'nin uc uc senaryosunu dogrular.
 * Bu, App.tsx'teki hucreTermalStresOnerisi useMemo'sunun kullandigi ayni
 * veri kaynagini ve ayni ayarlar.termal_stres_esikleri degerini kullanir.
 */
describe('REQ-F-29: hucreTermalStresOnerisiBelirle gercek veriyle', () => {
  const mahalleVerileri = (Object.values(veriRaw) as any[]).map((m) => ({
    ad: m.ad,
    yesilAlanOrani: m.yesil_alan_orani,
    binaYogunlugu: m.bina_yogunlugu,
    nufus: m.nufus,
    zarfAlanKm2: m.zarf_alan_km2,
  }));

  const skorlar = hesaplaMevcutSkorlar(mahalleVerileri, ayarlar as any);
  const agirliklar: TehlikeAgirliklari = {
    yesilAlan: ayarlar.tehlike_agirliklari.yesil_alan,
    binaYogunlugu: ayarlar.tehlike_agirliklari.bina_yogunlugu,
  };

  const izgaraByAd = izgaraRaw as Record<string, { hucreler: { yesil_alan_orani: number; bina_yogunlugu: number }[] }>;

  function enYuksekHucre(mahalleAd: string): { yesil_alan_orani: number; bina_yogunlugu: number; tehlike: number } {
    const izgara = izgaraByAd[mahalleAd];
    const tehlikeler = hesaplaHucreTehlikeleri(izgara.hucreler, agirliklar);
    let maxIdx = 0;
    for (let i = 1; i < tehlikeler.length; i++) {
      if (tehlikeler[i] > tehlikeler[maxIdx]) maxIdx = i;
    }
    return { ...izgara.hucreler[maxIdx], tehlike: tehlikeler[maxIdx] };
  }

  it('yuksek maruziyetli bir mahallede (Guvercintepe) yuksek tehlikeli hucrede oneri tetiklenir', () => {
    const guvercintepe = skorlar.find((s) => s.ad === 'Guvercintepe')!;
    expect(guvercintepe).toBeDefined();
    expect(guvercintepe.maruziyet).toBeGreaterThanOrEqual(ayarlar.termal_stres_esikleri.maruziyet);

    const hucre = enYuksekHucre('Guvercintepe');
    expect(hucre.tehlike).toBeGreaterThanOrEqual(ayarlar.termal_stres_esikleri.tehlike);

    const oneri = hucreTermalStresOnerisiBelirle(hucre.tehlike, guvercintepe.maruziyet, hucre.yesil_alan_orani, hucre.bina_yogunlugu, agirliklar, ayarlar.termal_stres_esikleri);
    expect(oneri).not.toBeNull();
  });

  it('en dusuk maruziyetli mahallede (Samlar) en tehlikeli hucrede bile oneri tetiklenmez', () => {
    const samlar = skorlar.find((s) => s.ad === 'Samlar')!;
    expect(samlar).toBeDefined();
    // Samlar bilinen outlier: proje icinde en dusuk nufuslu/maruziyetli mahalle.
    expect(samlar.maruziyet).toBeLessThan(ayarlar.termal_stres_esikleri.maruziyet);

    const hucre = enYuksekHucre('Samlar');
    // Samlar'in en tehlikeli hucresi tek basina tehlike esigini gecebilir,
    // ama maruziyet dusuk oldugu icin oneri yine de tetiklenmemeli.
    const oneri = hucreTermalStresOnerisiBelirle(hucre.tehlike, samlar.maruziyet, hucre.yesil_alan_orani, hucre.bina_yogunlugu, agirliklar, ayarlar.termal_stres_esikleri);
    expect(oneri).toBeNull();
  });

  it('gercek veride en az bir mahalle/hucre kombinasyonu esigi karsilar (esik kalibrasyonu bosta degil)', () => {
    const tetiklenenler = skorlar.filter((s) => {
      if (!izgaraByAd[s.ad]) return false;
      const hucre = enYuksekHucre(s.ad);
      return hucreTermalStresOnerisiBelirle(hucre.tehlike, s.maruziyet, hucre.yesil_alan_orani, hucre.bina_yogunlugu, agirliklar, ayarlar.termal_stres_esikleri) !== null;
    });
    expect(tetiklenenler.length).toBeGreaterThan(0);
  });
});
