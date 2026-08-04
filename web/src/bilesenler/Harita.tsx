import { useMemo, useEffect, useRef, useState, type ComponentType } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
} from 'react-leaflet';
import type { GeoJSONProps } from 'react-leaflet';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import L from 'leaflet';
import { riskRengi, KOVA_RENKLERI, golgeRengi, BAGLAM_RENKLERI, yolSorumlulukRengi, SIMULASYON_RENGI } from '../renk';
import type { Mahalle, IzgaraHucre, BaglamVerisi, BaglamSite, MahalleSinir } from '../veriKaynagi';
import { izgaraGeoJsonOlustur, hucreIcindekiSiteyiBul } from '../skorHesapla';
import { dosyaIndir, dosyaAdiGuvenliHaleGetir } from '../dosyaIndir';

const GeoJSONCanvas = GeoJSON as unknown as ComponentType<
  GeoJSONProps & { renderer?: L.Renderer }
>;

interface HaritaProps {
  mahalleler: Mahalle[];
  skorlarByAd: Record<string, { tehlike: number; maruziyet: number; risk: number }>;
  renkEsikleri: { dusuk: number; yuksek: number };
  seciliAd: string | null;
  onSecim: (ad: string) => void;
  onHucreSecim: (index: number) => void;
  seciliHucreIndex: number | null;
  /** Secili mahallede yesil alan/nufus simulasyonlarindan biri aktifken true.
   * Serbest mod ile simulasyon onizlemesini haritada gorsel olarak ayirmak icin. */
  simulasyonOnizlemeAktif: boolean;
  izgaraKatmani: {
    ad: string;
    hucreler: IzgaraHucre[];
    hucreOzellikleri: { yesil_alan_orani: number; bina_yogunlugu: number; tehlike: number }[];
    tehlikeler: number[];
    baselineTehlikeler: number[];
    simulasyonAktif: boolean;
    hedefUygulamaTuru: 'hucre' | 'mahalle';
  } | null;
  baglamVeri: BaglamVerisi | null;
  kesisenSiteler: BaglamSite[] | null;
}

