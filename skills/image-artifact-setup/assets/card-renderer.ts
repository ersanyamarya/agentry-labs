/**
 * Shared frame and Chromium runner for generated card images.
 *
 * Copy this into `scripts/image-gen-tools/lib/card-renderer.ts` and replace the
 * THEME values with the project's real design tokens. Keep every card family
 * (Open Graph cards, tile art, banners) rendering through this one module — the
 * moment there are two frames they start to drift, which is the whole problem
 * this tool exists to solve.
 *
 * Requires: bun add -d playwright-core sharp
 *           bunx playwright-core install chromium
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

/**
 * Copy these from the project's token source (see references/project-detection.md).
 * Use the literal values — if the project defines a colour in oklch, keep it in
 * oklch. Chromium supports modern colour spaces, and approximating to hex is how
 * generated images end up subtly off-brand.
 */
export type Theme = {
  /** Accent colour: rules, glows, icon tint, metric text. */
  readonly primary: string;
  /** Page background. */
  readonly background: string;
  /** Body/heading text colour. */
  readonly foreground: string;
  /** De-emphasised text (eyebrows, captions). */
  readonly muted: string;
  /** Panel/surface fill, slightly lifted off the background. */
  readonly surface: string;
  readonly fontDisplay: string;
  readonly fontBody: string;
  readonly fontMono: string;
  /**
   * Stylesheet providing the fonts above. Google Fonts is the one network
   * request worth making. For self-hosted or licensed fonts, leave this empty
   * and inline an @font-face with a base64 data URI in `extraCss` instead — a
   * file:// path cannot resolve from a string-rendered page.
   */
  readonly fontsHref: string;
};

export const THEME: Theme = {
  primary: '#c9754a',
  background: 'oklch(0.16 0.01 250)',
  foreground: 'oklch(0.96 0.005 250)',
  muted: 'oklch(0.62 0.015 250)',
  surface: 'oklch(0.185 0.011 250)',
  fontDisplay: "'Newsreader', ui-serif, Georgia, serif",
  fontBody: "'Manrope', ui-sans-serif, system-ui, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  fontsHref:
    'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=JetBrains+Mono:wght@400;600&family=Manrope:wght@400;500;600&display=swap',
};

/** 1200x630 is the Open Graph standard. See references/layout-presets.md for others. */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/**
 * The frame every card shares: base colour, two soft accent glows, a faint
 * masked grid, and a signature rule along the bottom. The glows and grid are
 * what stop a dark card reading as a flat rectangle — keep them very low
 * contrast so they register as texture rather than decoration.
 */
const frameCss = (t: Theme): string => `
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${CARD_WIDTH}px;height:${CARD_HEIGHT}px;overflow:hidden;
    --title-size:76px;
    background:${t.background};font-family:${t.fontBody};color:${t.foreground}}
  .frame{position:absolute;inset:0;display:flex;align-items:center;
    padding:0 76px;gap:40px;isolation:isolate}
  .glow{position:absolute;width:760px;height:760px;right:-230px;top:-300px;
    border-radius:50%;background:${t.primary};opacity:0.13;filter:blur(150px);z-index:-2}
  .glow2{position:absolute;width:520px;height:520px;left:-220px;bottom:-280px;
    border-radius:50%;background:${t.primary};opacity:0.06;filter:blur(140px);z-index:-2}
  .grid{position:absolute;inset:0;z-index:-1;opacity:0.4;
    background-image:linear-gradient(oklch(1 0 0/0.028) 1px,transparent 1px),
                     linear-gradient(90deg,oklch(1 0 0/0.028) 1px,transparent 1px);
    background-size:60px 60px;
    mask-image:radial-gradient(ellipse 90% 80% at 50% 50%,#000 40%,transparent 100%)}
  .rule{position:absolute;left:0;right:0;bottom:0;height:5px;
    background:linear-gradient(90deg,${t.primary} 0%,${t.primary} 26%,
      oklch(1 0 0/0.07) 26%,oklch(1 0 0/0.07) 100%)}
  .left{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center}
  .eyebrow{font-family:${t.fontMono};font-size:22px;letter-spacing:0.07em;
    text-transform:uppercase;color:${t.muted};margin-bottom:30px;
    display:flex;align-items:center;gap:13px}
  .eyebrow::before{content:'';width:9px;height:9px;border-radius:50%;flex:none;
    background:${t.primary};box-shadow:0 0 14px 2px ${t.primary}66}
  /* Titles vary in length; balance the wrap and never hyphen-split a word. */
  h1{font-family:${t.fontDisplay};font-weight:500;font-size:var(--title-size);
    line-height:1.0;letter-spacing:-0.024em;text-wrap:balance;hyphens:none}
  /* Clamped so every card in a set occupies the same vertical box. */
  .desc{font-size:27px;line-height:1.42;color:color-mix(in oklch,${t.foreground} 74%,transparent);
    margin-top:24px;max-width:26ch;
    display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
  .art{flex:0 0 380px;height:380px;display:grid;place-items:center}
  .sig{position:absolute;right:74px;bottom:44px;font-family:${t.fontMono};font-size:19px;
    letter-spacing:0.12em;text-transform:uppercase;
    color:color-mix(in oklch,${t.muted} 80%,transparent)}
`;

