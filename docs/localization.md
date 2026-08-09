# Localization

The game presentation supports exactly `en-US`, `pt-BR`, `zh-CN`, and `fil-PH`, with `en-US` as the fallback. The four selectors use local United States, Brazil, Mainland China, and Philippines flag assets. The browser entry point restores a supported `lucky888.locale` preference; otherwise it maps Portuguese tags to `pt-BR`, Simplified Chinese tags to `zh-CN`, and both modern Filipino (`fil`, including regional/script variants) and legacy Tagalog (`tl`, including regional variants) tags to `fil-PH`. Unsupported tags resolve to English.

## Architecture

`apps/game/src/i18n/types.ts` defines the locale union, structured message descriptors, and the complete dictionary shape. Each file in `apps/game/src/i18n/locales` must satisfy that shape at compile time. `Localization` owns the selected locale, persistence, subscriptions, and message rendering. DOM labels, the controller, Phaser presentation, and diagnostic cards subscribe to it and rerender from structured state, so switching language does not regenerate a result or change credits, selected controls, sequence progress, payline state, or history records.

All player-facing numbers, credits, percentages, and times go through the centralized `Intl.NumberFormat` and `Intl.DateTimeFormat` helpers in `apps/game/src/i18n/format.ts`. Mathematical values and result generation remain locale-independent.

The following are deliberately invariant:

- the `LUCKY888` product name;
- reel symbols, symbol IDs, payline IDs, configuration IDs, and diagnostic machine fields;
- the visible `SPIN` button label;
- diagnostic CSV filename and English headers.

The flag icons are local SVG assets under `apps/game/public/assets/flags`. HTML references them through Vite's `%BASE_URL%` placeholder so production builds work under the GitHub Pages `/lucky/` base path. The shared language selector is marked `no-export`; adding the Philippines flag does not change the rule that interactive language controls are omitted anywhere the existing controls are excluded from exports.

## Adding a locale

1. Add its exact tag to `SUPPORTED_LOCALES` in `types.ts`.
2. Create a complete dictionary in `locales` and add it to `TRANSLATIONS` in `index.ts`.
3. Extend browser-language mapping only when the fallback is unambiguous.
4. Add a local selector icon and button with an accessible name in the language it represents.
5. Extend full dictionary-shape, interpolation, pluralization, persistence/refresh, browser mapping, accessibility, active-sequence, payline/feature messaging, diagnostic-history retranslation, and centralized `Intl` formatting tests.
6. Run `npm run validate` and manually verify the selector, active sequences, payline highlights, diagnostic history, refresh persistence, and browser console.

Do not store rendered sentences as game or diagnostic state. Add a typed message key and parameters, then render it with the current locale. This keeps existing history and in-progress status re-translatable.

## Math dashboard Simplified Chinese glossary

The Math Performance Dashboard has its own typed dictionaries under `apps/math-dashboard/src/i18n`. Dashboard report data remains language-neutral; chart labels, summaries, interpretations, errors, accessibility text, and export metadata are rendered from semantic keys after a locale is selected.

Use the following domain terminology for `zh-CN`:

- `封顶后 RTP` is the estimated RTP after the maximum-win limit has been applied to the payout credited to the simulated player balance. It is distinct from `未封顶 RTP`, even when no cap application occurred and the values are equal.
- Use `免费旋转` for this game's specific free-spin mechanic. Reserve `奖励功能` for a genuinely generic bonus-feature abstraction; never use bare `功能` as the visible name of the mechanic.
- Use `回本频率` for the probability that a paid spin returns at least one times the wager. It does not imply a strictly profitable result.
- Metrics measured in counts of free spins use `局数` and `局免费旋转`, never `时长`, because they do not measure elapsed time.
- Use `正派彩频率`, `模拟观测最高派彩`, and `封顶触发频率` for the corresponding award-frequency, maximum-observed-win, and cap-application concepts.

Simplified Chinese translations must be reviewed as complete domain-specific phrases. Do not assemble Chinese sentences by concatenating independently translated English fragments.

Interactive language controls are marked `no-export` and must remain absent from PDF and PNG snapshots. Static exports identify their language through localized footer metadata such as `报告语言：简体中文`; they must not resemble an interactive interface.
