import type {
  ConfidenceBand,
  Tier,
  VerificationStatus,
  VacancyStatus,
} from "@/lib/types";

/* Status pill — pastel tint + bold mono label + leading dot (Book I · Part IV) */
const pillTones: Record<string, string> = {
  DRAFT: "text-mid bg-white/5",
  LIVE: "text-pos bg-pos/10",
  CLOSED: "text-lo bg-white/5",
  VERIFIED: "text-pos bg-pos/10",
  PENDING: "text-warn bg-warn/10",
  FLAGGED: "text-neg bg-neg/10",
  "—": "text-lo bg-white/5",
};

export function StatusPill({ label }: { label: VacancyStatus | VerificationStatus | string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.08em] ${pillTones[label] ?? "text-mid bg-white/5"}`}>
      <span className="size-1 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  const tone = tier === "Top" ? "border-hairline-strong text-hi" : tier === "Mid" ? "border-hairline text-mid" : "border-hairline text-lo";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] tracking-[0.08em] uppercase ${tone}`}>
      {tier === "Top" && <span className="size-1 rounded-full iris-line" />}
      {tier}
    </span>
  );
}

/* Confidence — color + icon + word, never a bare % (Book I · Part VIII.2) */
const confTone: Record<ConfidenceBand, { cls: string; icon: string }> = {
  High: { cls: "text-pos", icon: "◆" },
  Medium: { cls: "text-warn", icon: "◈" },
  Low: { cls: "text-neg", icon: "◇" },
};

export function ConfidenceBadge({ band, compact }: { band: ConfidenceBand; compact?: boolean }) {
  const t = confTone[band];
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.08em] uppercase ${t.cls}`}>
      <span aria-hidden>{t.icon}</span>
      {compact ? band : `${band} confidence`}
    </span>
  );
}

/* Score cell — micro-bar + tabular number, threshold-colored (Book III · §5) */
export function ScoreCell({ score, threshold }: { score: number; threshold: number }) {
  const passed = score >= threshold;
  return (
    <div className="flex items-center gap-2.5">
      <span className={`tnum font-mono text-[13px] ${passed ? "text-hi" : "text-mid"}`}>{score}</span>
      <span className="relative h-1 w-14 overflow-hidden rounded-full bg-white/8">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${score}%`, backgroundColor: passed ? "var(--pos)" : "var(--line-mid)" }}
        />
      </span>
    </div>
  );
}

/* 1-line sparkline (KPI tiles, mini-scores) */
export function Sparkline({ data, w = 64, h = 18, stroke = "var(--line-strong)" }: { data: number[]; w?: number; h?: number; stroke?: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1" />
    </svg>
  );
}

/* Compact per-competency dot-strip (ranking table) */
export function MiniScores({ scores, threshold }: { scores: { name: string; score: number }[]; threshold: number }) {
  return (
    <div className="flex items-end gap-1" title={scores.map((s) => `${s.name}: ${s.score}`).join(" · ")}>
      {scores.map((s) => (
        <span
          key={s.name}
          className="w-1.5 rounded-[1px]"
          style={{
            height: `${4 + (s.score / 100) * 14}px`,
            backgroundColor: s.score >= threshold ? "var(--line-strong)" : "var(--line-soft)",
          }}
        />
      ))}
    </div>
  );
}

/* The glowing white cube — brand anchor, pure CSS (static fallback register) */
export function Cube({ size = 72, dim }: { size?: number; dim?: boolean }) {
  const s = size;
  return (
    <div className={`cube-glow relative ${dim ? "opacity-40" : ""}`} style={{ width: s, height: s }} aria-hidden>
      <svg viewBox="0 0 100 100" width={s} height={s}>
        {/* plain white cube — solid faces, edge lines only */}
        <polygon points="50,8 88,28 50,48 12,28" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="0.75" strokeLinejoin="round" />
        <polygon points="12,28 50,48 50,92 12,72" fill="#E9E9EC" stroke="#FFFFFF" strokeWidth="0.75" strokeLinejoin="round" />
        <polygon points="88,28 50,48 50,92 88,72" fill="#D8D8DC" stroke="#FFFFFF" strokeWidth="0.75" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/* KPI tile (Book I · Part IV) */
export function KpiTile({ label, value, trend, spark, alert }: { label: string; value: number; trend: number; spark: number[]; alert?: boolean }) {
  const negTrend = trend < 0;
  return (
    <div className="brackets card-hover rounded-xl border border-hairline bg-surface p-5">
      <div className="hud-label">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className={`tnum font-medium text-[28px] leading-none ${alert && value > 0 ? "text-neg" : "text-hi"}`}>
          {Number.isInteger(value) ? value : value.toFixed(1)}
        </span>
        <Sparkline data={spark} stroke={alert ? "var(--neg)" : "var(--line-mid)"} />
      </div>
      {trend !== 0 && (
        <div className={`tnum mt-2 font-mono text-[11px] ${negTrend ? (alert ? "text-pos" : "text-neg") : alert ? "text-neg" : "text-pos"}`}>
          {negTrend ? "▾" : "▴"} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}
