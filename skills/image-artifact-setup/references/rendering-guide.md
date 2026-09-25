# Rendering guide

Read this while writing the generator (phase 5). `assets/card-renderer.ts` already implements most of it; this explains why, and what to adapt.

## Rendering essentials

These cause most bad output:

1. **Wait for fonts.** `await page.evaluate(() => document.fonts.ready)` plus a short pause before every screenshot. Without it the capture can land before webfonts swap in, and the type silently falls back to a system serif.
2. **Set `deviceScaleFactor` deliberately**, per the phase 4 serving decision: 1 for images served raw, 2 for images an image pipeline re-processes.
3. **Inline every asset** as a data URI (`imageDataUri` in the renderer). The page is rendered from a string, so a relative path has nothing to resolve against. Google Fonts over the network is the practical exception.
4. **Choose the encoding by content.**
   - Cards with glows, gradients, blur, or photos: `format: 'jpeg'` (quality 88, no chroma subsampling). Smooth and roughly 40% of the PNG size.
   - Flat art (solid fills, type, icons): `optimize: true` palette PNG is smallest and lossless-looking.
   - Palette PNG on the default frame bands its blurred glows into visible rings, so never combine the two.
   - Source art the project's own pipeline re-encodes: plain PNG.

## Icons

Reusing the project's own icon for a thing makes a card feel native rather than templated. React icon components render to static SVG:

```ts
import { renderToStaticMarkup } from 'react-dom/server';
renderToStaticMarkup(React.createElement(Icon, { width: 44, strokeWidth: 1.5 }));
```

Colour them by setting `color` on the container, since most icon sets stroke with `currentColor`.

## Fail loudly

Check anything external (a dev server, a font, an env var) up front and exit with the fix, rather than emitting a folder of blank images. The renderer's `assertReachable(url, hint)` does this for URLs:

```ts
await assertReachable(DEV_SERVER, 'These cards are shot from the live app. Start it first with the project\'s dev script.');
```

Log one line per artifact written, and a summary of anything that degraded. A silent fallback is how a broken card ships.

## Variable-length content

Text of unpredictable length is the most common defect in generated cards. Real titles range from about 11 to 30+ characters, and descriptions from about 28 to 98. Design against it from the start:

- **Step the title size by length** (`titleSize` in the renderer) rather than letting it wrap to a third line. Tune the thresholds to the project's real titles.
- **Clamp descriptions** to a fixed line count (`-webkit-line-clamp: 2`) so every card occupies the same space. When the truncation reads badly, the source copy is too long for a card; tell the user, since shortening it usually improves the page too.
- **Set `text-wrap: balance` and `hyphens: none`** on headings. Default hyphenation produces breaks like `in-` / `editor`.
- **Centre content vertically** so short and long cards both sit right, and reserve space for anything pinned to an edge.

## Known CSS trap

A clipping ancestor (`overflow: hidden`) forces `transform-style` back to `flat`, so layered `translateZ` parallax inside a rounded card silently does nothing. Use a different effect rather than shipping code that appears to work.
