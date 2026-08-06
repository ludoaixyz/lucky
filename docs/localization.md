# Localization

The game presentation supports exactly `en-US`, `pt-BR`, and `zh-CN`, with `en-US` as the fallback. The browser entry point restores a supported `lucky888.locale` preference, otherwise maps Portuguese and Simplified Chinese browser language tags to their supported locale. All other tags resolve to English.

## Architecture

`apps/game/src/i18n/types.ts` defines the locale union, structured message descriptors, and the complete dictionary shape. Each file in `apps/game/src/i18n/locales` must satisfy that shape at compile time. `Localization` owns the selected locale, persistence, subscriptions, and message rendering. DOM labels, the controller, Phaser presentation, and diagnostic cards subscribe to it and rerender from structured state, so switching language does not regenerate a result or change credits, selected controls, sequence progress, payline state, or history records.

All player-facing numbers, credits, percentages, and times go through the centralized `Intl.NumberFormat` and `Intl.DateTimeFormat` helpers in `apps/game/src/i18n/format.ts`. Mathematical values and result generation remain locale-independent.

The following are deliberately invariant:

- the `LUCKY888` product name;
- reel symbols, symbol IDs, payline IDs, configuration IDs, and diagnostic machine fields;
- the visible `SPIN` button label;
- diagnostic CSV filename and English headers.

The flag icons are local SVG assets under `apps/game/public/assets/flags`. HTML references them through Vite's `%BASE_URL%` placeholder so production builds work under the GitHub Pages `/lucky/` base path.

## Adding a locale

1. Add its exact tag to `SUPPORTED_LOCALES` in `types.ts`.
2. Create a complete dictionary in `locales` and add it to `TRANSLATIONS` in `index.ts`.
3. Extend browser-language mapping only when the fallback is unambiguous.
4. Add a local selector icon and button with an accessible name in the language it represents.
5. Extend localization, interpolation, pluralization, persistence, accessibility, and live-switch tests.
6. Run `npm run validate` and manually verify the selector, active sequences, payline highlights, diagnostic history, refresh persistence, and browser console.

Do not store rendered sentences as game or diagnostic state. Add a typed message key and parameters, then render it with the current locale. This keeps existing history and in-progress status re-translatable.