/**
 * Wraps a body fragment in the shared frame. `extraCss` is where a card family
 * adds its own layout — keep it to layout, so the palette and type scale stay
 * defined in exactly one place.
 */
export const cardDocument = (body: string, extraCss = '', theme: Theme = THEME): string =>
  `<!doctype html><html><head><meta charset="utf-8">
${theme.fontsHref ? `<link rel="stylesheet" href="${theme.fontsHref}">` : ''}
<style>${frameCss(theme)}${extraCss}</style></head><body>
<div class="glow"></div><div class="glow2"></div><div class="grid"></div>
${body}
<div class="rule"></div>
</body></html>`;

export type CardJob = {
  /** Output filename stem — written as `<slug>.png`. */
  readonly slug: string;
  readonly html: string;
};

export type RenderOptions = {
  /**
   * Device pixel ratio. Use 1 for images served raw (Open Graph files fetched
   * straight off disk should be exactly their canonical size). Use 2 for art the
   * site displays, so it holds up on retina screens.
   */
  readonly scale?: number;
  /**
   * Quantize the PNG. A dark card with flat type compresses several times
   * smaller with no visible loss. Leave off for source art the project's own
   * image pipeline will re-encode, where the source should stay pristine.
   */
  readonly optimize?: boolean;
};

/** Escape text taken from project data before interpolating it into card HTML. */
export const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Step the title size down by length instead of letting a long one wrap to a
 * third line and shove the rest of the card around. Tune the thresholds to the
 * real titles in the project.
 */
export const titleSize = (title: string): string => (title.length <= 18 ? '78px' : title.length <= 26 ? '68px' : '60px');

/** Reads a local image into a data URI, since a string-rendered page has no base URL. */
export const imageDataUri = async (file: string): Promise<string> => {
  const buffer = await fs.promises.readFile(file);
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${buffer.toString('base64')}`;
};

/**
 * Renders every job into `outDir`.
 *
 * The `document.fonts.ready` await is load-bearing: without it the screenshot
 * can land before the webfonts swap in, and the display face silently falls back
 * to a system serif. That failure is easy to miss because the card still looks
 * plausible — just generic.
 */
export const renderCards = async (jobs: readonly CardJob[], outDir: string, options: RenderOptions = {}): Promise<void> => {
  const { scale = 2, optimize = false } = options;
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: CARD_WIDTH, height: CARD_HEIGHT },
    deviceScaleFactor: scale,
  });

  for (const job of jobs) {
    await page.setContent(job.html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);

    const target = path.join(outDir, `${job.slug}.png`);
    const shot = await page.screenshot({ type: 'png' });

    if (optimize) await sharp(shot).png({ palette: true, quality: 90, effort: 8 }).toFile(target);
    else fs.writeFileSync(target, shot);

    console.log(`wrote ${path.relative(process.cwd(), target)}`);
  }

  await browser.close();
};

/**
 * Check anything external up front and exit with the fix. Emitting a directory
 * of blank cards because a dev server was down is a much worse outcome than
 * refusing to start.
 */
export const assertReachable = async (url: string, hint: string): Promise<void> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error(`\nCannot reach ${url} (${(error as Error).message}).`);
    console.error(`${hint}\n`);
    process.exit(1);
  }
};
