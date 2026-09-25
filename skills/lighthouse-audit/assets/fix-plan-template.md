# Lighthouse audit: <URL> (<date>)

<Paste the Scores and Core metrics tables printed by `summarize-report.mjs <mobile.json> <desktop.json>`.>

## Findings

### N. <Short imperative title>

- **Severity**: HIGH | MEDIUM | LOW (score impact and how far the metric is into "poor", not just the presence of a finding)
- **Where**: `path/to/file.tsx:123`
- **Lighthouse evidence**: <audit id and the number that flags it, e.g. "largest-contentful-paint 11.9 s (poor), lcp-breakdown render delay 9.2 s">
- **Root cause**: <what this codebase actually does, verified by reading the source>
- **Fix**: <the concrete change: file, what changes, resulting behavior>
- **Expected impact**: <rough, e.g. "removes a 2 s render delay from the LCP image">

<One finding per issue worth fixing, ordered by severity.>

## Not fixing

<False positives, accepted tradeoffs, or low-impact items, each with the reason, so nobody re-raises them next audit.>
