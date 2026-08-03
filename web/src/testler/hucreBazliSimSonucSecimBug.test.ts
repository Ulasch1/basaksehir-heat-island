import { describe, it, expect } from 'vitest';
import ayarlar from '../ayarlar.json';
import veriRaw from '../../public/veri.json';
import izgaraRaw from '../../public/izgara.json';
import { hesaplaMevcutSkorlar, hucreBazliMahalleSkoruHesapla, simuleHucreYesillestirme, hesaplaHucreTehlikeleri } from '../skorHesapla';
import { simuleYesilAlan } from '../skor';
import type { TehlikeAgirliklari } from '../skor';

/**
 * REGRESYON KORUMASI: App.tsx'teki `hucreBazliSimSonuc` useMemo'su ONCEDEN sadece
 * `seciliHucreIndex !== null` kosuluna bakiyordu, `izgaraKatmani.simulasyonAktif`
 * (yani simYesil > 0) kosulunu KONTROL ETMIYORDU. qa (bu oturumda) bunu gercek
 * veriyle kanitlayan bir "BUG" testi olarak yazdi; coder App.tsx'e
 * `!izgaraKatmani.simulasyonAktif` guard'ini ekleyerek duzeltti (bkz. App.tsx
 * satir 308-311). Artik simYesil===0 iken hucreBazliSimSonuc HER ZAMAN null
 * doner, efektifYesilSimSonuc dogru sekilde eski mahalle-seviyesi
 * yesilSimSonuc'a duser.
 *
 * Bu test dosyasi ARTIK App.tsx'in guncel davranisini test ETMIYOR (App.tsx'in
 * kendisi component-seviyesinde test edilmiyor, bu repoda DOM/leaflet test
 * altyapisi yok). Bunun yerine, guard'in NEDEN gerekli oldugunu, gercek veriyle
 * KALICI olarak kanitlayan bir aciklayici/regresyon-onleme testi olarak kaldi:
 * mahalle poligonunun kendi yesil_alan_orani/bina_yogunlugu degerleri ile o
 * mahallenin izgara hucrelerinin ORTALAMASI ayni veri kaynagi DEGIL, gercekte
 * farkli sayisal degerler uretiyor. Guard olmadan bu iki kaynak birbirinin
 * yerine geçebiliyormus gibi davranmak (simYesil=0 iken bile) yanlis sonuc
 * verirdi - bu test o varsayimin gecersiz oldugunu gercek veriyle ispatlar.
 */
