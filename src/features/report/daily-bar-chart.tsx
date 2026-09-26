import { minutesToHm } from "@/lib/datetime";

// docs/04 の内訳を日別の積み上げ棒グラフで表示する。配色・表示の方針:
// - 3 色（所定内 / 法定内残業 / 法定外残業）は、ライト・ダークの両方で区別しやすさを確認済み
// - 法定休日は 4 色目を作らずハッチ（テクスチャ）で区別 = 二次符号化
// - 凡例は常時表示、右のツールチップは各セグメントの <title>、値は ink トークン

export type ChartDay = {
  dateStr: string;
  label: string; // "9/8"
  within: number; // 所定内
  withinOt: number; // 法定内残業
  overOt: number; // 法定外残業
  legal: number; // 法定休日
};

const SERIES = [
  {
    key: "within",
    label: "所定内",
    fill: "var(--chart-1)",
    swatch: "var(--chart-1)",
  },
  {
    key: "withinOt",
    label: "法定内残業",
    fill: "var(--chart-2)",
    swatch: "var(--chart-2)",
  },
  {
    key: "overOt",
    label: "法定外残業",
    fill: "var(--chart-3)",
    swatch: "var(--chart-3)",
  },
  {
    key: "legal",
    label: "法定休日",
    fill: "url(#legal-hatch)",
    swatch:
      "repeating-linear-gradient(45deg, var(--chart-legal) 0 2px, var(--color-card) 2px 4px)",
  },
] as const;

const H = 200;
const PAD_T = 12;
const PAD_B = 22;
const PAD_L = 40;
const GAP = 2; // セグメント間・バー間の surface ギャップ

export function DailyBarChart({ days }: { days: ChartDay[] }) {
  const maxTotal = Math.max(
    480,
    ...days.map((d) => d.within + d.withinOt + d.overOt + d.legal),
  );
  // 目盛りは 2h(120分)刻みで maxTotal を超える最小値まで
  const top = Math.ceil(maxTotal / 120) * 120;
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH - (v / top) * plotH;

  const n = days.length;
  const barW = 18;
  const step = barW + 8;
  const W = PAD_L + n * step + 8;

  const ticks: number[] = [];
  for (let v = 0; v <= top; v += 120) ticks.push(v);

  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-sm font-medium">
        日別 労働時間の内訳
      </figcaption>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={Math.max(W, 320)}
          height={H}
          role="img"
          aria-label="日別の労働時間内訳（所定内・法定内残業・法定外残業・法定休日）"
          className="max-w-full"
        >
          <defs>
            <pattern
              id="legal-hatch"
              patternUnits="userSpaceOnUse"
              width="6"
              height="6"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="var(--chart-legal)" />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="6"
                stroke="var(--color-card)"
                strokeWidth="2"
              />
            </pattern>
          </defs>

          {/* グリッド + y ラベル（recessive） */}
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={PAD_L}
                x2={W - 4}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--chart-grid)"
                strokeWidth={v === 480 ? 1.5 : 1}
                strokeDasharray={v === 480 ? "none" : "2 3"}
              />
              <text
                x={PAD_L - 6}
                y={y(v) + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize="9"
              >
                {minutesToHm(v)}
              </text>
            </g>
          ))}

          {/* バー */}
          {days.map((d, i) => {
            const x = PAD_L + i * step;
            let cursor = 0;
            const segs = SERIES.map((s) => {
              const val = d[s.key];
              if (val <= 0) return null;
              const y0 = y(cursor);
              const y1 = y(cursor + val);
              cursor += val;
              const h = Math.max(0, y0 - y1 - GAP);
              return { s, val, y1, h };
            }).filter((x): x is NonNullable<typeof x> => x !== null);

            return (
              <g key={d.dateStr}>
                {segs.map(({ s, val, y1, h }, idx) => (
                  <rect
                    key={s.key}
                    x={x}
                    y={y1}
                    width={barW}
                    height={h}
                    rx={idx === segs.length - 1 ? 3 : 0}
                    fill={s.fill}
                  >
                    {/* 複数の子に分けるとサーバーとクライアントで文字列が食い違うため、1 つの文字列にする */}
                    <title>{`${d.label} ${s.label} ${minutesToHm(val)}`}</title>
                  </rect>
                ))}
                {i % Math.ceil(n / 16 || 1) === 0 ? (
                  <text
                    x={x + barW / 2}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize="9"
                  >
                    {d.label.replace(/^\d+\//, "")}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {/* 凡例（常時表示・色のみに依存しない） */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-sm"
              style={{ background: s.swatch }}
            />
            <span className="text-muted-foreground">{s.label}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
