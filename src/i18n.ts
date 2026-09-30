import { useSyncExternalStore } from "react";
import { messages } from "./locales.ts";

export type Language = "en" | "ru" | "kk";
export const LANGUAGE_KEY = "guidecheck.locale.v1";
const listeners = new Set<() => void>();
const valid = (value: string | null): value is Language =>
  value === "en" || value === "ru" || value === "kk";
let language: Language = "en";
if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (valid(saved)) language = saved;
  } catch {
    /* UI remains usable when preference storage is blocked. */
  }
  window.addEventListener("storage", (event) => {
    if (event.key === LANGUAGE_KEY && valid(event.newValue)) {
      language = event.newValue;
      document.documentElement.lang = language;
      listeners.forEach((fn) => fn());
    }
  });
  document.documentElement.lang = language;
}
export function setLanguage(value: Language): boolean {
  language = value;
  if (typeof document !== "undefined") document.documentElement.lang = value;
  let saved = true;
  try {
    if (typeof window !== "undefined")
      localStorage.setItem(LANGUAGE_KEY, value);
  } catch {
    saved = false;
  }
  listeners.forEach((fn) => fn());
  return saved;
}
export function useLanguage(): Language {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => language,
    () => "en",
  );
}
export function translate(
  key: string,
  locale: Language,
  params: Record<string, string | number> = {},
): string {
  const template =
    locale === "en" ? key : (messages[key]?.[locale === "ru" ? 0 : 1] ?? key);
  return template.replace(/\{(\w+)\}/g, (token, name: string) =>
    params[name] === undefined
      ? token
      : typeof params[name] === "number"
        ? new Intl.NumberFormat(locale).format(params[name])
        : String(params[name]),
  );
}
export const t = (key: string, params?: Record<string, string | number>) =>
  translate(key, language, params);
export const number = (value: number) =>
  new Intl.NumberFormat(language).format(value);
export function date(value: string) {
  return (
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}
type Noun =
  "steps" | "versions" | "guides" | "reviews" | "changed steps" | "screenshots";
const nouns: Record<Noun, Record<Language, readonly string[]>> = {
  steps: {
    en: ["step", "steps", "steps"],
    ru: ["шаг", "шага", "шагов"],
    kk: ["қадам", "қадам", "қадам"],
  },
  versions: {
    en: ["version", "versions", "versions"],
    ru: ["версия", "версии", "версий"],
    kk: ["нұсқа", "нұсқа", "нұсқа"],
  },
  guides: {
    en: ["guide", "guides", "guides"],
    ru: ["руководство", "руководства", "руководств"],
    kk: ["нұсқаулық", "нұсқаулық", "нұсқаулық"],
  },
  reviews: {
    en: ["review entry", "review entries", "review entries"],
    ru: ["запись проверки", "записи проверки", "записей проверки"],
    kk: ["тексеру жазбасы", "тексеру жазбасы", "тексеру жазбасы"],
  },
  "changed steps": {
    en: ["changed step", "changed steps", "changed steps"],
    ru: ["изменённый шаг", "изменённых шага", "изменённых шагов"],
    kk: ["өзгерген қадам", "өзгерген қадам", "өзгерген қадам"],
  },
  screenshots: {
    en: ["screenshot", "screenshots", "screenshots"],
    ru: ["снимок экрана", "снимка экрана", "снимков экрана"],
    kk: ["экран суреті", "экран суреті", "экран суреті"],
  },
};
export function count(
  noun: Noun,
  value: number,
  locale: Language = language,
): string {
  const category = new Intl.PluralRules(locale).select(value);
  return (
    new Intl.NumberFormat(locale).format(value) +
    " " +
    nouns[noun][locale][category === "one" ? 0 : category === "few" ? 1 : 2]
  );
}
const field = (name: string): string => {
  const step = /^Step (\d+)( ID| title| instructions)?$/.exec(name);
  if (step)
    return t(`Step {number}${step[2] ?? ""}`, { number: Number(step[1]) });
  return t(
    (
      {
        reviewer: "Reviewer",
        note: "Review note",
        context: "Environment / evidence source",
      } as Record<string, string>
    )[name] ?? name,
  );
};
export function errorText(message: string): string {
  if (language === "en" || messages[message]) return t(message);
  let match: RegExpExecArray | null;
  if (
    (match = /^(.+) must be (non-empty )?text, up to (\d+) characters\.$/.exec(
      message,
    ))
  )
    return t(
      match[2]
        ? "{field} must be non-empty text, up to {max} characters."
        : "{field} must be text, up to {max} characters.",
      { field: field(match[1]), max: Number(match[3]) },
    );
  if ((match = /^(.+) must be an object\.$/.exec(message)))
    return t("{field} must be an object.", { field: field(match[1]) });
  if (
    (match = /^(.+) must be a single line without control characters\.$/.exec(
      message,
    ))
  )
    return t("{field} must be a single line without control characters.", {
      field: field(match[1]),
    });
  if ((match = /^(.+) is invalid\.$/.exec(message)))
    return t("{field} is invalid.", { field: field(match[1]) });
  if (
    (match =
      /^Step (\d+) links must be HTTP\(S\) URLs without credentials, up to 20 links\.$/.exec(
        message,
      ))
  )
    return t(
      "Step {number} links must be HTTP(S) URLs without credentials, up to 20 links.",
      { number: Number(match[1]) },
    );
  if (
    (match =
      /^Review (reviewer|note|context) is required, up to (\d+) characters\.$/.exec(
        message,
      ))
  )
    return t("Review {field} is required, up to {max} characters.", {
      field: field(match[1]),
      max: Number(match[2]),
    });
  if ((match = /^Request exceeds the (\d+) MB limit\.$/.exec(message)))
    return t("Request exceeds the {max} MB limit.", { max: Number(match[1]) });
  return t(
    "Could not complete this action. Existing saved data was not replaced. Try refreshing the workspace.",
  );
}
