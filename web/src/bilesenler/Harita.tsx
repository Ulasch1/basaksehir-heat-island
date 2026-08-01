import { useMemo, useEffect, useRef, type ComponentType } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
} from 'react-leaflet';
import type { GeoJSONProps } from 'react-leaflet';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import L from 'leaflet';
import { riskRengi, KOVA_RENKLERI, golgeRengi } from '../renk';
import type { Mahalle, IzgaraHucre } from '../veriKaynagi';
import { izgaraGeoJsonOlustur } from '../skorHesapla';
import { dosyaIndir, dosyaAdiGuvenliHaleGetir } from '../dosyaIndir';

const IzgaraGeoJSON = GeoJSON as unknown as ComponentType<
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
  butceSecilenAdlari: Set<string>;
  izgaraKatmani: {
    ad: string;
    hucreler: IzgaraHucre[];
    hucreOzellikleri: { yesil_alan_orani: number; bina_yogunlugu: number; tehlike: number }[];
    tehlikeler: number[];
    baselineTehlikeler: number[];
    simulasyonAktif: boolean;
  } | null;
}

export default function Harita({
  mahalleler,
  skorlarByAd,
  renkEsikleri,
  seciliAd,
  onSecim,
  onHucreSecim,
  seciliHucreIndex,
  butceSecilenAdlari,
  izgaraKatmani,
}: HaritaProps) {
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
    const tehlikeler = izgaraKatmani.baselineTehlikeler;
    const min = Math.min(...tehlikeler);
    const max = Math.max(...tehlikeler);
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

  const onEachIzgaraFeature = useMemo(
    () => (feature: Feature, layer: L.Layer) => {
      layer.on('click', () => {
        const hucreIndex = feature.properties?.hucreIndex as number | undefined;
        if (hucreIndex !== undefined) onHucreSecim(hucreIndex);
      });
    },
    [onHucreSecim],
  );

  const izgaraStyleFn = useMemo(
    () => (feature: Feature | undefined) => {
      if (!feature || izgaraMinMax === null) return { fillOpacity: 0.85, weight: 0.5, color: 'oklch(0.85 0.01 260)' };
      const tehlike = feature.properties?.tehlike as number;
      const fillColor = golgeRengi(tehlike, izgaraMinMax.min, izgaraMinMax.max);
      const isSelected = feature.properties?.hucreIndex === seciliHucreIndex;
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
    const budgetList = [...butceSecilenAdlari].sort().join(',');
    const izgaraAd = izgaraKatmani ? izgaraKatmani.ad : '';
    return `${seciliAd ?? '-'}__${budgetList}__${izgaraAd}`;
  }, [seciliAd, butceSecilenAdlari, izgaraKatmani]);

  const izgaraGeoJsonKey = useMemo(() => {
    if (!izgaraKatmani) return '';
    const tehlikeToplami = izgaraKatmani.tehlikeler.reduce((acc, t) => acc + t, 0);
    return `izgara-${izgaraKatmani.ad}-${izgaraKatmani.simulasyonAktif}-${tehlikeToplami.toFixed(6)}`;
  }, [izgaraKatmani]);

  const styleFn = useMemo(
    () => (feature: Feature | undefined) => {
      if (!feature) return {};
      const ad = feature.properties?.ad as string | undefined;
      const skor = ad ? skorlarByAd[ad] : undefined;
      const risk = skor?.risk ?? 0;
      const fillColor = riskRengi(risk, renkEsikleri);

      const isSelected = ad === seciliAd;
      const inBudget = ad ? butceSecilenAdlari.has(ad) : false;

      const weight = isSelected ? 2.5 : inBudget ? 2 : 1;
      const color = isSelected
        ? 'oklch(0.55 0.15 150)'
        : inBudget
          ? 'oklch(0.6 0.14 150)'
          : 'oklch(0.85 0.01 260)';
      const dashArray = inBudget && !isSelected ? '6,3' : undefined;

      return {
        fillColor,
        fillOpacity: 0.75,
        weight,
        color,
        dashArray,
      };
    },
    [skorlarByAd, renkEsikleri, seciliAd, butceSecilenAdlari],
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
            <IzgaraGeoJSON
              key={izgaraGeoJsonKey}
              data={izgaraFeatureCollection as unknown as GeoJSON.GeoJsonObject}
              style={izgaraStyleFn}
              onEachFeature={onEachIzgaraFeature}
              renderer={canvasRenderer}
            />
          )}
        </MapContainer>
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-muted flex-shrink-0">
        <div className="flex items-center gap-4">
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

      <div className="text-[10px] text-muted mt-1 flex justify-between flex-shrink-0">
        <span>Kesikli kontur: bütçe kısıtında seçilen mahalleler</span>
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
            <span className="italic">(yeşil alan artışı simülasyonu uygulanıyor)</span>
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
