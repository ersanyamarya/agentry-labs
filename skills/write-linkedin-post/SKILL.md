---
name: write-linkedin-post
description: "Write one concise, high-impact LinkedIn post about anything: a launch, release, article, lesson learned, milestone, or opinion. Bold opener, short paragraphs, exactly three bullets, inline hashtags, a direct call to action, and a human-editing pass, checked by a script. Use when the user asks to \"write a LinkedIn post\", \"announce this on LinkedIn\", \"turn this into a LinkedIn post\", \"promote this release\", or share a blog post, tool, or idea on LinkedIn."
argument-hint: "[topic, notes, file, or URL to post about]"
---

# Write a LinkedIn post

Turn any topic into one ready-to-publish LinkedIn post that names a problem the reader recognizes and why the subject matters. `scripts/check-post.mjs` checks the format rules; the model owns the story and the voice.

1. **Gather the substance**
   - Collect what the post is about from the arguments, attached files, linked pages, or the current repo (README, changelog, release notes, the article itself). Read the source rather than guessing.
   - Pin down four facts: the subject (name or title), what it does or says in one sentence, the post type (step 2), and a URL if one exists.
   - Only the subject and its one-sentence substance are required. When either is missing and cannot be inferred, ask once for exactly that. A missing URL is never a reason to stop.

2. **Pick the post type and angle**

   | Type | Sell |
   | --- | --- |
   | Launch or release (tool, product, feature, skill) | The task it improves and how using it feels |
   | Article or blog post | The core insight and what the reader will understand or do differently |
   | Lesson or insight | The mistake or friction, and the takeaway the reader can reuse |
   | Milestone | What it took and what it changes next, without bragging |
   | Opinion | The claim, the evidence for it, and where the reader might push back |

   When the type is ambiguous, treat it as an article. Add privacy, security, or performance claims only when the source verifies them.

3. **Find the sharpest reader benefit** (internal, not in the output)
   - **Villain**: the frustration, waste, risk, or limit the reader already feels.
   - **Hero**: the subject and the practical change it offers.
   - **Outcome**: what becomes easier, clearer, faster, safer, or more useful.

4. **Draft**
   - Read `references/voice-rules.md` before writing.
   - Use this shape, with a blank line between parts for mobile reading:
     1. One opening line wrapped in `**bold Markdown**` that names the problem or declares the change.
     2. One or two short paragraphs (two or three sentences each) contrasting the old friction with the new.
     3. Exactly three minimalist bullets.
     4. One direct call to action: the real URL when there is one, `[Link]` only when the user asks for a placeholder, otherwise an invitation to reply or share their take.
   - Aim for 120 to 200 words, never over 250. Never pad: a detail earns its place only if the source supports it.
   - Work in two to four hashtags as grammatical words inside body sentences or bullets, never in the call to action.

5. **Run the human-editing pass**
   - If the `humanize-and-unslop` skill is available, apply it to the draft as the final quality gate, and return only the edited post, not its editing report.
   - Otherwise apply the "Cut on sight" list in `references/voice-rules.md` line by line.

6. **Check and deliver**
   - Write the post to `${TMPDIR:-/tmp}/linkedin-post.md` and execute `node ${CLAUDE_SKILL_DIR}/scripts/check-post.mjs ${TMPDIR:-/tmp}/linkedin-post.md`.
   - Fix every item in `failures` and re-run until `pass` is true. Treat `notes` as hints, not failures. The script cannot judge whether a hashtag reads as a natural word; reread each one.
   - Return only the post. Add no title, commentary, or "what changed" section unless the user asks.
