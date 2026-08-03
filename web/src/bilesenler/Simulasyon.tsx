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
  simButce: number;
  onSimButceChange: (v: number) => void;
  butceKapsananRiskYuzdesi: number;
  butceSecilenler: Array<{ ad: string; rank: number }>;
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
  simButce,
  onSimButceChange,
  butceKapsananRiskYuzdesi,
  butceSecilenler,
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

      {/* Bütçe kısıtı – her zaman gösterilir */}
      <div className="border-t border-contur pt-4">
        <div className="flex justify-between text-xs mb-1">
          <span>Bütçe kısıtı — kaç mahalleye müdahale edilebilir?</span>
          <span className="font-mono text-muted">{simButce} mahalle</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={simButce}
          onChange={(e) => onSimButceChange(Number(e.target.value))}
          className="w-full accent-[oklch(0.6_0.14_150)]"
        />

        <div className="text-[11px] text-muted mt-2 mb-2">
          Toplam riskin{' '}
          <span className="text-accent font-medium">
            %{butceKapsananRiskYuzdesi.toFixed(0)}
          </span>
          'i kapsanıyor:
        </div>

        <div className="flex flex-wrap gap-2">
          {butceSecilenler.map((b) => (
            <span
              key={b.ad}
              className="text-[11px] bg-panel border border-contur px-2 py-1 rounded-md"
            >
              {b.rank} {b.ad}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
