---
name: humanize-and-unslop
description: Edit drafts into plain, specific, human-sounding writing by removing AI tells (banned vocabulary, em dashes, curly quotes, puffery, chatbot phrases, formulaic structures), or detect those tells without rewriting. A bundled scanner finds the mechanical tells with line numbers; the model handles judgment calls and the rewrite. Use when the user asks to "humanize this", "unslop this", "remove AI slop", "make this sound less like AI", "edit this draft", "does this sound AI-written", "check for AI tells", or passes --detect.
argument-hint: "[draft-or-file] [--detect]"
---

# Humanize and unslop

Strip AI tells from prose while keeping the author's claims and voice. The model reads and rewrites. `scripts/scan.mjs` is a precise checker for words, phrases, and punctuation, used to confirm the result is clean.

## Rules that always apply

- Keep every claim. Never change facts, numbers, severity, scope, or meaning, since this is a style edit.
- Leave code blocks, inline code, URLs, commands, and quoted material untouched. The scanner already skips them.
- Use straight quotes (`"` and `'`), never curly quotes.
- Use no em dashes and no spaced en dashes. Use a period or comma instead, not parentheses.
- Use colons only to introduce a list or example, never as a lead-in ("The result: ...").
- Use sentence case for headings. Keep emojis and decorative bold out of headings, bullets, and body text.
- Return text that is already clean unchanged.

When rules pull in different directions, apply this order: preserve meaning, then fix scan findings, then make the smallest edit that works, then add soul.

## Workflow

1. **Resolve mode and input**
   - Use Detect mode when the request says `--detect`, "audit", "check", or "flag". Otherwise use Edit mode.
   - Count words. Under about 150 words, skip the scanner in steps 2 and 5 and check by reading.
   - For longer pasted text, write it to a temp file (`${TMPDIR:-/tmp}/unslop-draft.md`) so the scanner can read it. For a file path, scan the file directly.
   - In Edit mode, ask for audience and format only when the register is unclear and a person can answer. Otherwise infer the register from the draft.

2. **Scan**
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/scan.mjs <file>`.
   - Treat `fix` findings as required changes. Treat `review` findings as terms with a possible literal or technical sense (`primitive`, `surface`, `vector`); keep them when that sense applies.

3. **Judge**
   - Read `references/judgment-patterns.md` and check the draft for everything the scan does not cover: Title Case headings, colon lead-ins, bold-label bullets, binary contrasts, forced triads, synonym cycling, passive voice hiding the actor, uniform rhythm, unsourced claims.
   - Decide the register. Apply the "adding soul" section only to personal or opinion writing, never to docs, specs, READMEs, or third-person reports.

4. **Edit (Edit mode only)**
   - Read `references/examples.md` before the first edit in a session to calibrate edit depth.
   - Rewrite to clear every `fix` finding and each confirmed judgment finding.
   - For a file input, edit the file in place. Keep the change summary in the reply, never in the file.

5. **Verify**
   - Re-run `scan.mjs` on the edited text. Repeat step 4 until zero `fix` findings remain.
   - Reread once and fix whatever still reads as generated, usually rhythm or a summary ending.

## Output

- **Edit mode:** the edited draft (or a note that the file was edited), then a `## What changed` list of 3 to 6 bullets covering structural, tonal, and wording changes. Mention any `review` findings deliberately kept, and why.
- **Detect mode:** do not rewrite. List findings as `line: [pattern] "exact quote" -> brief fix`, scan findings first, then judgment findings, then a one-line count per pattern. No paragraphs of feedback.

## Reuse

Other skills and agents that need these rules should read `references/patterns.json` and `references/judgment-patterns.md` from this skill's installed folder (in the global or the project skills directory), or run `node <that folder>/scripts/scan.mjs --json <file>`, rather than copying the word lists.
