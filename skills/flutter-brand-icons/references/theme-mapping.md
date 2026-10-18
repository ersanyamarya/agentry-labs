# Mapping theme colors to icon roles

The config needs five colors. Pick each from the theme source, in this order of authority: a brand doc's explicit logo or icon rule, then its color table, then the Dart theme.

| Config key | What it paints | Pick |
|---|---|---|
| `roles.mark.light` | The logo on light backgrounds (app icon, light splash, store icons) | The light-scheme **primary** or the documented logo color |
| `roles.mark.dark` | The logo on the dark splash and the iOS dark icon | The dark-scheme **primary** (the light tone of the same hue), not the light-mode value |
| `background.light` | Icon background, light splash background | A light neutral surface or `primaryContainer`. A tinted neutral reads better on a home screen than pure white |
| `background.dark` | Dark splash background | The darkest dark-scheme surface, or a very dark shade of the primary hue |
| `tinted` | iOS tinted icon and Android 13 themed (monochrome) icon | Keep `#999898`. Both platforms use only the shape and luminance; brand color has no effect |

Extra roles (`roles.accent`, ...) exist only when the SVG has a second flat color. Map that color in `recolor` and pick the brand's secondary or accent for it.

## Reading each source

- **Markdown brand or design docs:** prefer a table row or heading that names the logo, icon, or "primary". A row with two hex values is usually light then dark. Ignore semantic colors (error, success, warning) and borders.
- **Dart theme (`ThemeData` / `ColorScheme`):** `primary:` in the light and dark schemes gives the two mark colors, and `surface` or `surfaceContainerLowest` gives the backgrounds. `Color(0xFF0B3B46)` is `#0B3B46`.
- **`ColorScheme.fromSeed(seedColor: ...)` only:** the scheme's colors are computed at run time, so no literal exists. Use the seed as `roles.mark.light`, then ask the user for the dark-mode and background colors instead of guessing tonal values.

## Checks

- `check-config.mjs` rejects any mark/background pair below 3:1, the WCAG contrast minimum for graphics. When a pair fails, move the background toward white or black in the same hue rather than changing the brand's mark color.
- When an existing `flutter_launcher_icons.yaml` / `flutter_native_splash.yaml` already sets background colors, show the user the existing and the theme-derived values side by side, and ask which to keep.
