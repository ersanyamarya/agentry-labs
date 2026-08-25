# Live-App Capture Pitfalls

Read this before screenshotting a running app. Every item here fails _silently_ — the script exits 0 and writes plausible-looking images that are wrong. They're ordered by how likely you are to hit them.

## Contents

- [1. networkidle never settles](#1-networkidle-never-settles)
- [2. Dev-server overlays swallow clicks](#2-dev-server-overlays-swallow-clicks)
- [3. Consent banners cover the screenshot](#3-consent-banners-cover-the-screenshot)
- [4. Hiding chrome clamps the scroll](#4-hiding-chrome-clamps-the-scroll)
- [5. getByRole finds nothing](#5-getbyrole-finds-nothing)
- [6. Inline vs replaced results](#6-inline-vs-replaced-results)
- [7. Fonts not loaded yet](#7-fonts-not-loaded-yet)
- [Driving forms into a useful state](#driving-forms-into-a-useful-state)
- [A capture skeleton](#a-capture-skeleton)

## 1. networkidle never settles

Dev servers hold a websocket open for HMR, so `waitUntil: 'networkidle'` times out on every navigation.

```ts
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('main, form', { timeout: 20000 });
await page.waitForTimeout(1500); // let hydration settle
```

## 2. Dev-server overlays swallow clicks

Framework HMR indicators render above the page and intercept pointer events, so clicks fail with `<element> intercepts pointer events`. They appear _after a recompile_, which makes this intermittent — it passes locally and fails in a batch run.

Kill them with a stylesheet rather than removing the node, so it stays gone if re-added:

```ts
await page.addStyleTag({
  content: `
    gatsby-fast-refresh, #gatsby-fast-refresh,
    nextjs-portal, #__next-build-watcher,
    vite-error-overlay, #vite-error-overlay,
    #nuxt-devtools-anchor, .astro-dev-toolbar, astro-dev-toolbar
    { display: none !important; pointer-events: none !important; }
  `,
});
```

Better still, disable the toolbar in config for the capture run where the framework allows it (Astro's `devToolbar: { enabled: false }`).

## 3. Consent banners cover the screenshot

A cookie/consent dialog will sit over the app in every shot. Find the gate — usually a `localStorage` key — and pre-set it with an init script so the banner never renders:

```ts
await context.addInitScript(() => localStorage.setItem('cookie-consent', 'rejected'));
```

Grep for the key: `grep -rn "localStorage" src/ | grep -i "consent\|cookie\|gdpr"`.

Choose the **privacy-preserving** value (`rejected` / `declined`). It suppresses the banner just as well and doesn't switch on analytics during the run.

## 4. Hiding chrome clamps the scroll

Hiding the site header/nav/footer is right — they're not the app. But hiding a `footer` shortens the document, and if you do that _after_ scrolling to something further down, the browser clamps the scroll position back up. The screenshot then shows the top of the page again.

This is insidious because the resulting image looks fine in isolation; you only notice when two panels in the same card are identical.

**Strip chrome exactly once, right after load, and never again before a shot.**

```ts
const stripChrome = async (page: Page) => {
  await page.evaluate(() => {
    document.querySelectorAll('header, nav, footer').forEach(el => ((el as HTMLElement).style.display = 'none'));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
};
```

Note `header`, not just `nav` — a floating navbar pill is often a `<header>`, and a `nav`-only selector leaves it in frame.

## 5. getByRole finds nothing

`getByRole('button', { name })` queries the _accessibility tree_. If any ancestor carries `aria-hidden="true"` — which UI kits do to decorative wrappers, and which is easy to do by accident — the element is absent from that tree. `querySelectorAll` finds it, it's visibly on screen, it's clickable by a human, and the locator reports **0 matches**.

Diagnose:

```ts
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Label/i.test(x.textContent || ''));
  const chain: string[] = [];
  for (let el = b as HTMLElement | null; el; el = el.parentElement) if (el.getAttribute('aria-hidden') || el.hasAttribute('inert')) chain.push(el.tagName);
  return chain;
});
```

Fix by matching on text instead:

```ts
page.locator('button').filter({ hasText: label }).first();
```

Prefer role-based locators generally — they're more robust — but fall back to text when the a11y tree excludes the target. (Worth mentioning to the user: an `aria-hidden` wrapper around interactive controls is a real accessibility bug in their app, not just an automation obstacle.)

## 6. Inline vs replaced results

Some tools swap the form out for a results view; others append results below a form that stays put. "Did the submit button disappear?" only detects the first kind, and treating the second as a failure loses the interesting screenshot.

```ts
type Outcome = 'replaced' | 'inline' | null;

const submitAndWait = async (page: Page): Promise<Outcome> => {
  const submit = page.locator('button[type=submit]').first();
  if ((await submit.count()) === 0) return null;
  await submit.click({ timeout: 10000 });

  try {
    await page.waitForFunction(() => !document.querySelector('button[type=submit]'), null, { timeout: 6000 });
    await page.waitForTimeout(1200);
    return 'replaced';
  } catch {
    // `.last()` picks the deepest match; `.first()` resolves to an outer wrapper
    // near the top of the page, so scrolling to it barely moves.
    const marker = page
      .getByText(/Generated|Result|Output|Preview/i)
      .filter({ visible: true })
      .last();
    try {
      await marker.waitFor({ state: 'visible', timeout: 4000 });
      await marker.evaluate(el => el.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(900);
      return 'inline';
    } catch {
      return null;
    }
  }
};
```

When the outcome is `null`, fall back to a single-panel card and **log which routes degraded**. A quiet fallback that duplicates the form is worse than an obvious gap.

## 7. Fonts not loaded yet

Applies to the composed card too, not just captures:

```ts
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
```

Without it the serif silently falls back to Georgia and the card looks subtly generic. If you manually reassign `img.src` or `loading` attributes, the framework's own `onLoad` handler may have already fired, leaving images stuck at `opacity: 0` — avoid touching them, or force `opacity: 1` yourself.

## Driving forms into a useful state

An empty form is a weak screenshot. Getting a filled one means a small recipe per route — keep them in one `recipes.ts` keyed by route:

```ts
export const RECIPES: Record<string, (page: Page) => Promise<void>> = {
  'some-tool': page => page.locator('button').filter({ hasText: 'Try an example' }).first().click({ timeout: 6000 }),
  'other-tool': async page => {
    await page.getByPlaceholder('Project name', { exact: true }).filter({ visible: true }).first().fill('Analytics Dashboard');
  },
  'defaults-are-fine': async () => {},
};
```

Guidance that saves time:

- **Look for the app's own "try an example" affordance first.** One click, it's the path a real user takes, and it can't produce invalid data.
- **Read the validation schema** to learn the required fields and their minimum lengths, rather than discovering them by failed submits.
- **Probe for real selectors once** instead of guessing repeatedly. A script that visits every route and dumps every button label, placeholder, and prefilled value pays for itself immediately.
- **Use `getByPlaceholder`, not a hand-built selector.** Placeholders frequently contain quotes (`e.g., "User Auth System"`), which makes an interpolated `[placeholder="..."]` an invalid selector and throws a confusing `SyntaxError`.
- **Add `{ visible: true }`** when fields live in tab panels, so you don't target a hidden duplicate.
- **Use short timeouts (~6s)** so a stale selector fails fast instead of stalling a 14-route run by minutes.
- **Wrap each recipe in try/catch**, warn, and continue. One broken recipe shouldn't cost the whole batch.

## A capture skeleton

```ts
export const captureRoute = async (browser: Browser, slug: string): Promise<Shots> => {
  const context = await browser.newContext({
    viewport: { width: 1240, height: 880 },
    deviceScaleFactor: 2,
    colorScheme: 'dark', // match the theme the cards are designed against
  });
  await context.addInitScript(() => localStorage.setItem('cookie-consent', 'rejected'));

  const page = await context.newPage();
  try {
    await page.goto(`${DEV_SERVER}/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('main, form', { timeout: 20000 });
    await page.addStyleTag({ content: DEV_OVERLAY_CSS });
    await page.waitForTimeout(1500);
    await stripChrome(page); // once, and only here

    const prepare = RECIPES[slug];
    if (prepare) {
      try {
        await prepare(page);
        await page.waitForTimeout(900);
      } catch (e) {
        console.warn(`  ! ${slug}: recipe failed (${(e as Error).message.split('\n')[0]}) — capturing as-is`);
      }
    }

    const form = await shoot(page);
    const outcome = await submitAndWait(page);
    return { form, results: outcome ? await shoot(page) : null };
  } finally {
    await context.close();
  }
};
```

Use a fresh `context` per route so `localStorage` and scroll state can't leak between captures.
