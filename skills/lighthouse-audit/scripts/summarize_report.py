#!/usr/bin/env python3
"""Summarize a Lighthouse JSON report without dumping the raw file into context.

Lighthouse JSON reports commonly run 10-20k lines. Reading one directly wastes
the context window. This script extracts only what's useful for triage:
category scores, the core performance metrics, failing binary audits
(accessibility/best-practices/seo issues), and the top "opportunity" audits
ranked by potential time savings.

Usage:
    python3 summarize_report.py <report.json> [--full]

--full also prints the LCP/CLS culprit elements and every diagnostic (score < 1
but not an "opportunity"), which is useful once you've picked a metric to dig
into further.
"""

import json
import sys


def load(path):
    with open(path) as f:
        return json.load(f)


def summarize(report, full=False):
    out = {}
    out["finalUrl"] = report.get("finalUrl") or report.get("finalDisplayedUrl")
    out["fetchTime"] = report.get("fetchTime")
    out["formFactor"] = report.get("configSettings", {}).get("formFactor")

    categories = report.get("categories", {})
    out["scores"] = {k: v.get("score") for k, v in categories.items()}

    audits = report.get("audits", {})

    metric_keys = [
        "first-contentful-paint",
        "largest-contentful-paint",
        "total-blocking-time",
        "cumulative-layout-shift",
        "speed-index",
        "interactive",
        "max-potential-fid",
        "server-response-time",
    ]
    out["metrics"] = {
        k: audits[k].get("displayValue")
        for k in metric_keys
        if k in audits and audits[k].get("displayValue")
    }

    opportunities = []
    for key, a in audits.items():
        details = a.get("details", {})
        if details.get("type") == "opportunity" and a.get("score") is not None and a.get("score") < 1:
            opportunities.append(
                {
                    "audit": key,
                    "title": a.get("title"),
                    "displayValue": a.get("displayValue"),
                    "savingsMs": details.get("overallSavingsMs", 0),
                }
            )
    opportunities.sort(key=lambda o: o["savingsMs"], reverse=True)
    out["opportunities"] = opportunities

    failing_diagnostics = []
    for key, a in audits.items():
        if (
            a.get("score") is not None
            and a.get("score") < 1
            and a.get("scoreDisplayMode") == "binary"
        ):
            failing_diagnostics.append({"audit": key, "title": a.get("title")})
    out["failingAudits"] = failing_diagnostics

    if full:
        # Newer Lighthouse versions (with Performance Insights) replace several
        # legacy audits with "-insight" ones. Check both so this keeps working
        # across Lighthouse versions.
        out["lcpDiscovery"] = (
            audits.get("lcp-discovery-insight", {}).get("details")
            or audits.get("largest-contentful-paint-element", {}).get("details", {})
        )
        out["lcpBreakdown"] = audits.get("lcp-breakdown-insight", {}).get("details", {})
        out["clsCulprits"] = (
            audits.get("cls-culprits-insight", {}).get("details")
            or audits.get("layout-shift-elements", {}).get("details", {})
        )
        out["renderBlocking"] = (
            audits.get("render-blocking-insight", {}).get("details")
            or audits.get("render-blocking-resources", {}).get("details", {})
        )
        out["networkDependencyTree"] = audits.get(
            "network-dependency-tree-insight", {}
        ).get("details", {})

        unused_js = audits.get("unused-javascript", {}).get("details", {})
        out["unusedJavaScript"] = unused_js.get("items", [])

        console_errors = audits.get("errors-in-console", {}).get("details", {})
        out["consoleErrors"] = console_errors.get("items", [])

        a11y_names = audits.get("label-content-name-mismatch", {}).get("details", {})
        out["accessibilityLabelIssues"] = a11y_names.get("items", [])

    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    path = sys.argv[1]
    full = "--full" in sys.argv[2:]

    report = load(path)
    summary = summarize(report, full=full)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
