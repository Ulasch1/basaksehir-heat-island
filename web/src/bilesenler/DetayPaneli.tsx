import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
} from 'recharts';
import { riskRengi } from '../renk';
import type { Mahalle } from '../veriKaynagi';

interface DetayPaneliProps {
  mahalle: Mahalle;
  skor: { tehlike: number; maruziyet: number; risk: number };
  rank: number | null;
  toplamMahalle: number;
  renkEsikleri: { dusuk: number; yuksek: number };
  tipolojiEtiket: string | null;
  mudahaleMetni: string | null;
  tipolojiGuncelDegil: boolean;
  projeksiyon: { tahminiNufus: number; hedefYil: number } | null;
  projeksiyonRiski: { tehlike: number; maruziyet: number; risk: number } | null;
  projeksiyonGuncelDegil: boolean;
}

function buildChartData(
  nufusSerisi: Record<string, number>,
  projeksiyon: { tahminiNufus: number; hedefYil: number } | null,
) {
  const historics = Object.entries(nufusSerisi)
    .map(([y, n]) => ({ yil: parseInt(y, 10), nufus: n }))
    .sort((a, b) => a.yil - b.yil);

  const data = historics.map((p) => ({
    yil: p.yil,
    gercek: p.nufus,
    projeksiyon: undefined as number | undefined,
  }));

  // add projection continuation
  if (projeksiyon && data.length > 0) {
    const lastHistoric = data[data.length - 1];
    lastHistoric.projeksiyon = lastHistoric.gercek; // connect dashed line

    data.push({
      yil: projeksiyon.hedefYil,
      gercek: undefined as unknown as number,
      projeksiyon: projeksiyon.tahminiNufus,
    });
  }

  return data;
}

export default function DetayPaneli({
  mahalle,
  skor,
  rank,
  toplamMahalle,
  renkEsikleri,
  tipolojiEtiket,
  mudahaleMetni,
  tipolojiGuncelDegil,
  projeksiyon,
  projeksiyonRiski,
  projeksiyonGuncelDegil,
}: DetayPaneliProps) {
  const yesilEksikligi = (1 - mahalle.yesil_alan_orani) * 100;
  const binaYuzde = mahalle.bina_yogunlugu * 100;
  const maruziyetYuzde = skor.maruziyet * 100;
  const riskYuzde = skor.risk * 100;
  const riskColor = riskRengi(skor.risk, renkEsikleri);

  const chartData = buildChartData(mahalle.nufus_serisi, projeksiyon);

  return (
    <div className="bg-panel border border-contur rounded-xl p-4 flex flex-col gap-4">
      {/* Başlık ve sıra */}
      <div className="flex justify-between items-baseline">
        <h3 className="text-base font-semibold">{mahalle.ad}</h3>
        {rank !== null && (
          <span className="font-mono text-xs text-muted">
            Öncelik {rank} / {toplamMahalle}
          </span>
        )}
      </div>

      {/* Detay çubukları – 4 satır */}
      <div className="flex flex-col gap-2">
        <div>
          <div className="flex justify-between text-[11px] text-muted mb-0.5">
            <span>Yeşil Alan Eksikliği</span>
            <span>%{yesilEksikligi.toFixed(0)}</span>
          </div>
          <div className="h-1.5 bg-panel rounded-full overflow-hidden">
            <div
              className="h-full bg-ink/30 rounded-full"
              style={{ width: `${yesilEksikligi}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-muted mb-0.5">
            <span>Bina Yoğunluğu</span>
            <span>%{binaYuzde.toFixed(0)}</span>
          </div>
          <div className="h-1.5 bg-panel rounded-full overflow-hidden">
            <div
              className="h-full bg-ink/30 rounded-full"
              style={{ width: `${binaYuzde}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-muted mb-0.5">
            <span>Maruziyet</span>
            <span>%{maruziyetYuzde.toFixed(0)}</span>
          </div>
          <div className="h-1.5 bg-panel rounded-full overflow-hidden">
            <div
              className="h-full bg-ink/30 rounded-full"
              style={{ width: `${maruziyetYuzde}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-muted mb-0.5">
            <span>Risk (Tehlike × Maruziyet)</span>
            <span className="font-mono" style={{ color: riskColor }}>
              {skor.risk.toFixed(3)}
            </span>
          </div>
          <div className="h-2 bg-panel rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${riskYuzde}%`, backgroundColor: riskColor }}
            />
          </div>
        </div>
      </div>

      {/* Tipoloji */}
      <div className="border-t border-contur pt-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-muted uppercase tracking-wider">
            Önerilen Müdahale Tipi
          </span>
          {tipolojiGuncelDegil && (
            <span
              className="text-[9px] px-1.5 py-px rounded-full bg-risk-orta/20 border border-risk-orta/50 text-ink cursor-help"
              title="AI servisi çalışmadığında bu değer önceden hesaplanmış yedek veriden gelir (REQ-F-23)."
            >
              AI · yedek veri
            </span>
          )}
        </div>
        {tipolojiEtiket && (
          <div className="text-sm font-medium">{tipolojiEtiket}</div>
        )}
        {mudahaleMetni && (
          <div className="text-xs text-muted mt-0.5">{mudahaleMetni}</div>
        )}
        <div className="text-[10px] text-muted mt-1">
          Mevcut duruma göre hesaplanmıştır.
        </div>
      </div>

      {/* Nüfus ve projeksiyon */}
      <div className="border-t border-contur pt-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-muted uppercase tracking-wider">
            Nüfus (yıl aralığı) ve Projeksiyon
          </span>
          {projeksiyonGuncelDegil && projeksiyon && (
            <span
              className="text-[9px] px-1.5 py-px rounded-full bg-risk-orta/20 border border-risk-orta/50 text-ink cursor-help"
              title="AI servisi çalışmadığında bu değer önceden hesaplanmış yedek veriden gelir (REQ-F-23)."
            >
              AI · yedek veri
            </span>
          )}
        </div>

        {chartData.length > 0 && (
          <div className="h-[70px] w-full">
            <ResponsiveContainer width="100%" height={70}>
              <LineChart
                data={chartData}
                margin={{ top: 4, right: 4, bottom: 4, left: 0 }}
              >
                <XAxis
                  dataKey="yil"
                  tick={{ fontSize: 9, fill: 'oklch(0.45 0.01 260)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Line
                  type="linear"
                  dataKey="gercek"
                  stroke="oklch(0.6 0.14 150)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="projeksiyon"
                  stroke="oklch(0.6 0.14 150)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="text-[11px] text-muted flex justify-between mt-1">
          <span>
            Nüfus: {mahalle.nufus.toLocaleString('tr-TR')}
          </span>
          {projeksiyon && (
            <span style={{ color: 'oklch(0.6 0.14 150)' }}>
              {projeksiyon.hedefYil} · {projeksiyon.tahminiNufus.toLocaleString('tr-TR')} kişi
            </span>
          )}
        </div>

        {projeksiyon && projeksiyonRiski && (
          <div className="flex justify-between items-baseline mt-2 bg-panel/50 px-2 py-1 rounded">
            <div className="text-[11px] text-muted">
              Mevcut risk:{' '}
              <span className="font-mono font-medium text-ink">
                {skor.risk.toFixed(3)}
              </span>
            </div>
            <div className="text-[11px] text-muted">
              Projeksiyon riski ({projeksiyon.hedefYil}):{' '}
              <span
                className="font-mono font-medium"
                style={{ color: riskRengi(projeksiyonRiski.risk, renkEsikleri) }}
              >
                {projeksiyonRiski.risk.toFixed(3)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
