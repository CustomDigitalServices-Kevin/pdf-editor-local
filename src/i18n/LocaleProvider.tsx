import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { MESSAGES } from "./messages";
import type { Locale, MessageKey } from "./messages";

type LocaleCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey) => string;
};

const Ctx = createContext<LocaleCtx | null>(null);

function detectLocale(): Locale {
  if (
    typeof navigator !== "undefined" &&
    navigator.language.toLowerCase().startsWith("fr")
  ) {
    return "fr";
  }
  return "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const value = useMemo<LocaleCtx>(
    () => ({
      locale,
      setLocale,
      t: (key) => MESSAGES[locale][key],
    }),
    [locale],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
