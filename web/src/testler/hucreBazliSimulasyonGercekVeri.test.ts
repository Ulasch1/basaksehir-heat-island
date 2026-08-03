import { describe, it, expect } from 'vitest';
import ayarlar from '../ayarlar.json';
import veriRaw from '../../public/veri.json';
import izgaraRaw from '../../public/izgara.json';
import {
  hesaplaMevcutSkorlar,
  hesaplaHucreTehlikeleri,
  hucreBazliMahalleSkoruHesapla,
  simuleHucreYesillestirme,
} from '../skorHesapla';
import { hesaplaTehlike, simuleYesilAlan } from '../skor';
import type { TehlikeAgirliklari } from '../skor';

describe('hucreBazliSimulasyon — gerçek veriyle tek hücre seçimi entegrasyonu', () => {
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

  const izgaraByAd = izgaraRaw as Record<
    string,
    { hucreler: { yesil_alan_orani: number; bina_yogunlugu: number }[] }
  >;

  it("Kayabaşı mahallesi var ve ızgara hücresi sayısı yeterli", () => {
    const izgara = izgaraByAd['Kayabasi'];
    expect(izgara).toBeDefined();
    expect(izgara.hucreler.length).toBeGreaterThan(1);
  });

  it('tek hücre simülasyonu ile mahalle bazlı simülasyon farklı sonuç verir', () => {
    const mahalleAd = 'Kayabasi';
    // veri.json bir DIZI'dir (izgara.json'un aksine mahalle adina gore anahtarlanmis
    // bir sozluk DEGIL), bu yuzden ad alanina gore find() ile aranmali.
    const mahalleRaw = (veriRaw as any[]).find((m) => m.ad === mahalleAd);
    expect(mahalleRaw).toBeDefined();
    const mahalleSkor = skorlar.find((s) => s.ad === mahalleAd);
    expect(mahalleSkor).toBeDefined();
    const maruziyet = mahalleSkor!.maruziyet;

    const izgara = izgaraByAd[mahalleAd];
    const hucreler = izgara.hucreler;

    // En yüksek baseline tehlikeli hücreyi seç
    const baselineTehlikeler = hesaplaHucreTehlikeleri(hucreler, agirliklar);
    let seciliIndex = 0;
    for (let i = 1; i < baselineTehlikeler.length; i++) {
      if (baselineTehlikeler[i] > baselineTehlikeler[seciliIndex]) seciliIndex = i;
    }

    // Sadece seçili hücreye simülasyon uygula
    const tekHucre = [hucreler[seciliIndex]];
    const simSonuc = simuleHucreYesillestirme(tekHucre, 20, 0.5, agirliklar);
    const hucreOzellikleri = hucreler.map((h, i) => ({
      yesil_alan_orani: h.yesil_alan_orani,
      bina_yogunlugu: h.bina_yogunlugu,
    }));
    hucreOzellikleri[seciliIndex] = {
      yesil_alan_orani: simSonuc[0].yesil_alan_orani,
      bina_yogunlugu: simSonuc[0].bina_yogunlugu,
    };

    const hucreBazliSonuc = hucreBazliMahalleSkoruHesapla(hucreOzellikleri, maruziyet, agirliklar)!;
    expect(hucreBazliSonuc).not.toBeNull();

    // Mahalle bazlı geleneksel simülasyon
    const genelSonuc = simuleYesilAlan(
      {
        ad: mahalleAd,
        yesilAlanOrani: mahalleRaw.yesil_alan_orani,
        binaYogunlugu: mahalleRaw.bina_yogunlugu,
        maruziyet,
        agirliklar,
      },
      20,
      0.5,
    );

    expect(hucreBazliSonuc.risk).not.toBeCloseTo(genelSonuc.risk, 5);

    // Yön: tek hücre etkisi daha mütevazı olmalı → hucreBazli tehlike, mahalle bazlı simülasyondaki
    // genelSonuc.tehlike’den, mahallenin mevcut (baseline) tehlikesine daha yakın olmalı.
    const baselineTehlike = hesaplaTehlike(
      mahalleRaw.yesil_alan_orani,
      mahalleRaw.bina_yogunlugu,
      agirliklar,
    );
    const hucreBazliSapma = Math.abs(hucreBazliSonuc.tehlike - baselineTehlike);
    const genelSapma = Math.abs(genelSonuc.tehlike - baselineTehlike);
    expect(hucreBazliSapma).toBeLessThan(genelSapma);
  });
});
