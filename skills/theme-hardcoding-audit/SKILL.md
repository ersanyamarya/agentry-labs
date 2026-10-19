---
name: theme-hardcoding-audit
description: "Audit the app for hardcoded theme values, local styling drift, and visual inconsistencies. Use when scanning for colors, sizes, radii, text styles, or component styling that should live in the central theme instead of widgets."
user-invocable: true
---

# Theme Hardcoding Audit

## When to Use

- Before a visual cleanup pass
- After adding widgets or pages with custom styling
- When a screen feels inconsistent with the central theme
- When you want to find hardcoded colors, spacing, radii, typography, borders, or local overrides

## Goal

Produce a clear audit report that:

1. Finds likely hardcoded theme-related values in the codebase.
2. Distinguishes between values that should be moved to the central theme and values that are legitimate local exceptions.
3. Asks the user for approval before implementing any fixes.

## Audit Procedure

1. **Inspect the theme source of truth**
   - Review [lib/core/theme/app_theme.dart](../../../lib/core/theme/app_theme.dart) first.
   - Check whether the app already has theme tokens for colors, radii, spacing, typography, and component sub-themes.
   - Prefer `Theme.of(context).colorScheme`, `Theme.of(context).textTheme`, and `context.brandTheme` for styling decisions.

2. **Scan for hardcoded styling patterns**
   - Colors: raw colors, hex values, `Color(...)`, `Colors.*`, `AppTheme.*` references inside widgets.
   - Sizes and spacing: literal `padding`, `margin`, `SizedBox`, `gap`, `height`, `width`, `fontSize`, `iconSize`, `borderWidth`, and other hardcoded dimensions.
   - Radii: `BorderRadius.circular(...)` or any literal radius values that should come from `context.brandTheme`.
   - Typography: local `TextStyle` overrides, `fontSize`, `fontWeight`, `letterSpacing`, `color`, or manual code-style treatments that should use the shared typography system.
   - Decorations: `BoxDecoration`, `InputDecoration`, `OutlineInputBorder`, `ElevatedButtonTheme`, card borders, shadows, and container styling that bypass the theme.
   - Local style drift: cases where a widget duplicates a reusable visual pattern instead of using the shared card/button/input theme.

3. **Classify findings**
   - Label each issue as one of:
     - `theme-token` — should be moved to the central theme or shared component theme.
     - `local-exception` — may be intentionally local and should be reviewed manually.
     - `design-choice` — a deliberate style that is acceptable but worth documenting.
   - Include a short reason for each item.

4. **Report findings by file**
   - Group issues by file.
   - For each file, list:
     - the exact location or widget involved,
     - the pattern found,
     - the recommended fix,
     - whether it is a high-confidence or low-confidence issue.
   - Keep the report concise and actionable.

5. **Ask for approval before implementation**
   - Present the audit report to the user.
   - Ask whether they want the recommended changes applied.
   - If the answer is no, stop after the report.
   - If the answer is yes, implement the changes conservatively and keep the app visually aligned with the existing theme.

## Implementation Rules

When applying fixes:

- Prefer `Theme.of(context).colorScheme` or `context.brandTheme` over hardcoded values.
- Use `context.brandTheme.radiusSmall/Medium/Large/XLarge/Pill` for rounded corners.
- Use `Theme.of(context).textTheme` or the existing typography extensions instead of local `TextStyle` overrides.
- Keep local styling only when it is truly component-specific and not part of the shared design language.
- Preserve the current product voice and avoid over-styling.

## Completion Checks

The task is complete only when:

- A report has been produced for the scanned files.
- The user has approved any implementation step.
- Any applied changes still pass the project quality gate.

## Suggested Prompt Examples

- "Audit the app for hardcoded theme values and produce a report."
- "Scan the recent widget changes for styling that should live in the theme."
- "Find any local colors, radii, typography overrides, or spacing that drift from the central theme."
