import { en } from "./en";
import { fr } from "./fr";

export type SupportedLocale = "en" | "fr";

const TRANSLATIONS = { en, fr } as const;

export type TranslationKey = keyof typeof en;

export const DEFAULT_LOCALE: SupportedLocale = "en";
export const DEFAULT_FAN_MODE_LABEL_KEY: TranslationKey = "auto";

const normalizeLocale = (lang: string): SupportedLocale => {
  const normalized = lang.toLowerCase().replace(/_/g, "-");
  if (normalized.startsWith("fr")) return "fr";
  return "en";
};

const getRawSteamLanguage = (): string | undefined => {
  const w = window as any;
  const candidates = [
    w?.SteamClient?.Settings?.GetCurrentLanguage?.(),
    w?.SteamClient?.Settings?.GetSteamUILanguage?.(),
    w?.LocalizationManager?.m_strLanguage,
    w?.i18nManager?.m_strLanguage,
    w?.navigator?.language,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
    if (
      candidate &&
      typeof candidate === "object" &&
      typeof candidate.language === "string"
    ) {
      return candidate.language;
    }
  }
  return undefined;
};

let cachedRawLanguage: string | undefined;
let cachedLocale: SupportedLocale = DEFAULT_LOCALE;

const getActiveLocale = (): SupportedLocale => {
  const rawLanguage = getRawSteamLanguage() || DEFAULT_LOCALE;
  if (rawLanguage !== cachedRawLanguage) {
    cachedRawLanguage = rawLanguage;
    cachedLocale = normalizeLocale(rawLanguage);
  }
  return cachedLocale;
};

export const t = (
  key: TranslationKey,
  vars?: Record<string, string | number>
): string => {
  const locale = getActiveLocale();
  const template = TRANSLATIONS[locale][key] ?? TRANSLATIONS.en[key];
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
    template
  );
};
