---
name: lighthouse-audit
description: Run Google Lighthouse against a URL (mobile and desktop), trace the performance, accessibility, SEO, and best-practices findings to the project's actual source, and write a prioritized fix plan. Works for any web stack. Use when the user asks to "run a lighthouse audit", "check performance", "audit accessibility/SEO", wants Core Web Vitals (LCP, CLS, TBT, FCP), mentions a slow page load, or asks "why is my site slow / scoring badly". Also use when the user provides existing Lighthouse JSON reports; skip straight to summarizing them.
argument-hint: "[url-or-report-paths]"
---

# Lighthouse audit

Run Lighthouse, condense the reports with `scripts/summarize-report.mjs`, diagnose each finding against this repo's source, and write a fix plan the user can act on now or hand off later.

1. **Resolve the target**
   - Use existing report files when the user provides them, and skip to step 3.
   - Ask for the URL when none is given. Suggest the production URL if one is obvious (deploy config such as `vercel.json`, `netlify.toml`, `fly.toml`, or `package.json` `homepage`).
   - For a local target, prefer a production build (`build` then `start`/`preview` from `package.json` scripts). Warn that a dev server serves unminified code and skews performance numbers.

2. **Run both audits**
   - Check `command -v lighthouse`. If missing, ask before running `npx -y lighthouse`, since it downloads the package. Lighthouse also needs a local Chrome or Chromium.
   - Check the URL responds: `curl -sSIL -o /dev/null -w '%{http_code}' <URL>`. Stop and report anything other than 2xx.
   - Write reports outside the repo so the large JSON files never get committed:
     ```bash
     out="${TMPDIR:-/tmp}/lighthouse-audit"; mkdir -p "$out"
     cats=performance,accessibility,best-practices,seo,agentic-browsing
     lighthouse <URL> --quiet --chrome-flags="--headless=new" --output=json --output-path="$out/mobile.json" --form-factor=mobile --only-categories=$cats
     lighthouse <URL> --quiet --chrome-flags="--headless=new" --output=json --output-path="$out/desktop.json" --preset=desktop --only-categories=$cats
     ```
   - Always run both. Mobile runs are throttled, so a large mobile/desktop gap points at work that is cheap on a fast CPU but slow on a phone (image decode, heavy fonts, JS execution). Drop `agentic-browsing` from the list if an older Lighthouse rejects it.

3. **Summarize, never read raw**
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/summarize-report.mjs "$out/mobile.json" "$out/desktop.json"`. It prints the score and metric tables for the plan (with Lighthouse's own good / needs work / poor rating), merged opportunities with the metric each one saves on, and failing audits. Ratings follow Lighthouse's scoring curve for each form factor, which is stricter on desktop than the Core Web Vitals thresholds.
   - Pick the report where the worst metric lives (usually mobile LCP or TBT) and execute `node ${CLAUDE_SKILL_DIR}/scripts/summarize-report.mjs "$out/mobile.json" --full`. It adds the LCP element and phase breakdown, CLS culprits, render-blocking requests, the longest request chain, unused JS per file, and console errors, each capped at 10 items (`--limit N` to change).
   - For a field the script omits, query one audit: `node -e "const r=require(process.argv[1]); console.log(JSON.stringify(r.audits[process.argv[2]], null, 2))" "$out/mobile.json" <audit-id>`. Audit ids change between Lighthouse versions, so list them with `node -e "console.log(Object.keys(require(process.argv[1]).audits).join('\n'))" "$out/mobile.json"` and search for the concept before concluding data is missing.

4. **Diagnose against the source**
   - Read `references/framework-hints.md` for where each finding type usually traces to in the detected stack.
   - Find the real cause in source for every finding worth fixing, and cite `path/to/file:line`. State plainly when a cause cannot be pinned down instead of guessing.
   - Mark deliberate tradeoffs (analytics, consent tools, third-party embeds) as "not fixing" with the reason, rather than proposing to remove them.

5. **Write the plan**
   - Read `assets/fix-plan-template.md` and write `lighthouse-fix-plan.md` at the repo root, pasting the tables from step 3 unchanged.
   - Order findings by real impact. A metric rated "poor" outranks a cosmetic accessibility nit even when both show as failing audits.

6. **Ask before fixing**
   - Ask whether to fix now or leave the plan for later. Never edit source without that answer.
   - When fixing, work in severity order and verify each change with the project's own typecheck, lint, test, and build scripts from `package.json`, then re-run step 2 and compare the tables.
