interface SimulasyonProps {
  ayarlar: { simulasyon_bina_azaltma_katsayisi: number };
  seciliAd: string | null;
  seciliSkor: { risk: number } | null;
  yesilSimSonuc: { risk: number } | null;
  simYesil: number;
  onSimYesilChange: (v: number) => void;
  nufusSimYeniRisk: number | null;
  nufusSimYeniRank: number | null;
  yesilSimYeniRank: number | null;
  seciliBaseRank: number | null;
  birlesikSenaryoSonuc: { risk: number; rank: number | null } | null;
  simNufusYuzde: number;
  onSimNufusYuzdeChange: (v: number) => void;
  hedefRisk: number;
  onHedefRiskChange: (v: number) => void;
  hedefRiskSonuc: {
    zatenAltinda: boolean;
    mumkun: boolean;
    gerekliYesilArtisPuaniHam: number | null;
    gerekliYesilArtisPuaniGosterim: number | null;
    sliderAraligindaMi: boolean;
  } | null;
  varsayilanHedefRisk: number;
  izgaraGoster: boolean;
  onIzgaraGosterChange: (deger: boolean) => void;
  hucreSeciliMi: boolean;
  simHedef: 'mahalle' | 'hucre';
  onSimHedefChange: (hedef: 'mahalle' | 'hucre') => void;
}

