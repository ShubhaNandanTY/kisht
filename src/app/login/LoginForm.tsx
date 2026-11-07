"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LangToggle, useT } from "@/i18n/client";
import { Button, Spinner } from "@/components/ui";

type Account = { email: string; name: string; role: string; note: string; hint: string };
type Demo = { password: string | null; accounts: Account[] } | null;

const POINTS = [
  ["Who matters most today, and why", "Every overdue loan scored for its chance of rolling, with the three reasons in Hindi or English."],
  ["Three taps, even with no signal", "Paid, promise, not reachable or dispute, with GPS. Saved on the phone and synced later."],
  ["8 am to 7 pm, enforced", "Calls and reminders outside RBI hours are blocked, and every attempt is recorded."],
  ["Roll rates today, not on Friday", "By branch, against the 16% target, with this month projected by the model."],
];

export function LoginForm({ demo }: { demo: Demo }) {
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent, override?: { email: string; password: string }) {
    e?.preventDefault();
    const creds = override ?? { email, password };
    setBusy(creds.email);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creds) });
      const data = await res.json();
      if (!res.ok) {
        setError(res.status === 429 ? t("login.throttled") : t("login.failed"));
        setBusy(null);
        return;
      }
      router.replace(data.role === "officer" ? "/officer" : "/manager");
      router.refresh();
    } catch {
      setError(t("common.offline"));
      setBusy(null);
    }
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-accent-strong px-12 py-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-white/10">
            <img src="/icon.svg" alt="" className="size-9" />
          </span>
          <span className="text-lg font-semibold">Kisht</span>
        </div>
        <div className="mt-auto max-w-md">
          <p className="text-sm font-medium tracking-wide text-white/60 uppercase">Field collections · Company A</p>
          <h2 className="mt-3 text-3xl leading-tight font-semibold tracking-tight">Know which borrowers matter most today, and why.</h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map(([title, body]) => (
              <li key={title} className="flex gap-4">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-white/70" aria-hidden />
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-white/70">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-12 text-xs text-white/50">Demo with invented data. No real borrower is contacted.</p>
        <svg className="pointer-events-none absolute -top-24 -right-24 size-80 text-white/[0.04]" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="50" fill="currentColor" />
        </svg>
      </aside>

      <main className="mx-auto flex w-full max-w-md flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10 lg:justify-center lg:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="flex items-center gap-2.5 lg:hidden">
            <img src="/icon.svg" alt="" className="size-8" />
            <span className="text-lg font-semibold">{t("app.name")}</span>
          </div>
          <LangToggle />
        </div>

        <div className="mt-12 lg:mt-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
          <p className="mt-1 text-muted">{t("app.tagline")}</p>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
          <label className="block">
            <span className="text-sm font-medium">{t("login.email")}</span>
            <input
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-xl border border-line px-3.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("login.password")}</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-xl border border-line px-3.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </label>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!!busy || !email || !password}>
            {busy === email && email ? <Spinner /> : t("login.submit")}
          </Button>
        </form>

        {demo && (
          <section className="mt-10">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xs font-medium tracking-wide text-muted uppercase">{t("login.demo")}</h2>
              {demo.password && <p className="text-xs text-faint">{t("login.demo.hint", { password: demo.password })}</p>}
            </div>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {demo.accounts.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => {
                      setEmail(a.email);
                      if (demo.password) {
                        setPassword(demo.password);
                        submit(undefined, { email: a.email, password: demo.password });
                      }
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface disabled:opacity-60"
                  >
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${a.role === "officer" ? "bg-accent-soft text-accent-strong" : "bg-info-soft text-info"}`} aria-hidden>
                      {a.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {a.name} <span className="font-normal text-muted">· {t(`login.role.${a.role}`)}, {a.note}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">{a.hint}</span>
                    </span>
                    {busy === a.email ? <Spinner className="size-4 text-muted" /> : <span className="text-faint" aria-hidden>→</span>}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-faint">Officer screens are designed for a phone. On a computer, narrow the window or use the browser&apos;s device mode.</p>
          </section>
        )}
      </main>
    </div>
  );
}
