import { useMemo, useState } from 'react';
import type { MahalleVeri, SkorAyarlari } from '../skorHesapla';
import { hesaplaImarOnDegerlendirme } from '../skorHesapla';

interface ImarHesaplayiciProps {
  mahalleler: MahalleVeri[];
  ayarlar: SkorAyarlari;
  varsayilanHedefRisk: number;
}

export default function ImarHesaplayici({
  mahalleler,
  ayarlar,
  varsayilanHedefRisk,
}: ImarHesaplayiciProps) {
  const [projeAlanKm2, setProjeAlanKm2] = useState(1);
  const [projeNufus, setProjeNufus] = useState(5000);
  const [projeBinaYogunluguYuzde, setProjeBinaYogunluguYuzde] = useState(40);
  const [hedefRisk, setHedefRisk] = useState(varsayilanHedefRisk);

  const sonuc = useMemo(() => {
    if (
      Number.isNaN(projeAlanKm2) ||
      Number.isNaN(projeNufus) ||
      Number.isNaN(projeBinaYogunluguYuzde) ||
      Number.isNaN(hedefRisk) ||
      projeAlanKm2 <= 0 ||
      mahalleler.length === 0
    ) {
      return null;
    }
    try {
      return hesaplaImarOnDegerlendirme(
        mahalleler,
        projeAlanKm2,
        projeNufus,
        projeBinaYogunluguYuzde / 100,
        hedefRisk,
        ayarlar,
      );
    } catch {
      return null;
    }
  }, [
    projeAlanKm2,
    projeNufus,
    projeBinaYogunluguYuzde,
    hedefRisk,
    mahalleler,
    ayarlar,
  ]);

  const reset = () => {
    setProjeAlanKm2(1);
    setProjeNufus(5000);
    setProjeBinaYogunluguYuzde(40);
    setHedefRisk(varsayilanHedefRisk);
  };

  return (
    <div className="bg-panel border border-contur rounded-xl p-4 flex flex-col gap-4">
      <h3 className="text-sm text-muted">
        İmar Planı Ön Değerlendirmesi
      </h3>

      <p className="text-[11px] text-muted">
        Yeni bir konut projesi için, ısı adası riski oluşturmayacak kadar yeşil alan
        bırakılıp bırakılmadığını kontrol edin.
      </p>

      {/* Proje alanı */}
      <div>
        <label className="text-xs text-muted block mb-0.5">
          Proje alanı (km²)
        </label>
        <input
          type="number"
          min={0.01}
          step={0.01}
          value={projeAlanKm2}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) setProjeAlanKm2(v);
          }}
          className="w-full bg-page border border-contur rounded-md px-2 py-1 text-sm"
        />
      </div>

      {/* Tahmini nüfus */}
      <div>
        <label className="text-xs text-muted block mb-0.5">
          Tahmini nüfus (proje tamamlandığında)
        </label>
        <input
          type="number"
          min={0}
          step={100}
          value={projeNufus}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) setProjeNufus(v);
          }}
          className="w-full bg-page border border-contur rounded-md px-2 py-1 text-sm"
        />
      </div>

      {/* Bina yoğunluğu */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span>Planlanan bina yoğunluğu</span>
          <span className="font-mono text-muted">%{projeBinaYogunluguYuzde}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={projeBinaYogunluguYuzde}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) setProjeBinaYogunluguYuzde(v);
          }}
          className="w-full accent-[oklch(0.6_0.14_150)]"
        />
      </div>

      {/* Hedef ısı riski */}
      <div>
        <label className="text-xs text-muted block mb-0.5">
          Hedef ısı riski
        </label>
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={hedefRisk}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) setHedefRisk(v);
          }}
          className="w-full bg-page border border-contur rounded-md px-2 py-1 text-sm mb-1"
        />
        <p className="text-[10px] text-muted">
          Varsayılan değer, düşük risk sınırıdır ({varsayilanHedefRisk.toFixed(2)}).
        </p>
      </div>

      <button
        onClick={reset}
        className="self-start border border-contur text-muted text-[11px] px-3 py-1 rounded-md hover:bg-panel"
      >
        Sıfırla
      </button>

      {/* Sonuç */}
      <div className="border-t border-contur pt-4">
        {!sonuc ? (
          <p className="text-[11px] text-muted">
            Sonuç hesaplanamadı; proje alanının sıfırdan büyük olduğundan emin olun.
          </p>
        ) : sonuc.mumkun ? (
          <div className="bg-risk-dusuk/10 border border-risk-dusuk/40 text-ink text-xs rounded-lg px-3 py-2">
            <p>
              Bu projede önerilen minimum yeşil alan oranı:{' '}
              <span className="font-mono font-semibold">
                %{Math.round(sonuc.gerekliYesilAlanOrani! * 100)}
              </span>
            </p>
            <p className="text-[11px] text-muted mt-1">
              Planlanan bina yoğunluğuyla bu oranın altında yeşil alan bırakılırsa,
              bölgede belirlenen ısı riski sınırının üzerine çıkılabilir.
            </p>
          </div>
        ) : (
          <div className="bg-risk-yuksek/10 border border-risk-yuksek/40 text-ink text-xs rounded-lg px-3 py-2">
            Bu hedefe, planlanan bina yoğunluğuyla hiçbir yeşil alan oranıyla
            ulaşılamıyor. Hedefe ulaşmak için bina yoğunluğunu azaltmayı ya da
            hedef ısı riskini gözden geçirmeyi düşünün.
          </div>
        )}
      </div>
    </div>
  );
}
