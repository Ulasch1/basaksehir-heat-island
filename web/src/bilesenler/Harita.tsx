import { useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
} from 'react-leaflet';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import L from 'leaflet';
import { riskRengi, KOVA_RENKLERI } from '../renk';
import type { Mahalle } from '../veriKaynagi';

interface HaritaProps {
  mahalleler: Mahalle[];
  skorlarByAd: Record<string, { tehlike: number; maruziyet: number; risk: number }>;
  renkEsikleri: { dusuk: number; yuksek: number };
  seciliAd: string | null;
  onSecim: (ad: string) => void;
  butceSecilenAdlari: Set<string>;
}

export default function Harita({
  mahalleler,
  skorlarByAd,
  renkEsikleri,
  seciliAd,
  onSecim,
  butceSecilenAdlari,
}: HaritaProps) {
  const featureCollection = useMemo<FeatureCollection>(() => {
    const features: Feature[] = mahalleler.map((m) => ({
      type: 'Feature' as const,
      geometry: m.sinir as unknown as Geometry,
      properties: { ad: m.ad },
    }));
    return { type: 'FeatureCollection', features };
  }, [mahalleler]);

  const bounds = useMemo(() => {
    return L.geoJSON(featureCollection as unknown as GeoJSON.GeoJsonObject).getBounds();
  }, [featureCollection]);

  const geoJsonKey = useMemo(() => {
    const budgetList = [...butceSecilenAdlari].sort().join(',');
    return `${seciliAd ?? '-'}__${budgetList}`;
  }, [seciliAd, butceSecilenAdlari]);

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
          <GeoJSON
            key={geoJsonKey}
            data={featureCollection as unknown as GeoJSON.GeoJsonObject}
            style={styleFn}
            onEachFeature={onEachFeature}
          />
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
    </div>
  );
}
