// The text catalog. `messages()` returns the English object today; another language is a new file in ./messages/ added
// to `locales`. Caveats for a translator: plurals are per-message functions (no plural rules yet), word order lives
// inside each function (never concatenate translated parts), and terminal column widths are fixed, so a longer word
// needs a width check. No i18n library, no React or Ink import: core stays UI-free.
import { en } from "./messages/en.js";

export type Messages = typeof en;
export const locales = { en } satisfies Record<string, Messages>;
export type Locale = keyof typeof locales;
export const messages = (locale: Locale = "en"): Messages => locales[locale];
