import { describe, it, expect } from 'vitest';
import izgaraRaw from '../../public/izgara.json';
import baglamRaw from '../../public/baglam.json';
import veriRaw from '../../public/veri.json';
import { hucreIcindekiSiteyiBul, siteMahalleyleKesisiyorMu } from '../skorHesapla';
import type { BaglamSite, IzgaraHucre, MahalleSinir } from '../veriKaynagi';

// Bu test, throwaway script yerine kalici bir regresyon testi olarak; gercek
// izgara.json + baglam.json + veri.json uzerinde hucre-site eslesmesini ve
// bbox kesisim filtresini dogrular (bkz. testler/hucreBazliSimulasyonGercekVeri.test.ts
// ile ayni desen).

describe('hucre-site esleme — gerçek veriyle entegrasyon', () => {
  const izgaraByAd = izgaraRaw as Record<string, { hucreler: IzgaraHucre[] }>;
  const baglam = baglamRaw as { siteler: BaglamSite[] };
  const mahalleler = veriRaw as { ad: string; sinir: MahalleSinir }[];

  it('gerçek veri dosyaları yüklendi ve beklenen şekilde', () => {
    expect(baglam.siteler.length).toBeGreaterThan(0);
    expect(Object.keys(izgaraByAd).length).toBeGreaterThan(0);
    expect(mahalleler.length).toBeGreaterThan(0);
  });

  it('Samlar mahallesindeki hücrelerin bir kısmı gerçek bir siteye eşleşir', () => {
    const izgara = izgaraByAd['Samlar'];
    expect(izgara).toBeDefined();

    let eslesenSayisi = 0;
    for (const hucre of izgara.hucreler) {
      const site = hucreIcindekiSiteyiBul(hucre, baglam.siteler);
      if (site) eslesenSayisi++;
    }
    // En az bir hücre bir siteye eşleşmeli (bilinen: "Bir Bahçe Başakşehir 1")
    expect(eslesenSayisi).toBeGreaterThan(0);
  });

  it('tüm ızgara hücrelerinin makul bir kısmı (>%0, <%100) bir siteye eşleşir', () => {
    let toplam = 0;
    let eslesen = 0;
    for (const ad of Object.keys(izgaraByAd)) {
      for (const hucre of izgaraByAd[ad].hucreler) {
        toplam++;
        if (hucreIcindekiSiteyiBul(hucre, baglam.siteler)) eslesen++;
      }
    }
    expect(toplam).toBeGreaterThan(0);
    expect(eslesen).toBeGreaterThan(0);
    expect(eslesen).toBeLessThan(toplam);
  });

  it('Samlar mahallesi (gerçek veride MultiPolygon sınır) ile bbox kesişen en az bir site var, ama tümü değil', () => {
    const samlar = mahalleler.find((m) => m.ad === 'Samlar');
    expect(samlar).toBeDefined();
    expect(samlar!.sinir.type).toBe('MultiPolygon');

    const kesisenler = baglam.siteler.filter((s) => siteMahalleyleKesisiyorMu(s, samlar!.sinir));
    expect(kesisenler.length).toBeGreaterThan(0);
    expect(kesisenler.length).toBeLessThan(baglam.siteler.length);
  });

  it('tamamen ilgisiz/uzak bir mahalle ile hiç kesişmeyen siteler de olmalı (bbox filtresi her şeyi geçirmiyor)', () => {
    // En azindan bir mahallenin, 380 sitenin tamamıyla kesişmediğini doğrula.
    const herhangiBirMahalle = mahalleler[0];
    const kesisenler = baglam.siteler.filter((s) =>
      siteMahalleyleKesisiyorMu(s, herhangiBirMahalle.sinir),
    );
    expect(kesisenler.length).toBeLessThan(baglam.siteler.length);
  });
});
