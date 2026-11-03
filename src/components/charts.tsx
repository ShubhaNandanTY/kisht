"use client";

import { useState } from "react";

import { SERIES } from "./palette";

const GRID = "#eceef1";
const AXIS = "#98a1ae";

export type Series = { id: string; label: string; color: string; points: { x: string; y: number | null; projected?: boolean; n?: number }[] };

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * Line chart for rates over time, one y-axis (percent). Projected points (cohorts still
 * maturing, estimated by the model) are drawn dashed and hollow so they never read as actuals.
 */
export function RateLines({
  series,
  xLabels,
  refLines = [],
  height = 220,
  yMax: yMaxIn,
}: {
  series: Series[];
  xLabels: { x: string; label: string }[];
  refLines?: { y: number; label: string }[];
  height?: number;
  yMax?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const pad = { l: 44, r: 96, t: 12, b: 28 };
  const allY = series.flatMap((s) => s.points.map((p) => p.y ?? 0)).concat(refLines.map((r) => r.y));
  const yMax = yMaxIn ?? Math.max(0.3, Math.ceil((Math.max(...allY) * 1.15) / 0.05) * 0.05);
  const n = xLabels.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => pad.t + (1 - v / yMax) * (height - pad.t - pad.b);
  // Direct labels at the line ends, nudged apart so they never overlap (min 14px).
  const ends = series
    .map((s) => {
      const p = [...s.points].reverse().find((q) => q.y !== null);
      return p ? { id: s.id, y: y(p.y!) } : null;
    })
    .filter((e): e is { id: string; y: number } => e !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  const labelYs = new Map(ends.map((e) => [e.id, e.y]));
  const ticks = Array.from({ length: Math.round(yMax / 0.1) + 1 }, (_, i) => i * 0.1).filter((t) => t <= yMax + 1e-9);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Roll rate by month" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={AXIS}>
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        {xLabels.map((l, i) => (
          <text key={l.x} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill={AXIS}>
            {l.label}
          </text>
        ))}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={pad.l} x2={W - pad.r} y1={y(r.y)} y2={y(r.y)} stroke="#5d6675" strokeDasharray="4 4" strokeWidth="1" />
            <text x={pad.l + 6} y={y(r.y) - 5} fontSize="11" fill="#5d6675">
              {r.label}
            </text>
          </g>
        ))}
        {series.map((s) => {
          const idx = (xv: string) => xLabels.findIndex((l) => l.x === xv);
          const labelY = labelYs.get(s.id);
          const pts = s.points.filter((p) => p.y !== null && idx(p.x) >= 0);
          const solid = pts.filter((p) => !p.projected);
          const lastSolid = solid[solid.length - 1];
          const proj = pts.filter((p) => p.projected);
          const path = (ps: typeof pts) => ps.map((p, i) => `${i ? "L" : "M"}${x(idx(p.x))},${y(p.y!)}`).join("");
          const last = pts[pts.length - 1];
          return (
            <g key={s.id}>
              <path d={path(solid)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
              {proj.length > 0 && <path d={path(lastSolid ? [lastSolid, ...proj] : proj)} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray="3 4" />}
              {pts.map((p) => (
                <circle key={p.x} cx={x(idx(p.x))} cy={y(p.y!)} r="4" fill={p.projected ? "#fff" : s.color} stroke={p.projected ? s.color : "#fff"} strokeWidth="2" />
              ))}
              {last && series.length > 1 && labelY !== undefined && (
                <text x={x(idx(last.x)) + 10} y={labelY} dy="0.32em" fontSize="11" fill="#101828" className="font-medium">
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke="#c9ced6" />}
        {xLabels.map((l, i) => (
          <rect
            key={l.x}
            x={x(i) - (W - pad.l - pad.r) / Math.max(n - 1, 1) / 2}
            y={pad.t}
            width={(W - pad.l - pad.r) / Math.max(n - 1, 1)}
            height={height - pad.t - pad.b}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
          />
        ))}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: `${Math.min((x(hover) / W) * 100, 70)}%` }}
        >
          <p className="mb-1 font-medium">{xLabels[hover].label}</p>
          {series.map((s) => {
            const p = s.points.find((q) => q.x === xLabels[hover].x);
            if (!p || p.y === null) return null;
            return (
              <p key={s.id} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="num font-medium">
                  {pct(p.y)}
                  {p.projected ? " (projected)" : ""}
                  {p.n ? <span className="text-faint"> · {p.n}</span> : null}
                </span>
              </p>
            );
          })}
        </div>
      )}
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <svg width="16" height="8" aria-hidden>
              <line x1="0" x2="16" y1="4" y2="4" stroke="#5d6675" strokeDasharray="3 3" strokeWidth="2" />
            </svg>
            Projected by model (cohort not yet 30 days old)
          </span>
        </div>
      )}
    </div>
  );
}

/** Horizontal bar against a target marker: one rate per row. */
export function RateBar({ value, target, max = 0.4, color }: { value: number | null; target: number; max?: number; color: string }) {
  const w = (v: number) => `${Math.min(v / max, 1) * 100}%`;
  return (
    <div className="relative h-2 w-full rounded-full bg-surface" aria-hidden>
      {value !== null && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: w(value), background: color }} />}
      <div className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ left: w(target) }} title={`Target ${pct(target)}`} />
    </div>
  );
}

/** Calibration: for each score band, what the model predicted vs what actually happened. */
export function CalibrationBars({ bands }: { bands: { band: string; n: number; predicted: number; actual: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const pad = { l: 44, r: 8, t: 10, b: 28 };
  const yMax = 1;
  const groupW = (W - pad.l - pad.r) / Math.max(bands.length, 1);
  const barW = Math.min(28, groupW / 3);
  const y = (v: number) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const colors = [SERIES[0], SERIES[1]];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Predicted versus actual roll rate by score band" onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={AXIS}>
              {t * 100}%
            </text>
          </g>
        ))}
        {bands.map((b, i) => {
          const cx = pad.l + groupW * i + groupW / 2;
          return (
            <g key={b.band} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + groupW * i} y={pad.t} width={groupW} height={H - pad.t - pad.b} fill={hover === i ? "#f6f7f9" : "transparent"} />
              {[b.predicted, b.actual].map((v, j) => {
                const top = y(v);
                const bx = cx - barW - 1 + j * (barW + 2);
                const h = Math.max(H - pad.b - top, 1);
                return <path key={j} d={`M${bx},${H - pad.b} V${top + 4} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${H - pad.b} Z`} fill={colors[j]} style={{ display: h > 0 ? undefined : "none" }} />;
              })}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill={AXIS}>
                {b.band}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && bands[hover] && (
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-md">
          <p className="mb-1 font-medium">Score band {bands[hover].band}</p>
          <p>
            Predicted <span className="num font-medium">{pct(bands[hover].predicted)}</span> · Actual <span className="num font-medium">{pct(bands[hover].actual)}</span>
          </p>
          <p className="text-faint">{bands[hover].n} loan-days</p>
        </div>
      )}
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm" style={{ background: colors[0] }} />
          Predicted roll rate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm" style={{ background: colors[1] }} />
          Actual roll rate
        </span>
      </div>
    </div>
  );
}
