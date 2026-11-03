"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { translate, type Lang } from "./dict";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, params?: Record<string, string | number>) => string };

const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `kisht_lang=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
  }, []);
  const value = useMemo(() => ({ lang, setLang, t: (k: string, p?: Record<string, string | number>) => translate(lang, k, p) }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  const c = useContext(LangContext);
  if (!c) throw new Error("useT outside LangProvider");
  return c;
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "hi" ? "en" : "hi")}
      className={`h-9 min-w-11 rounded-full border border-line px-3 text-sm font-medium text-muted hover:text-ink ${className}`}
      aria-label={lang === "hi" ? "Switch to English" : "हिंदी में बदलें"}
    >
      {lang === "hi" ? "EN" : "हिं"}
    </button>
  );
}
