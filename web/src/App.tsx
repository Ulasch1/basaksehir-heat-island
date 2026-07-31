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
  simuleHucreYesillestirme,
  siralaOncelikListesi,
  type MahalleVeri,
  type MahalleSkoru,
  type ProjeksiyonRiski,
  type SiralamaModu,
} from './skorHesapla';
import { simuleYesilAlan, simuleNufus, secBudceKisitli } from './skor';
import type { MahalleGirdi, TehlikeAgirliklari } from './skor';
import { izgaraGetir, type IzgaraHucre } from './veriKaynagi';
import { hesaplaHucreTehlikeleri } from './skorHesapla';
import Harita from './bilesenler/Harita';
import OncelikListesi from './bilesenler/OncelikListesi';
import DetayPaneli from './bilesenler/DetayPaneli';
import Simulasyon from './bilesenler/Simulasyon';

interface TipolojiEslemeKaydi {
  etiket: string;
  mudahale: string;
}

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

  const seciliTipolojiBilgi = useMemo<TipolojiEslemeKaydi | null>(() => {
    if (seciliTipolojiIndex == null) return null;
    const esleme = ayarlar.tipoloji_mudahale_eslemesi as Record<string, TipolojiEslemeKaydi>;
    return esleme[String(seciliTipolojiIndex)] ?? null;
  }, [seciliTipolojiIndex]);

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
    const simulasyonAktif = simYesil > 0;
    const baseline = hesaplaHucreTehlikeleri(izgaraVeri.hucreler, agirliklar);
    const hucreOzellikleri = simulasyonAktif
      ? simuleHucreYesillestirme(
          izgaraVeri.hucreler,
          simYesil,
          ayarlar.simulasyon_bina_azaltma_katsayisi,
          agirliklar
        )
      : izgaraVeri.hucreler.map((h, i) => ({
          yesil_alan_orani: h.yesil_alan_orani,
          bina_yogunlugu: h.bina_yogunlugu,
          tehlike: baseline[i],
        }));
    const tehlikeler = hucreOzellikleri.map((h) => h.tehlike);
    return { ad: izgaraVeri.ad, hucreler: izgaraVeri.hucreler, hucreOzellikleri, tehlikeler, simulasyonAktif };
  }, [izgaraGoster, izgaraVeri, seciliAd, agirliklar, simYesil]);

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
    if (!yesilSimSonuc || !seciliAd || mevcutSkorlar.length === 0) return null;
    return hesaplaSimuleRank(mevcutSkorlar, seciliAd, yesilSimSonuc.risk);
  }, [mevcutSkorlar, seciliAd, yesilSimSonuc]);

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

  const onSecim = (ad: string) => setSeciliAd(ad);

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
      <header className="px-7 py-4 border-b border-contur flex items-baseline gap-4 flex-shrink-0">
        <h1 className="text-lg font-semibold tracking-tight">
          Kentsel Isı Riski Önceliklendirme Paneli
        </h1>
        <span className="text-sm text-muted">
          Başakşehir Belediyesi – Çevre ve Park Bahçeler Birimi – Faz 1 Karar Destek
        </span>
      </header>

      <div
        className="flex-1 min-h-0 grid gap-5 p-5"
        style={{ gridTemplateColumns: '2.7fr 1fr' }}
      >
        <Harita
          mahalleler={mahalleler}
          skorlarByAd={skorlarByAd}
          renkEsikleri={ayarlar.renk_esikleri}
          seciliAd={seciliAd}
          onSecim={onSecim}
          butceSecilenAdlari={butceSecilenAdlari}
          izgaraKatmani={izgaraKatmani}
        />

        <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
          <OncelikListesi
            siraliSkorlar={oncelikListesiSirali}
            tipolojiByAd={tipolojiByAd}
            tipolojiEslemesi={
              ayarlar.tipoloji_mudahale_eslemesi as Record<string, TipolojiEslemeKaydi>
            }
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
              onIzgaraGosterChange={setIzgaraGoster}
              izgaraYukleniyor={izgaraYukleniyor}
              izgaraHata={izgaraHata}
            />
          )}

          <Simulasyon
            ayarlar={{
              simulasyon_bina_azaltma_katsayisi:
                ayarlar.simulasyon_bina_azaltma_katsayisi,
            }}
            seciliAd={seciliAd}
            seciliSkor={seciliSkor ? { risk: seciliSkor.risk } : null}
            yesilSimSonuc={yesilSimSonuc}
            simYesil={simYesil}
            onSimYesilChange={setSimYesil}
            nufusSimYeniRisk={nufusSimYeniRisk}
            nufusSimYeniRank={nufusSimYeniRank}
            yesilSimYeniRank={yesilSimYeniRank}
            seciliBaseRank={seciliRank}
            simNufusYuzde={simNufusYuzde}
            onSimNufusYuzdeChange={setSimNufusYuzde}
            simButce={simButce}
            onSimButceChange={setSimButce}
            butceKapsananRiskYuzdesi={butceSonuc.kapsananRiskYuzdesi}
            butceSecilenler={butceSecilenListesi}
          />
        </div>
      </div>
    </div>
  );
}