export default function Simulasyon({
  seciliAd,
  seciliSkor,
  yesilSimSonuc,
  simYesil,
  onSimYesilChange,
  nufusSimYeniRisk,
  nufusSimYeniRank,
  yesilSimYeniRank,
  seciliBaseRank,
  birlesikSenaryoSonuc,
  simNufusYuzde,
  onSimNufusYuzdeChange,
  hedefRisk,
  onHedefRiskChange,
  hedefRiskSonuc,
  varsayilanHedefRisk,
  izgaraGoster,
  onIzgaraGosterChange,
  hucreSeciliMi,
  simHedef,
  onSimHedefChange,
}: SimulasyonProps) {
  return (
    <div className="bg-panel border border-contur rounded-xl p-4 flex flex-col gap-4">
      <h3 className="text-sm text-muted">Senaryo Simülasyonu</h3>

      <div className="flex flex-col gap-4">
        {/* Yeşil alan artışı */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Yeşil alan artışı</span>
            <span className="font-mono text-muted">{simYesil} puan</span>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={simYesil}
            onChange={(e) => onSimYesilChange(Number(e.target.value))}
            className="w-full accent-[oklch(0.6_0.14_150)]"
          />
          <label className="flex items-center gap-1.5 cursor-pointer select-none mt-2">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 accent-ink"
              checked={izgaraGoster}
              onChange={(e) => onIzgaraGosterChange(e.target.checked)}
            />
            <span className="text-[11px] text-muted">Mahalle içi ısı haritası göster</span>
          </label>

          {izgaraGoster && (
            <div className="mt-2 text-xs text-muted">
              <span className="block mb-1">Uygula:</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="simHedef"
                  value="mahalle"
                  checked={simHedef === 'mahalle'}
                  onChange={() => onSimHedefChange('mahalle')}
                />
                Mahalle geneli
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="simHedef"
                  value="hucre"
                  checked={simHedef === 'hucre'}
                  onChange={() => onSimHedefChange('hucre')}
                  disabled={!hucreSeciliMi}
                />
                Seçili hücre
              </label>
              {!hucreSeciliMi && (
                <span className="block text-[11px] text-muted/60">
                  Önce haritada bir hücre seçin
                </span>
              )}
            </div>
          )}
          {seciliSkor && yesilSimSonuc && (
            <div className="text-[11px] text-muted mt-1">
              {seciliAd} risk: {seciliSkor.risk.toFixed(3)} →{' '}
              <span className="text-accent font-mono">
                {yesilSimSonuc.risk.toFixed(3)}
              </span>
              {seciliBaseRank !== null && yesilSimYeniRank !== null && (
                <span>
                  {' '}
                  · Sıra: {seciliBaseRank} → {yesilSimYeniRank}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Nüfus artışı */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Nüfus artışı (yeni konut projesi)</span>
            <span className="font-mono text-muted">{simNufusYuzde} %</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={5}
            value={simNufusYuzde}
            onChange={(e) => onSimNufusYuzdeChange(Number(e.target.value))}
            className="w-full accent-[oklch(0.6_0.14_150)]"
          />
          {seciliSkor && nufusSimYeniRisk !== null && (
            <div className="text-[11px] text-muted mt-1">
              Risk: {seciliSkor.risk.toFixed(3)} →{' '}
              <span className="text-accent font-mono">
                {nufusSimYeniRisk.toFixed(3)}
              </span>
              {seciliBaseRank !== null && nufusSimYeniRank !== null && (
                <span>
                  {' '}
                  · Sıra: {seciliBaseRank} → {nufusSimYeniRank}
                </span>
              )}
            </div>
          )}
        </div>

        {birlesikSenaryoSonuc && seciliSkor && (
          <div className="text-[11px] p-2 rounded-md border border-accent/40 bg-accent/5">
            <span className="font-medium">Birleşik senaryo:</span>{' '}
            {seciliSkor.risk.toFixed(3)} →{' '}
            <span className="text-accent font-mono">
              {birlesikSenaryoSonuc.risk.toFixed(3)}
            </span>
            {seciliBaseRank !== null && birlesikSenaryoSonuc.rank !== null && (
              <span>
                {' '}
                · Sıra: {seciliBaseRank} → {birlesikSenaryoSonuc.rank}
              </span>
            )}
          </div>
        )}

        <button
          onClick={() => {
            onSimYesilChange(0);
            onSimNufusYuzdeChange(0);
            onSimHedefChange('mahalle');
          }}
          className="self-start border border-contur text-muted text-[11px] px-3 py-1 rounded-md hover:bg-panel"
        >
          Sıfırla
        </button>
      </div>

      <div className="border-t border-contur pt-4">
        <div className="text-xs mb-1">Hedef risk çözücü</div>
        <label className="text-xs text-muted block mb-0.5">Hedef risk</label>
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={hedefRisk}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onHedefRiskChange(v);
          }}
          className="w-full bg-page border border-contur rounded-md px-2 py-1 text-sm mb-1"
        />
        <p className="text-[10px] text-muted mb-2">
          Varsayılan değer, düşük risk sınırıdır ({varsayilanHedefRisk.toFixed(2)}).
        </p>

        {hedefRiskSonuc && (
          hedefRiskSonuc.zatenAltinda ? (
            <div className="bg-risk-dusuk/10 border border-risk-dusuk/40 text-ink text-xs rounded-lg px-3 py-2">
              Bu mahalle hedef riskin zaten altında.
            </div>
          ) : hedefRiskSonuc.mumkun ? (
            <div className="bg-risk-dusuk/10 border border-risk-dusuk/40 text-ink text-xs rounded-lg px-3 py-2">
              <p>
                Gereken yeşil alan artışı:{' '}
                <span className="font-mono font-semibold">
                  +{hedefRiskSonuc.gerekliYesilArtisPuaniGosterim} puan
                </span>
              </p>
              {hedefRiskSonuc.sliderAraligindaMi ? (
                <button
                  onClick={() => onSimYesilChange(Math.ceil(hedefRiskSonuc.gerekliYesilArtisPuaniGosterim!))}
                  className="mt-2 border border-contur text-muted text-[11px] px-3 py-1 rounded-md hover:bg-panel"
                >
                  Slider'a uygula
                </button>
              ) : (
                <p className="text-[11px] text-muted mt-1">Slider aralığının (0-30) dışında.</p>
              )}
            </div>
          ) : (
            <div className="bg-risk-yuksek/10 border border-risk-yuksek/40 text-ink text-xs rounded-lg px-3 py-2">
              Bu hedefe yalnızca yeşil alan artışıyla ulaşılamıyor.
            </div>
          )
        )}
      </div>
    </div>
  );
}
