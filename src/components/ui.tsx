"use client";

import { useEffect } from "react";

type Tone = "neutral" | "accent" | "danger" | "warn" | "info" | "success";

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface text-muted",
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-accent-soft text-accent-strong",
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
};

export function Pill({ tone = "neutral", children, className = "" }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${toneClass[tone]} ${className}`}>{children}</span>;
}

export function Dot({ tone }: { tone: Tone }) {
  const c = { neutral: "bg-faint", accent: "bg-accent", success: "bg-accent", danger: "bg-danger", warn: "bg-warn", info: "bg-info" }[tone];
  return <span className={`inline-block size-1.5 rounded-full ${c}`} aria-hidden />;
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  const v = {
    primary: "bg-accent text-white hover:bg-accent-strong disabled:bg-faint",
    secondary: "bg-white text-ink border border-line hover:bg-surface disabled:text-faint",
    ghost: "text-muted hover:text-ink hover:bg-surface",
    danger: "bg-white text-danger border border-line hover:bg-danger-soft",
  }[variant];
  const s = { sm: "h-8 px-3 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-14 px-5 text-base" }[size];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${v} ${s} ${className}`}
      {...props}
    />
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} role="status" aria-label="Loading" />;
}

/** Bottom sheet: one-handed reach on a phone, a centred dialog on wider screens. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="animate-fade absolute inset-0 bg-ink/30" onClick={onClose} aria-label="Close" />
      <div className="animate-sheet relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-3xl sm:pt-5">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />
        {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Toast({ message, tone = "neutral", onDone }: { message: string | null; tone?: Tone; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  const bg = tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-ink";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4" role="status" aria-live="polite">
      <div className={`animate-fade max-w-sm rounded-2xl px-4 py-3 text-sm text-white shadow-lg ${bg}`}>{message}</div>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 size-10 rounded-full border-2 border-dashed border-line" aria-hidden />
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ScoreBadge({ score, size = "md" }: { score: number; size?: "md" | "lg" }) {
  const tone = score >= 60 ? "text-danger" : score >= 35 ? "text-warn" : "text-muted";
  const ring = score >= 60 ? "#b42318" : score >= 35 ? "#93590a" : "#98a1ae";
  const dim = size === "lg" ? 64 : 44;
  const r = dim / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <div className={`relative grid shrink-0 place-items-center ${tone}`} style={{ width: dim, height: dim }}>
      <svg width={dim} height={dim} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke="#e7e9ee" strokeWidth="3" />
        <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke={ring} strokeWidth="3" strokeDasharray={`${(score / 100) * c} ${c}`} strokeLinecap="round" />
      </svg>
      <span className={`num font-semibold ${size === "lg" ? "text-xl" : "text-[15px]"}`}>{score}</span>
    </div>
  );
}
