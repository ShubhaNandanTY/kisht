"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LangToggle, useT } from "@/i18n/client";
import { Button, Spinner } from "@/components/ui";

type Demo = { password: string | null; accounts: { email: string; name: string; role: string; note: string }[] } | null;

export function LoginForm({ demo }: { demo: Demo }) {
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent, override?: { email: string; password: string }) {
    e?.preventDefault();
    const creds = override ?? { email, password };
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creds) });
      const data = await res.json();
      if (!res.ok) {
        setError(res.status === 429 ? t("login.throttled") : t("login.failed"));
        return;
      }
      router.replace(data.role === "officer" ? "/officer" : "/manager");
      router.refresh();
    } catch {
      setError(t("common.offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="size-8" />
          <span className="text-lg font-semibold">{t("app.name")}</span>
        </div>
        <LangToggle />
      </div>

      <div className="mt-16">
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
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !email || !password}>
          {busy ? <Spinner /> : t("login.submit")}
        </Button>
      </form>

      {demo && (
        <section className="mt-12">
          <h2 className="text-xs font-medium tracking-wide text-muted uppercase">{t("login.demo")}</h2>
          {demo.password && <p className="mt-1 text-xs text-faint">{t("login.demo.hint", { password: demo.password })}</p>}
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
            {demo.accounts.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEmail(a.email);
                    if (demo.password) {
                      setPassword(demo.password);
                      submit(undefined, { email: a.email, password: demo.password });
                    }
                  }}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface"
                >
                  <span>
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block text-xs text-muted">
                      {t(`login.role.${a.role}`)} · {a.note}
                    </span>
                  </span>
                  <span className="text-faint" aria-hidden>
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
