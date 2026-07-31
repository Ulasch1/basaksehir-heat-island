import { riskRengi } from '../renk';
import type { SiralamaModu, MahalleSkoru } from '../skorHesapla';
import { oncelikCsvSatirlariOlustur, oncelikCsvMetniOlustur } from '../skorHesapla';
import { dosyaIndir } from '../dosyaIndir';

interface OncelikListesiProps {
  siraliSkorlar: MahalleSkoru[];
  tipolojiByAd: Record<string, number>;
  tipolojiEslemesi: Record<string, { etiket: string; mudahale: string }>;
  tipolojiGuncelDegil: boolean;
  renkEsikleri: { dusuk: number; yuksek: number };
  seciliAd: string | null;
  onSecim: (ad: string) => void;
  uyusmazlik: {
    uyusmuyor: boolean;
    enYuksekTehlikeAd: string | null;
    enYuksekRiskAd: string | null;
  };
  siralamaModu: SiralamaModu;
  onSiralamaModuChange: (mod: SiralamaModu) => void;
}

export default function OncelikListesi({
  siraliSkorlar,
  tipolojiByAd,
  tipolojiEslemesi,
  tipolojiGuncelDegil,
  renkEsikleri,
  seciliAd,
  onSecim,
  uyusmazlik,
  siralamaModu,
  onSiralamaModuChange,
}: OncelikListesiProps) {
  const baslik =
    siralamaModu === 'risk'
      ? 'Öncelik Sıralaması (Risk Skoruna Göre)'
      : siralamaModu === 'yesil'
        ? 'Öncelik Sıralaması (Yeşil Alan Eksikliğine Göre)'
        : 'Öncelik Sıralaması (Bina Yoğunluğuna Göre)';

  const csvIndir = () => {
    const satirlar = oncelikCsvSatirlariOlustur(
      siraliSkorlar,
      tipolojiByAd,
      tipolojiEslemesi,
      tipolojiGuncelDegil,
    );
    const metin = oncelikCsvMetniOlustur(satirlar);
    dosyaIndir('\uFEFF' + metin, 'oncelik-siralamasi.csv', 'text/csv;charset=utf-8;');
  };

  return (
    <div className="bg-panel border border-contur rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-muted">{baslik}</h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-contur overflow-hidden">
            {(['risk', 'yesil', 'bina'] as const).map((mod) => (
              <button
                key={mod}
                onClick={() => onSiralamaModuChange(mod)}
                className={`text-xs px-2 py-1 transition-colors ${
                  siralamaModu === mod
                    ? 'bg-accent/10 border-accent/40'
                    : 'hover:bg-panel'
                }`}
                title={
                  mod === 'risk'
                    ? 'Risk skoruna göre'
                    : mod === 'yesil'
                      ? 'Yeşil alan eksikliğine göre'
                      : 'Bina yoğunluğuna göre'
                }
              >
                {mod === 'risk' ? 'Risk' : mod === 'yesil' ? 'Yeşil Alan' : 'Bina Yoğunluğu'}
              </button>
            ))}
          </div>
          <button
            onClick={csvIndir}
            className="text-xs px-2 py-1 rounded-md border border-contur hover:bg-panel"
          >
            CSV indir
          </button>
        </div>
      </div>

      {uyusmazlik.uyusmuyor && (
        <div className="bg-risk-orta/20 border border-risk-orta/50 text-ink text-xs rounded-lg px-3 py-2 mb-3">
          Dikkat: en yüksek tehlikeli mahalle ({uyusmazlik.enYuksekTehlikeAd}) ile en yüksek riskli mahalle ({uyusmazlik.enYuksekRiskAd}) farklı.
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {siraliSkorlar.map((row, idx) => {
          const rank = idx + 1;
          const dotColor = riskRengi(row.risk, renkEsikleri);
          const tipolojiIndeks = tipolojiByAd[row.ad];
          const tipolojiEtiket =
            tipolojiIndeks != null
              ? tipolojiEslemesi[String(tipolojiIndeks)]?.etiket
              : undefined;

          const isSelected = row.ad === seciliAd;

          return (
            <button
              key={row.ad}
              onClick={() => onSecim(row.ad)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left border transition-colors ${
                isSelected
                  ? 'bg-accent/10 border-accent/40'
                  : 'border-transparent hover:bg-panel'
              }`}
            >
              <span className="w-[18px] font-mono text-xs text-muted">
                {rank}
              </span>

              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: dotColor }}
              />

              <span className="flex-1 text-sm">{row.ad}</span>

              {tipolojiEtiket && (
                <span className="text-[11px] px-1.5 py-px rounded-full bg-panel border border-contur text-muted">
                  {tipolojiEtiket}
                </span>
              )}

              {tipolojiGuncelDegil && (
                <span
                  className="text-[9px] px-1.5 py-px rounded-full bg-risk-orta/20 border border-risk-orta/50 text-ink cursor-help"
                  title="AI servisi çalışmadığında bu değer önceden hesaplanmış yedek veriden gelir (REQ-F-23)."
                >
                  AI · yedek veri
                </span>
              )}
              {siralamaModu !== 'risk' && (
                <span
                  className="text-[10px] text-muted font-mono"
                  title={
                    siralamaModu === 'yesil' ? 'Yeşil alan eksikliği' : 'Bina yoğunluğu'
                  }
                >
                  {siralamaModu === 'yesil'
                    ? `%${Math.round((1 - row.yesilAlanOrani) * 100)}`
                    : `%${Math.round(row.binaYogunlugu * 100)}`}
                </span>
              )}

              <span className="font-mono text-xs text-muted w-[4.5rem] text-right">
                {row.risk.toFixed(3)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