describe('hucreBazliSimSonuc guard gerekcesi: mahalle-seviyesi veri != izgara hucre ortalamasi', () => {
  const mahalleVerileri = (veriRaw as any[]).map((m) => ({
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

  it('Kayabasi: izgara hucrelerinin ortalamasi mahalle poligonunun kendi degerinden gercekten farkli (guard bu yuzden gerekli)', () => {
    const mahalleAd = 'Kayabasi';
    const mahalleRaw = (veriRaw as any[]).find((m) => m.ad === mahalleAd);
    const mahalleSkor = skorlar.find((s) => s.ad === mahalleAd)!;
    const maruziyet = mahalleSkor.maruziyet;

    // izgaraKatmani.simulasyonAktif === false (simYesil===0) esdegeri: TUM
    // hucreler kendi baseline yesil/bina degerinde, hicbiri degismemis.
    const hucreler = izgaraByAd[mahalleAd].hucreler;
    const baselineHucreOzellikleri = hucreler.map((h) => ({
      yesil_alan_orani: h.yesil_alan_orani,
      bina_yogunlugu: h.bina_yogunlugu,
    }));

    // Guard olmasaydi App.tsx'in hesaplayacagi deger: TUM izgara hucrelerinin
    // ortalamasi uzerinden hucreBazliMahalleSkoruHesapla.
    const izgaraOrtalamaliSonuc = hucreBazliMahalleSkoruHesapla(
      baselineHucreOzellikleri,
      maruziyet,
      agirliklar
    )!;

    // Guard SAYESINDE App.tsx'in artik gercekten kullandigi deger: eski
    // mahalle-seviyesi yesilSimSonuc (simuleYesilAlan artisPuani=0 ile
    // baseline'i aynen dondurur, bu efektifYesilSimSonuc'un simYesil=0'daki
    // dogru degeridir).
    const mahalleSeviyesiBaselineSonuc = simuleYesilAlan(
      {
        ad: mahalleAd,
        yesilAlanOrani: mahalleRaw.yesil_alan_orani,
        binaYogunlugu: mahalleRaw.bina_yogunlugu,
        maruziyet,
        agirliklar,
      },
      0,
      ayarlar.simulasyon_bina_azaltma_katsayisi
    );

    // Bu iki deger GERCEKTEN farkli - mahalle poligonunun kendi yesil/bina
    // orani ile o mahallenin izgara hucrelerinin ortalamasi ayni veri kaynagi
    // degil. Guard bu yuzden var: hucreBazliSimSonuc, simulasyonAktif false
    // iken bu farkli/yanlis degeri asla uretmemeli (App.tsx satir 309'daki
    // `!izgaraKatmani.simulasyonAktif` kontrolu tam olarak bunu saglar).
    expect(izgaraOrtalamaliSonuc.risk).not.toBeCloseTo(mahalleSeviyesiBaselineSonuc.risk, 5);
  });

  it('Kayabasi: hucre secili VE simulasyon aktif (simYesil>0) iken hucreBazliSimSonuc guard tarafindan ENGELLENMEMELI, tek hucrenin yesillendirme etkisini yansitmali', () => {
    const mahalleAd = 'Kayabasi';
    const mahalleSkor = skorlar.find((s) => s.ad === mahalleAd)!;
    const maruziyet = mahalleSkor.maruziyet;
    const hucreler = izgaraByAd[mahalleAd].hucreler as {
      yesil_alan_orani: number;
      bina_yogunlugu: number;
    }[];
    const seciliHucreIndex = 0;
    const simYesil = 20; // App.tsx'te simulasyonAktif = simYesil > 0

    // App.tsx izgaraKatmani useMemo'sunun (satir 229-261) "seciliHucreIndex !== null &&
    // simulasyonAktif" dalinin bire bir tekrari: baseline tum hucreler, sadece secili
    // hucre yesillestirilir.
    const baseline = hesaplaHucreTehlikeleri(hucreler, agirliklar);
    const baselineOzellikleri = hucreler.map((h, i) => ({
      yesil_alan_orani: h.yesil_alan_orani,
      bina_yogunlugu: h.bina_yogunlugu,
      tehlike: baseline[i],
    }));
    const hucreOzellikleri = [...baselineOzellikleri];
    const tekSonuc = simuleHucreYesillestirme(
      [hucreler[seciliHucreIndex]],
      simYesil,
      ayarlar.simulasyon_bina_azaltma_katsayisi,
      agirliklar
    );
    hucreOzellikleri[seciliHucreIndex] = tekSonuc[0];

    // Guard: seciliHucreIndex !== null (true) && izgaraKatmani (true) &&
    // izgaraKatmani.simulasyonAktif (true, simYesil=20>0) && seciliSkor (true)
    // -> guard PASS'lenmeli, hucreBazliSimSonuc null DONMEMELI.
    const hucreBazliSimSonuc = hucreBazliMahalleSkoruHesapla(hucreOzellikleri, maruziyet, agirliklar);
    expect(hucreBazliSimSonuc).not.toBeNull();

    // Sonuc, hicbir hucrenin degismedigi saf baseline'dan farkli olmali (tek hucrenin
    // yesillendirilmesi butun mahalle ortalamasini, kucuk de olsa, degistirmeli).
    const saflBaselineSonuc = hucreBazliMahalleSkoruHesapla(baselineOzellikleri, maruziyet, agirliklar)!;
    expect(hucreBazliSimSonuc!.risk).not.toBeCloseTo(saflBaselineSonuc.risk, 8);
  });
});
