import { useEffect, useMemo, useState } from 'react';
import ayarlar from './ayarlar.json';
import {
  varsayilanVeriKaynagi,
  type Mahalle,
  type TipolojiSonucu,
  type ProjeksiyonSonucu,
} from './veriKaynagi';
import {
  hesaplaMevcutSkorlar,
  hesaplaProjeksiyonRiski,
  tehlikeRiskUyusmazliginiBul,
  hesaplaSimuleRank,
  hesaplaBirlesikSenaryoSonucu,
  simuleHucreYesillestirme,
  siralaOncelikListesi,
  hucreTermalStresOnerisiBelirle,
  hucreTehlikeYuzdelikDilimiHesapla,
  hucreBazliMahalleSkoruHesapla,
  tipolojiEtiketEslemesiTure,
  hucreIcindekiSiteyiBul,
  siteMahalleyleKesisiyorMu,
  type MahalleVeri,
  type MahalleSkoru,
  type ProjeksiyonRiski,
  type SiralamaModu,
  type TermalStresEsikleri,
  type TipolojiEtiketleme,
  type BirlesikSenaryoSonucu,
} from './skorHesapla';
import { simuleYesilAlan, simuleNufus, secBudceKisitli } from './skor';
import type { MahalleGirdi, TehlikeAgirliklari } from './skor';
import { izgaraGetir, type IzgaraHucre } from './veriKaynagi';
import { baglamGetir, type BaglamVerisi } from './veriKaynagi';
import { hesaplaHucreTehlikeleri } from './skorHesapla';
import Harita from './bilesenler/Harita';
import OncelikListesi from './bilesenler/OncelikListesi';
import DetayPaneli from './bilesenler/DetayPaneli';
import Simulasyon from './bilesenler/Simulasyon';
import MahalleArama from './bilesenler/MahalleArama';
import ImarHesaplayici from './bilesenler/ImarHesaplayici';

const BOS_BUTCE_SETI = new Set<string>();