export default function Harita({
  mahalleler,
  skorlarByAd,
  renkEsikleri,
  seciliAd,
  onSecim,
  onHucreSecim,
  seciliHucreIndex,
  simulasyonOnizlemeAktif,
  izgaraKatmani,
  baglamVeri,
  kesisenSiteler,
}: HaritaProps) {
  // Operasyonel baglam katmani - varsayilan olarak KAPALI (ana risk gorunumunu
  // kirletmesin diye), kullanici acikca ac/kapat yapar. Bu state SADECE Harita.tsx'e
  // ozeldir, App.tsx veya baska hicbir bilesen bunu okumaz/etkilemez.
  const [siteGoster, setSiteGoster] = useState(false);
  const [yolGoster, setYolGoster] = useState(false);
  const [osbGoster, setOsbGoster] = useState(false);
  const [renkGoster, setRenkGoster] = useState(true);

  // Tum mahalleleri iceren feature collection (sadece harita gorunumunu hesaplamak icin)
  const tumMahalleFeatureCollection = useMemo<FeatureCollection>(() => {
    const features: Feature[] = mahalleler.map((m) => ({
      type: 'Feature' as const,
      geometry: m.sinir as unknown as Geometry,
      properties: { ad: m.ad },
    }));
    return { type: 'FeatureCollection', features };
  }, [mahalleler]);

  const bounds = useMemo(() => {
    return L.geoJSON(tumMahalleFeatureCollection as unknown as GeoJSON.GeoJsonObject).getBounds();
  }, [tumMahalleFeatureCollection]);

  // Ana harita katmani icin gosterilecek mahalleler (izgaraKatmani varsa o mahalle haric)
  const anaFeatureCollection = useMemo<FeatureCollection>(() => {
    const filtrelenmis = izgaraKatmani
      ? mahalleler.filter((m) => m.ad !== izgaraKatmani.ad)
      : mahalleler;
    const features: Feature[] = filtrelenmis.map((m) => ({
      type: 'Feature' as const,
      geometry: m.sinir as unknown as Geometry,
      properties: { ad: m.ad },
    }));
    return { type: 'FeatureCollection', features };
  }, [mahalleler, izgaraKatmani]);

  const izgaraFeatureCollection = useMemo<FeatureCollection | null>(() => {
    if (!izgaraKatmani || izgaraKatmani.hucreler.length === 0) return null;
    const features: Feature[] = izgaraKatmani.hucreler.map((hucre, i) => ({
      type: 'Feature' as const,
      geometry: hucre.sinir as unknown as Geometry,
      properties: { tehlike: izgaraKatmani.tehlikeler[i], hucreIndex: i },
    }));
    return { type: 'FeatureCollection', features };
  }, [izgaraKatmani]);

  const izgaraMinMax = useMemo(() => {
    if (!izgaraKatmani || izgaraKatmani.baselineTehlikeler.length === 0) return null;
    const baseline = izgaraKatmani.baselineTehlikeler;
    const min = Math.min(...baseline);
    const max = Math.max(...baseline);
    return { min, max };
  }, [izgaraKatmani]);

  const seciliMahalleFeature = useMemo<Feature | null>(() => {
    if (!seciliAd) return null;
    const m = mahalleler.find((mh) => mh.ad === seciliAd);
    if (!m) return null;
    return {
      type: 'Feature' as const,
      geometry: m.sinir as unknown as Geometry,
      properties: { ad: m.ad },
    };
  }, [mahalleler, seciliAd]);

  const canvasRenderer = useMemo(() => L.canvas(), []);

  const siteFeatureCollection = useMemo<FeatureCollection | null>(() => {
    if (!baglamVeri || baglamVeri.siteler.length === 0) return null;
    const features: Feature[] = baglamVeri.siteler.map((s) => ({
      type: 'Feature' as const,
      geometry: s.sinir as unknown as Geometry,
      properties: { ad: s.ad },
    }));
    return { type: 'FeatureCollection', features };
  }, [baglamVeri]);

  const yolFeatureCollection = useMemo<FeatureCollection | null>(() => {
    if (!baglamVeri || baglamVeri.yol_agi.length === 0) return null;
    const features: Feature[] = baglamVeri.yol_agi.map((y) => ({
      type: 'Feature' as const,
      geometry: y.sinir as unknown as Geometry,
      properties: { sorumluluk: y.sorumluluk, highway_tipi: y.highway_tipi },
    }));
    return { type: 'FeatureCollection', features };
  }, [baglamVeri]);

  const osbFeatureCollection = useMemo<FeatureCollection | null>(() => {
    if (!baglamVeri || baglamVeri.disli_alanlar.length === 0) return null;
    const features: Feature[] = baglamVeri.disli_alanlar.map((d) => ({
      type: 'Feature' as const,
      geometry: d.sinir as unknown as Geometry,
      properties: { ad: d.ad, not: d.not },
    }));
    return { type: 'FeatureCollection', features };
  }, [baglamVeri]);

  const siteStyleFn = useMemo(
    () => () => ({
      fillColor: BAGLAM_RENKLERI.site,
      fillOpacity: 0.5,
      weight: 1,
      color: BAGLAM_RENKLERI.siteKontur,
    }),
    [],
  );

  const otomatikSiteFeatureCollection = useMemo<FeatureCollection | null>(() => {
    if (!kesisenSiteler || kesisenSiteler.length === 0) return null;
    const features: Feature[] = kesisenSiteler.map((s) => ({
      type: 'Feature' as const,
      geometry: s.sinir as unknown as Geometry,
      properties: { ad: s.ad },
    }));
    return { type: 'FeatureCollection', features };
  }, [kesisenSiteler]);

  const otomatikSiteStyleFn = useMemo(
    () => () => ({
      fillOpacity: 0,
      weight: 1.5,
      color: BAGLAM_RENKLERI.siteKontur,
    }),
    [],
  );

  const onEachSiteFeature = useMemo(
    () => (feature: Feature, layer: L.Layer) => {
      const ad = feature.properties?.ad as string | undefined;
      if (ad) {
        layer.bindPopup(ad);
      }
    },
    [],
  );

  const yolStyleFn = useMemo(
    () => (feature: Feature | undefined) => {
      const sorumluluk = (feature?.properties?.sorumluluk as 'buyuksehir' | 'ilce') ?? 'ilce';
      return { color: yolSorumlulukRengi(sorumluluk), weight: 3, opacity: 0.85 };
    },
    [],
  );

  const onEachYolFeature = useMemo(
    () => (feature: Feature, layer: L.Layer) => {
      const sorumluluk = feature.properties?.sorumluluk as string | undefined;
      const highwayTipi = feature.properties?.highway_tipi as string | undefined;
      const etiket = sorumluluk === 'buyuksehir' ? 'Büyükşehir (yaklaşık)' : 'İlçe (yaklaşık)';
      layer.bindPopup(`${etiket} · ${highwayTipi ?? ''}`);
    },
    [],
  );

  const osbStyleFn = useMemo(
    () => () => ({
      fillOpacity: 0,
      weight: 2,
      color: BAGLAM_RENKLERI.osbSinir,
      dashArray: '4,4',
    }),
    [],
  );

  const onEachOsbFeature = useMemo(
    () => (feature: Feature, layer: L.Layer) => {
      const ad = feature.properties?.ad as string | undefined;
      const not = feature.properties?.not as string | undefined;
      layer.bindPopup(`${ad ?? ''} — ${not ?? ''}`);
    },
    [],
  );

  const onEachIzgaraFeature = useMemo(
    () => (feature: Feature, layer: L.Layer) => {
      layer.on('click', () => {
        const hucreIndex = feature.properties?.hucreIndex as number | undefined;
        if (hucreIndex !== undefined) onHucreSecim(hucreIndex);
      });
      // Bir hücre bir "site" poligonunun içinde kalıyorsa, üstteki site katmanı
      // (interactive={false}) artık tıklamayı bloklamıyor; site bilgisini bunun
      // yerine burada, hücrenin kendi üzerinde hover ile açılan bir baloncukla
      // (tıklama gerekmeden) gösteriyoruz, böylece hücre her zaman tıklanabilir kalır.
      if (kesisenSiteler && kesisenSiteler.length > 0) {
        const site = hucreIcindekiSiteyiBul(
          { sinir: feature.geometry as unknown as MahalleSinir },
          kesisenSiteler,
        );
        if (site) {
          layer.bindTooltip(site.ad, { sticky: true, direction: 'top' });
        }
      }
    },
    [onHucreSecim, kesisenSiteler],
  );

  const izgaraStyleFn = useMemo(
    () => (feature: Feature | undefined) => {
      const isSelected = feature?.properties?.hucreIndex === seciliHucreIndex;
      if (!feature || izgaraMinMax === null) {
        return {
          fillOpacity: 0.85,
          weight: isSelected ? 2.5 : 0.5,
          color: isSelected ? 'oklch(0.55 0.15 150)' : 'oklch(0.85 0.01 260)',
        };
      }
      const tehlike = feature.properties?.tehlike as number;
      const fillColor = golgeRengi(tehlike, izgaraMinMax.min, izgaraMinMax.max);
      return {
        fillColor,
        fillOpacity: 0.85,
        weight: isSelected ? 2.5 : 0.5,
        color: isSelected ? 'oklch(0.55 0.15 150)' : 'oklch(0.85 0.01 260)',
      };
    },
    [izgaraMinMax, seciliHucreIndex],
  );

  const geoJsonKey = useMemo(() => {
    const izgaraAd = izgaraKatmani ? izgaraKatmani.ad : '';
    return `${seciliAd ?? '-'}__${izgaraAd}__${renkGoster}__${simulasyonOnizlemeAktif}`;
  }, [seciliAd, izgaraKatmani, renkGoster, simulasyonOnizlemeAktif]);

  const izgaraGeoJsonKey = useMemo(() => {
    if (!izgaraKatmani) return '';
    const tehlikeToplami = izgaraKatmani.tehlikeler.reduce((acc, t) => acc + t, 0);
    return `izgara-${izgaraKatmani.ad}-${izgaraKatmani.simulasyonAktif}-${tehlikeToplami.toFixed(6)}`;
  }, [izgaraKatmani]);

  const otomatikSiteKatmaniKey = useMemo(() => {
    const adListesi = kesisenSiteler ? kesisenSiteler.map((s) => s.ad).join(",") : "";
    return `kesisen-siteler-${seciliAd ?? "-"}-${adListesi}`;
  }, [seciliAd, kesisenSiteler]);

  const styleFn = useMemo(
    () => (feature: Feature | undefined) => {
      if (!feature) return {};
      const ad = feature.properties?.ad as string | undefined;
      const skor = ad ? skorlarByAd[ad] : undefined;
      const risk = skor?.risk ?? 0;

      const isSelected = ad === seciliAd;
      // Simulasyon onizlemesi SADECE secili mahallede ve SADECE gorunumu etkiler:
      // gercek risk (skorlarByAd) degismez, sadece bu mahallenin haritadaki dolgu/
      // kontur rengi "serbest mod" risk paletinden cikip ayri bir simulasyon
      // rengine gecer. Boylece "gordugum renk gercek mi, onizleme mi" hicbir zaman
      // belirsiz kalmaz ve simulasyon rengi hicbir risk kovasiyla cakismaz.
      const simulasyonOnizlemesi = isSelected && simulasyonOnizlemeAktif;

      const fillColor = simulasyonOnizlemesi
        ? SIMULASYON_RENGI.dolgu
        : riskRengi(risk, renkEsikleri);

      const weight = isSelected ? 2.5 : 1;
      const color = simulasyonOnizlemesi
        ? SIMULASYON_RENGI.kontur
        : isSelected
          ? 'oklch(0.55 0.15 150)'
          : 'oklch(0.85 0.01 260)';

      // Renk kapatıldığında (yol/altlık görmek için) dolgu tamamen şeffaf, sadece
      // kontur kalır. Renk açıkken, bir mahalle seçiliyse diğerlerinin dolgusu
      // soluklaştırılır ki seçili mahalle aynı risk kovasındaki (dolayısıyla aynı
      // renkteki) komşusuyla görsel olarak birleşmesin.
      const fillOpacity = !renkGoster ? 0 : isSelected ? 0.75 : seciliAd ? 0.3 : 0.75;

      return {
        fillColor,
        fillOpacity,
        weight,
        color,
      };
    },
    [skorlarByAd, renkEsikleri, seciliAd, renkGoster, simulasyonOnizlemeAktif],
  );

  const onEachFeature = useMemo(
    () => (feature: Feature, layer: L.Layer) => {
      layer.on('click', () => {
        const ad = feature.properties?.ad as string | undefined;
        if (ad) onSecim(ad);
      });
    },
    [onSecim],
  );

  return (
    <div className="bg-panel border border-contur rounded-xl p-2 flex flex-col min-h-0">
      <div className="text-[13px] text-muted text-center mb-2 flex-shrink-0">
        Risk Haritası
      </div>

      <div className="flex-1 min-h-0 rounded-md overflow-hidden relative">
        {izgaraKatmani && (
          <button
            className="absolute top-2 right-2 z-[1000] text-xs px-2 py-1 rounded-md border border-contur bg-panel/90 hover:bg-panel shadow-sm"
            onClick={() => {
              const geoJson = izgaraGeoJsonOlustur(
                izgaraKatmani.hucreler,
                izgaraKatmani.hucreOzellikleri,
                izgaraKatmani.simulasyonAktif,
              );
              const dosyaAdi = `${dosyaAdiGuvenliHaleGetir(izgaraKatmani.ad)}-izgara.json`;
              dosyaIndir(JSON.stringify(geoJson, null, 2), dosyaAdi, 'application/json');
            }}
          >
            Hücreleri GeoJSON indir
          </button>
        )}
        <MapContainer
          bounds={bounds}
          className="h-full w-full"
          zoomControl={true}
          scrollWheelZoom={true}
          style={{ background: 'oklch(0.9 0.008 260)' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap katkıcıları (ODbL) — TÜİK ADNKS"
          />
          <HaritaSecimTakipcisi seciliFeature={seciliMahalleFeature} />
          <GeoJSON
            key={geoJsonKey}
            data={anaFeatureCollection as unknown as GeoJSON.GeoJsonObject}
            style={styleFn}
            onEachFeature={onEachFeature}
          />
          {izgaraFeatureCollection && izgaraMinMax && (
            <GeoJSONCanvas
              key={izgaraGeoJsonKey}
              data={izgaraFeatureCollection as unknown as GeoJSON.GeoJsonObject}
              style={izgaraStyleFn}
              onEachFeature={onEachIzgaraFeature}
              renderer={canvasRenderer}
            />
          )}
          {izgaraKatmani && otomatikSiteFeatureCollection && (
            <GeoJSONCanvas
              key={otomatikSiteKatmaniKey}
              data={otomatikSiteFeatureCollection as unknown as GeoJSON.GeoJsonObject}
              style={otomatikSiteStyleFn}
              renderer={canvasRenderer}
              interactive={false}
            />
          )}
          {izgaraKatmani && seciliMahalleFeature && (
            <GeoJSON
              key={`secili-cerceve-${izgaraKatmani.ad}`}
              data={seciliMahalleFeature as unknown as GeoJSON.GeoJsonObject}
              style={() => ({ fillOpacity: 0, weight: 2.5, color: 'oklch(0.55 0.15 150)' })}
              interactive={false}
            />
          )}
          {siteGoster && siteFeatureCollection && (
            <GeoJSONCanvas
              key="baglam-siteler"
              data={siteFeatureCollection as unknown as GeoJSON.GeoJsonObject}
              style={siteStyleFn}
              onEachFeature={onEachSiteFeature}
              renderer={canvasRenderer}
            />
          )}
          {yolGoster && yolFeatureCollection && (
            <GeoJSONCanvas
              key="baglam-yol-agi"
              data={yolFeatureCollection as unknown as GeoJSON.GeoJsonObject}
              style={yolStyleFn}
              onEachFeature={onEachYolFeature}
              renderer={canvasRenderer}
            />
          )}
          {osbGoster && osbFeatureCollection && (
            <GeoJSON
              key="baglam-osb"
              data={osbFeatureCollection as unknown as GeoJSON.GeoJsonObject}
              style={osbStyleFn}
              onEachFeature={onEachOsbFeature}
            />
          )}
        </MapContainer>
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-muted flex-shrink-0">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={renkGoster}
              onChange={(e) => setRenkGoster(e.target.checked)}
            />
            Risk renklerini göster
          </label>
          <span>Not: İkitelli OSB (sanayi bölgesi) veri kapsamı dışındadır.</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Düşük</span>
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: KOVA_RENKLERI.dusuk }}
          />
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: KOVA_RENKLERI.orta }}
          />
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: KOVA_RENKLERI.yuksek }}
          />
          <span>Yüksek</span>
        </div>
      </div>

      {simulasyonOnizlemeAktif && (
        <div className="flex items-center gap-2 mt-2 text-xs flex-shrink-0">
          <span
            className="inline-block w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: SIMULASYON_RENGI.dolgu }}
          />
          <span className="italic text-muted">
            Mor: seçili mahallede simülasyon önizlemesi çalışıyor, bu gerçek mevcut risk
            değil.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-muted flex-shrink-0">
        <span className="font-medium">Operasyonel bağlam:</span>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={siteGoster}
            onChange={(e) => setSiteGoster(e.target.checked)}
            disabled={!baglamVeri}
          />
          Site sınırları
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={yolGoster}
            onChange={(e) => setYolGoster(e.target.checked)}
            disabled={!baglamVeri}
          />
          Yol ağı (büyükşehir/ilçe)
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={osbGoster}
            onChange={(e) => setOsbGoster(e.target.checked)}
            disabled={!baglamVeri}
          />
          İkitelli OSB sınırı
        </label>
        {yolGoster && (
          <span className="italic text-[10px]">
            ⚠ Yol ağı ayrımı OSM sınıflamasından türetilmiş bir YAKLAŞIKLIKTIR, resmi tescilli
            anaarter listesine dayanmaz.
          </span>
        )}
      </div>

      <div className="text-[10px] text-muted mt-1 flex justify-end flex-shrink-0">
        <span>© OpenStreetMap katkıcıları (ODbL) · TÜİK ADNKS</span>
      </div>

      {izgaraKatmani && izgaraMinMax && (
        <div className="mt-2 pt-2 border-t border-contur flex items-center gap-2 text-xs text-muted flex-shrink-0">
          <span>Mahalle içi görece tehlike: düşük → yüksek</span>
          <div
            className="h-3 w-20 rounded"
            style={{
              background: `linear-gradient(to right, ${golgeRengi(izgaraMinMax.min, izgaraMinMax.min, izgaraMinMax.max)}, ${golgeRengi((izgaraMinMax.min + izgaraMinMax.max) / 2, izgaraMinMax.min, izgaraMinMax.max)}, ${golgeRengi(izgaraMinMax.max, izgaraMinMax.min, izgaraMinMax.max)})`,
            }}
          />
          {izgaraKatmani.simulasyonAktif && (
            <span className="italic">
              {izgaraKatmani.hedefUygulamaTuru === 'hucre'
                ? '(sadece seçili hücreye uygulanıyor)'
                : '(yeşil alan artışı simülasyonu uygulanıyor)'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function HaritaSecimTakipcisi({ seciliFeature }: { seciliFeature: Feature | null }) {
  const map = useMap();
  const ilkCalismaRef = useRef(true);

  useEffect(() => {
    if (ilkCalismaRef.current) {
      // Ilk otomatik secim (sayfa yuklenisinde varsayilan mahalle) icin
      // animasyonlu ucus yapma; harita zaten tum ilceyi kapsayacak sekilde aciliyor.
      ilkCalismaRef.current = false;
      return;
    }
    if (!seciliFeature) return;
    const katman = L.geoJSON(seciliFeature as unknown as GeoJSON.GeoJsonObject);
    const sinirlar = katman.getBounds();
    if (sinirlar.isValid()) {
      map.flyToBounds(sinirlar, { padding: [40, 40] });
    }
  }, [seciliFeature, map]);

  return null;
}