export default function App() {
  const veriKaynagi = useMemo(() => varsayilanVeriKaynagi(), []);

  const [mahalleler, setMahalleler] = useState<Mahalle[] | null>(null);
  const [tipoloji, setTipoloji] = useState<TipolojiSonucu | null>(null);
  const [projeksiyon, setProjeksiyon] = useState<ProjeksiyonSonucu | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [seciliAd, setSeciliAd] = useState<string | null>(null);

  const [simYesil, setSimYesil] = useState(0);
  const [simNufusYuzde, setSimNufusYuzde] = useState(0);
  const [simButce, setSimButce] = useState(3);
  const [siralamaModu, setSiralamaModu] = useState<SiralamaModu>('risk');

  const [izgaraGoster, setIzgaraGoster] = useState(false);
  const [izgaraVeri, setIzgaraVeri] = useState<{ ad: string; hucreler: IzgaraHucre[] } | null>(null);
  const [izgaraYukleniyor, setIzgaraYukleniyor] = useState(false);
  const [izgaraHata, setIzgaraHata] = useState<string | null>(null);
  const [seciliHucreIndex, setSeciliHucreIndex] = useState<number | null>(null);
  const [baglamVeri, setBaglamVeri] = useState<BaglamVerisi | null>(null);
  const [aktifSekme, setAktifSekme] = useState<'inceleme' | 'senaryo'>('inceleme');
  const [simHedef, setSimHedef] = useState<'mahalle' | 'hucre'>('mahalle');

  const senaryoAktif = aktifSekme === 'senaryo';

  useEffect(() => {
    let iptalEdildi = false;
    (async () => {
      try {
        const veri = await veriKaynagi.mahalleleriGetir();
        if (iptalEdildi) return;
        setMahalleler(veri);
        setSeciliAd((mevcut) => mevcut ?? veri[0]?.ad ?? null);
        const [tip, proj] = await Promise.all([
          veriKaynagi.tipolojiGetir(veri),
          veriKaynagi.projeksiyonGetir(veri, ayarlar.projeksiyon_ufku_yil),
        ]);
        if (iptalEdildi) return;
        setTipoloji(tip);
        setProjeksiyon(proj);
      } catch (e) {
        if (!iptalEdildi) {
          setHata(
            e instanceof Error
              ? e.message
              : 'Veri yüklenirken bilinmeyen bir hata oluştu',
          );
        }
      }
    })();
    return () => {
      iptalEdildi = true;
    };
  }, [veriKaynagi]);

  // Izgara verisi yukleme (lazy)
  useEffect(() => {
    let iptalEdildi = false;
    if (!izgaraGoster || !seciliAd) {
      setIzgaraHata(null);
      return;
    }
    setIzgaraYukleniyor(true);
    setIzgaraHata(null);
    (async () => {
      try {
        const hucreler = await izgaraGetir(seciliAd);
        if (iptalEdildi) return;
        setIzgaraVeri({ ad: seciliAd, hucreler });
      } catch (e) {
        if (!iptalEdildi) {
          setIzgaraHata(e instanceof Error ? e.message : 'Izgara verisi yuklenirken hata olustu');
        }
      } finally {
        if (!iptalEdildi) {
          setIzgaraYukleniyor(false);
        }
      }
    })();
    return () => {
      iptalEdildi = true;
    };
  }, [izgaraGoster, seciliAd]);

  useEffect(() => {
    let iptalEdildi = false;
    (async () => {
      try {
        const veri = await baglamGetir();
        if (!iptalEdildi) setBaglamVeri(veri);
      } catch {
        // Baglam katmani opsiyonel/bilgilendirme amacli: basarisiz olursa sessizce
        // null birakilir, ana uygulama (skor/harita/oncelik listesi) COKMEZ.
      }
    })();
    return () => {
      iptalEdildi = true;
    };
  }, []);

  // ---------- Türetilmiş değerler (useMemo) ----------

  const mahalleVerileri = useMemo<MahalleVeri[]>(() => {
    if (!mahalleler) return [];
    return mahalleler.map((m) => ({
      ad: m.ad,
      yesilAlanOrani: m.yesil_alan_orani,
      binaYogunlugu: m.bina_yogunlugu,
      nufus: m.nufus,
      zarfAlanKm2: m.zarf_alan_km2,
    }));
  }, [mahalleler]);

  const mevcutSkorlar = useMemo<MahalleSkoru[]>(() => {
    if (mahalleVerileri.length === 0) return [];
    return hesaplaMevcutSkorlar(mahalleVerileri, ayarlar);
  }, [mahalleVerileri]);

  const siraliSkorlar = useMemo<MahalleSkoru[]>(
    () => [...mevcutSkorlar].sort((a, b) => b.risk - a.risk),
    [mevcutSkorlar],
  );

  const oncelikListesiSirali = useMemo<MahalleSkoru[]>(
    () => siralaOncelikListesi(mevcutSkorlar, siralamaModu),
    [mevcutSkorlar, siralamaModu],
  );

  const uyusmazlik = useMemo(
    () => tehlikeRiskUyusmazliginiBul(mevcutSkorlar),
    [mevcutSkorlar],
  );

  const seciliIndex = useMemo(
    () => (mahalleler ? mahalleler.findIndex((m) => m.ad === seciliAd) : -1),
    [mahalleler, seciliAd],
  );

  const seciliMahalle = useMemo(
    () => (seciliIndex >= 0 ? mahalleler![seciliIndex] : null),
    [mahalleler, seciliIndex],
  );

  const seciliSkor = useMemo(
    () => (seciliIndex >= 0 ? mevcutSkorlar[seciliIndex] : null),
    [mevcutSkorlar, seciliIndex],
  );

  const seciliRank = useMemo(() => {
    if (!seciliAd) return null;
    const idx = siraliSkorlar.findIndex((s) => s.ad === seciliAd);
    return idx >= 0 ? idx + 1 : null;
  }, [siraliSkorlar, seciliAd]);

  const tipolojiByAd = useMemo<Record<string, number>>(() => {
    if (!tipoloji) return {};
    const map: Record<string, number> = {};
    for (const item of tipoloji.sonuclar) {
      map[item.ad] = item.tipoloji;
    }
    return map;
  }, [tipoloji]);

  const seciliTipolojiIndex = useMemo(() => {
    if (!seciliAd) return null;
    return tipolojiByAd[seciliAd] ?? null;
  }, [tipolojiByAd, seciliAd]);

  // AI kumeleme index'i (0/1/2) semantik olarak sabit degil (bkz. skorHesapla.ts
  // tipolojiEtiketEslemesiTure dokumantasyonu); esleme her tipoloji fetch'inde
  // gozlenen kumelerin GERCEK bina yogunlugu ortalamasindan yeniden turetilir.
  const tipolojiEtiketEslemesi = useMemo<Record<string, TipolojiEtiketleme>>(() => {
    if (!tipoloji || mahalleVerileri.length === 0) return {};
    return tipolojiEtiketEslemesiTure(
      tipoloji.sonuclar,
      mahalleVerileri,
      ayarlar.tipoloji_mudahale_siralamasi,
    );
  }, [tipoloji, mahalleVerileri]);

  const seciliTipolojiBilgi = useMemo<TipolojiEtiketleme | null>(() => {
    if (seciliTipolojiIndex == null) return null;
    return tipolojiEtiketEslemesi[String(seciliTipolojiIndex)] ?? null;
  }, [seciliTipolojiIndex, tipolojiEtiketEslemesi]);

  const projeksiyonByAd = useMemo<Record<string, { tahminiNufus: number; hedefYil: number }>>(() => {
    if (!projeksiyon) return {};
    const map: Record<string, { tahminiNufus: number; hedefYil: number }> = {};
    for (const item of projeksiyon.sonuclar) {
      map[item.ad] = { tahminiNufus: item.tahminiNufus, hedefYil: item.hedefYil };
    }
    return map;
  }, [projeksiyon]);

  const seciliProjeksiyon = useMemo(() => {
    if (!seciliAd) return null;
    return projeksiyonByAd[seciliAd] ?? null;
  }, [projeksiyonByAd, seciliAd]);

  const seciliProjeksiyonRiski = useMemo<ProjeksiyonRiski | null>(() => {
    if (seciliIndex < 0 || !seciliProjeksiyon) return null;
    return hesaplaProjeksiyonRiski(
      mahalleVerileri,
      seciliIndex,
      seciliProjeksiyon.tahminiNufus,
      ayarlar,
    );
  }, [mahalleVerileri, seciliIndex, seciliProjeksiyon]);

  const agirliklar: TehlikeAgirliklari = useMemo(
    () => ({
      yesilAlan: ayarlar.tehlike_agirliklari.yesil_alan,
      binaYogunlugu: ayarlar.tehlike_agirliklari.bina_yogunlugu,
    }),
    [],
  );

  const izgaraKatmani = useMemo(() => {
    if (!izgaraGoster || !izgaraVeri || izgaraVeri.ad !== seciliAd || izgaraVeri.hucreler.length === 0) {
      return null;
    }
    const simulasyonAktif = senaryoAktif && simYesil > 0;
    const baseline = hesaplaHucreTehlikeleri(izgaraVeri.hucreler, agirliklar);
    const baselineOzellikleri = izgaraVeri.hucreler.map((h, i) => ({
      yesil_alan_orani: h.yesil_alan_orani,
      bina_yogunlugu: h.bina_yogunlugu,
      tehlike: baseline[i],
    }));

    let hucreOzellikleri: { yesil_alan_orani: number; bina_yogunlugu: number; tehlike: number }[];
    let hedefUygulamaTuru: 'hucre' | 'mahalle' = 'mahalle';

    if (!simulasyonAktif) {
      hucreOzellikleri = baselineOzellikleri;
    } else if (simHedef === 'hucre' && seciliHucreIndex !== null && izgaraVeri.hucreler[seciliHucreIndex]) {
      hucreOzellikleri = [...baselineOzellikleri];
      const tekSonuc = simuleHucreYesillestirme(
        [izgaraVeri.hucreler[seciliHucreIndex]],
        simYesil,
        ayarlar.simulasyon_bina_azaltma_katsayisi,
        agirliklar
      );
      hucreOzellikleri[seciliHucreIndex] = tekSonuc[0];
      hedefUygulamaTuru = 'hucre';
    } else {
      hucreOzellikleri = simuleHucreYesillestirme(
        izgaraVeri.hucreler,
        simYesil,
        ayarlar.simulasyon_bina_azaltma_katsayisi,
        agirliklar
      );
      hedefUygulamaTuru = 'mahalle';
    }

    const tehlikeler = hucreOzellikleri.map((h) => h.tehlike);
    return { ad: izgaraVeri.ad, hucreler: izgaraVeri.hucreler, hucreOzellikleri, tehlikeler, baselineTehlikeler: baseline, simulasyonAktif, hedefUygulamaTuru };
  }, [izgaraGoster, izgaraVeri, seciliAd, agirliklar, simYesil, seciliHucreIndex, senaryoAktif, simHedef]);

  const izgaraKesisenSiteler = useMemo(() => {
    if (!izgaraKatmani || !seciliMahalle || !baglamVeri) return null;
    return baglamVeri.siteler.filter((s) => siteMahalleyleKesisiyorMu(s, seciliMahalle.sinir));
  }, [izgaraKatmani, seciliMahalle, baglamVeri]);

  const seciliHucreDetay = useMemo(() => {
    if (seciliHucreIndex === null || !izgaraKatmani) return null;
    const ozellik = izgaraKatmani.hucreOzellikleri[seciliHucreIndex];
    if (!ozellik) return null;
    return ozellik;
  }, [seciliHucreIndex, izgaraKatmani]);

  const seciliHucreSiteAdi = useMemo(() => {
    if (seciliHucreIndex === null || !izgaraKatmani || !baglamVeri) return null;
    const hucre = izgaraKatmani.hucreler[seciliHucreIndex];
    if (!hucre) return null;
    const site = hucreIcindekiSiteyiBul(hucre, baglamVeri.siteler);
    return site?.ad ?? null;
  }, [seciliHucreIndex, izgaraKatmani, baglamVeri]);

  const hucreYuzdelikDilimi = useMemo(() => {
    if (seciliHucreIndex === null || !izgaraKatmani) return null;
    const hucreTehlike = izgaraKatmani.baselineTehlikeler[seciliHucreIndex];
    if (hucreTehlike === undefined) return null;
    return hucreTehlikeYuzdelikDilimiHesapla(hucreTehlike, izgaraKatmani.baselineTehlikeler);
  }, [seciliHucreIndex, izgaraKatmani]);

  const hucreTermalStresOnerisi = useMemo(() => {
    if (!seciliHucreDetay || !seciliSkor) return null;
    return hucreTermalStresOnerisiBelirle(
      seciliHucreDetay.tehlike,
      seciliSkor.maruziyet,
      seciliHucreDetay.yesil_alan_orani,
      seciliHucreDetay.bina_yogunlugu,
      agirliklar,
      ayarlar.termal_stres_esikleri
    );
  }, [seciliHucreDetay, seciliSkor, agirliklar, ayarlar.termal_stres_esikleri]);

  const yesilSimSonuc = useMemo(() => {
    if (!seciliMahalle || !seciliSkor) return null;
    return simuleYesilAlan(
      {
        ad: seciliMahalle.ad,
        yesilAlanOrani: seciliMahalle.yesil_alan_orani,
        binaYogunlugu: seciliMahalle.bina_yogunlugu,
        maruziyet: seciliSkor.maruziyet,
        agirliklar,
      },
      simYesil,
      ayarlar.simulasyon_bina_azaltma_katsayisi,
    );
  }, [seciliMahalle, seciliSkor, simYesil, agirliklar]);

  // Izgara sim aktifken TUM alt modlarda (tek hucre secili VEYA hicbiri secili
  // degilken butun izgaraya "en kotu once" dagitimi) panel riski izgaraKatmani.
  // hucreOzellikleri'nden (yani haritada gorunen ayni simule edilmis hucre
  // durumundan) hesaplanir - seciliHucreIndex burada ayrica kontrol edilmez,
  // cunku izgaraKatmani zaten onu hesaba katarak hucreOzellikleri'ni uretir.
  const hucreBazliSimSonuc = useMemo(() => {
    if (!izgaraKatmani || !izgaraKatmani.simulasyonAktif || !seciliSkor) return null;
    return hucreBazliMahalleSkoruHesapla(izgaraKatmani.hucreOzellikleri, seciliSkor.maruziyet, agirliklar);
  }, [izgaraKatmani, seciliSkor, agirliklar]);

  const efektifYesilSimSonuc = hucreBazliSimSonuc ?? yesilSimSonuc;

  const nufusSimSonuclari = useMemo(() => {
    if (seciliIndex < 0 || mahalleVerileri.length === 0) return null;
    const girdi: MahalleGirdi[] = mahalleVerileri.map((v) => ({
      ad: v.ad,
      yesilAlanOrani: v.yesilAlanOrani,
      binaYogunlugu: v.binaYogunlugu,
      nufus: v.nufus,
      alanKm2: v.zarfAlanKm2,
    }));
    return simuleNufus(
      girdi,
      seciliIndex,
      simNufusYuzde / 100,
      agirliklar,
      ayarlar.maruziyet_alt_siniri,
    );
  }, [mahalleVerileri, seciliIndex, simNufusYuzde, agirliklar]);

  const nufusSimYeniRisk = useMemo(() => {
    if (!nufusSimSonuclari || !seciliAd) return null;
    const sonuc = nufusSimSonuclari.find((s) => s.ad === seciliAd);
    return sonuc?.risk ?? null;
  }, [nufusSimSonuclari, seciliAd]);

  const nufusSimYeniRank = useMemo(() => {
    if (!nufusSimSonuclari || !seciliAd) return null;
    const sirali = [...nufusSimSonuclari].sort((a, b) => b.risk - a.risk);
    const idx = sirali.findIndex((s) => s.ad === seciliAd);
    return idx >= 0 ? idx + 1 : null;
  }, [nufusSimSonuclari, seciliAd]);

  const yesilSimYeniRank = useMemo(() => {
    if (!efektifYesilSimSonuc || !seciliAd || mevcutSkorlar.length === 0) return null;
    return hesaplaSimuleRank(mevcutSkorlar, seciliAd, efektifYesilSimSonuc.risk);
  }, [mevcutSkorlar, seciliAd, efektifYesilSimSonuc]);

  // Iki slider da (yesil alan artisi VE nufus artisi) sifirdan farkliysa birlesik
  // senaryo sonucu hesaplanir; tek slider aktifken null doner (Simulasyon.tsx bu
  // durumda birlesik satiri gostermez, cunku birlesik = o tek slider'in sonucuna
  // esittir zaten - bkz. hesaplaBirlesikSenaryoSonucu dokumantasyonu).
  const birlesikSenaryoSonuc = useMemo(() => {
    if (simYesil <= 0 || simNufusYuzde <= 0) return null;
    if (!efektifYesilSimSonuc || !nufusSimSonuclari || !seciliAd) return null;
    return hesaplaBirlesikSenaryoSonucu(efektifYesilSimSonuc.tehlike, nufusSimSonuclari, seciliAd);
  }, [simYesil, simNufusYuzde, efektifYesilSimSonuc, nufusSimSonuclari, seciliAd]);

  const butceSonuc = useMemo(() => {
    if (mevcutSkorlar.length === 0) return { secilenler: [] as number[], kapsananRiskYuzdesi: 0 };
    return secBudceKisitli(mevcutSkorlar, simButce);
  }, [mevcutSkorlar, simButce]);

  const butceSecilenAdlari = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const idx of butceSonuc.secilenler) {
      const ad = mevcutSkorlar[idx]?.ad;
      if (ad) set.add(ad);
    }
    return set;
  }, [butceSonuc, mevcutSkorlar]);

  const tipolojiGuncelDegil = !tipoloji || !tipoloji.guncel;
  const projeksiyonGuncelDegil = !projeksiyon || !projeksiyon.guncel;

  const skorlarByAd = useMemo(() => {
    const map: Record<string, { tehlike: number; maruziyet: number; risk: number }> = {};
    for (const s of mevcutSkorlar) {
      map[s.ad] = { tehlike: s.tehlike, maruziyet: s.maruziyet, risk: s.risk };
    }
    return map;
  }, [mevcutSkorlar]);

  const butceSecilenListesi = useMemo(() => {
    return butceSonuc.secilenler.map((originalIdx, rankIdx) => {
      const s = mevcutSkorlar[originalIdx];
      return { ad: s.ad, rank: rankIdx + 1, risk: s.risk };
    });
  }, [butceSonuc, mevcutSkorlar]);

  const onAktifSekmeChange = (sekme: 'inceleme' | 'senaryo') => {
    setAktifSekme((mevcut) => {
      if (mevcut === 'senaryo' && sekme === 'inceleme') {
        setSimYesil(0);
        setSimNufusYuzde(0);
        setSimHedef('mahalle');
      }
      return sekme;
    });
  };

  const onIzgaraGosterChange = (goster: boolean) => {
    setIzgaraGoster(goster);
    if (!goster) {
      setSeciliHucreIndex(null);
      setSimHedef('mahalle');
    }
  };

  const onSecim = (ad: string) => {
    setSeciliAd((mevcut) => {
      if (mevcut !== ad) {
        setSimYesil(0);
        setSimNufusYuzde(0);
        setSeciliHucreIndex(null);
        setSimHedef('mahalle');
      }
      return ad;
    });
  };

  const onHucreSecim = (index: number) => setSeciliHucreIndex(index);

  if (hata) {
    return (
      <div className="min-h-screen bg-page text-ink font-sans flex flex-col items-center justify-center gap-4 px-6">
        <div className="bg-red-50 border border-red-300 rounded-xl p-6 max-w-md text-center">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Veri Yüklenemedi</h2>
          <p className="text-sm text-red-700">{hata}</p>
        </div>
      </div>
    );
  }

  if (!mahalleler) {
    return (
      <div className="min-h-screen bg-page text-ink font-sans flex items-center justify-center">
        <p className="text-muted text-lg">Yükleniyor…</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-page text-ink font-sans overflow-hidden">
      <header className="px-7 py-4 bg-kurum flex items-center gap-4 flex-shrink-0">
        <h1 className="text-lg font-semibold tracking-tight text-page">
          Başakşehir Isı Adası Haritası
        </h1>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-page text-kurum">
          Faz 1
        </span>
        <MahalleArama mahalleler={mahalleler} onSecim={onSecim} />
      </header>

      <div
        className="flex-1 min-h-0 grid gap-5 p-5"
        style={{ gridTemplateColumns: 'minmax(0, 2.7fr) minmax(0, 1fr)' }}
      >
        <Harita
          mahalleler={mahalleler}
          skorlarByAd={skorlarByAd}
          renkEsikleri={ayarlar.renk_esikleri}
          seciliAd={seciliAd}
          onSecim={onSecim}
          onHucreSecim={onHucreSecim}
          seciliHucreIndex={seciliHucreIndex}
          butceSecilenAdlari={senaryoAktif ? butceSecilenAdlari : BOS_BUTCE_SETI}
          butceGorunumuAktif={senaryoAktif}
          simulasyonOnizlemeAktif={senaryoAktif && (simYesil > 0 || simNufusYuzde !== 0)}
          izgaraKatmani={izgaraKatmani}
          baglamVeri={baglamVeri}
          kesisenSiteler={izgaraKesisenSiteler}
        />

        <div className="flex flex-col gap-4 min-h-0 min-w-0 overflow-y-auto pr-1">
          {/* Sekme butonları */}
          <div className="flex rounded-lg border border-contur overflow-hidden self-start flex-shrink-0">
            {(['inceleme', 'senaryo'] as const).map((sekme) => (
              <button
                key={sekme}
                onClick={() => onAktifSekmeChange(sekme)}
                className={`text-xs px-3 py-1.5 transition-colors ${
                  aktifSekme === sekme ? 'bg-accent/10 border-accent/40' : 'hover:bg-panel'
                }`}
              >
                {sekme === 'inceleme' ? 'İnceleme' : 'Senaryo'}
              </button>
            ))}
          </div>

          {aktifSekme === 'inceleme' && (
            <>
              <OncelikListesi
                siraliSkorlar={oncelikListesiSirali}
                tipolojiByAd={tipolojiByAd}
                tipolojiEslemesi={tipolojiEtiketEslemesi}
                tipolojiGuncelDegil={tipolojiGuncelDegil}
                renkEsikleri={ayarlar.renk_esikleri}
                seciliAd={seciliAd}
                onSecim={onSecim}
                uyusmazlik={uyusmazlik}
                siralamaModu={siralamaModu}
                onSiralamaModuChange={setSiralamaModu}
              />

              {seciliMahalle && seciliSkor && (
                <DetayPaneli
                  mahalle={seciliMahalle}
                  skor={seciliSkor}
                  rank={seciliRank}
                  toplamMahalle={mahalleler.length}
                  renkEsikleri={ayarlar.renk_esikleri}
                  tipolojiEtiket={seciliTipolojiBilgi?.etiket ?? null}
                  mudahaleMetni={seciliTipolojiBilgi?.mudahale ?? null}
                  tipolojiGuncelDegil={tipolojiGuncelDegil}
                  projeksiyon={seciliProjeksiyon}
                  projeksiyonRiski={seciliProjeksiyonRiski}
                  projeksiyonGuncelDegil={projeksiyonGuncelDegil}
                  izgaraGoster={izgaraGoster}
                  onIzgaraGosterChange={onIzgaraGosterChange}
                  izgaraYukleniyor={izgaraYukleniyor}
                  izgaraHata={izgaraHata}
                  seciliHucreDetay={seciliHucreDetay}
                  hucreYuzdelikDilimi={hucreYuzdelikDilimi}
                  hucreTermalStresOnerisi={hucreTermalStresOnerisi}
                  seciliHucreSiteAdi={seciliHucreSiteAdi}
                />
              )}
            </>
          )}

          {aktifSekme === 'senaryo' && (
            <>
              {seciliMahalle && seciliSkor && (
                <Simulasyon
                  izgaraGoster={izgaraGoster}
                  onIzgaraGosterChange={onIzgaraGosterChange}
                  hucreSeciliMi={seciliHucreIndex !== null}
                  simHedef={simHedef}
                  onSimHedefChange={setSimHedef}
                  ayarlar={{
                    simulasyon_bina_azaltma_katsayisi:
                      ayarlar.simulasyon_bina_azaltma_katsayisi,
                  }}
                  seciliAd={seciliAd}
                  seciliSkor={seciliSkor ? { risk: seciliSkor.risk } : null}
                  yesilSimSonuc={efektifYesilSimSonuc}
                  simYesil={simYesil}
                  onSimYesilChange={setSimYesil}
                  nufusSimYeniRisk={nufusSimYeniRisk}
                  nufusSimYeniRank={nufusSimYeniRank}
                  yesilSimYeniRank={yesilSimYeniRank}
                  birlesikSenaryoSonuc={birlesikSenaryoSonuc}
                  seciliBaseRank={seciliRank}
                  simNufusYuzde={simNufusYuzde}
                  onSimNufusYuzdeChange={setSimNufusYuzde}
                  simButce={simButce}
                  onSimButceChange={setSimButce}
                  butceKapsananRiskYuzdesi={butceSonuc.kapsananRiskYuzdesi}
                  butceSecilenler={butceSecilenListesi}
                />
              )}
              <ImarHesaplayici
                mahalleler={mahalleVerileri}
                ayarlar={ayarlar}
                varsayilanHedefRisk={ayarlar.renk_esikleri.dusuk}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
