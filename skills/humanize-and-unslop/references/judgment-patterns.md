# Judgment patterns

`scripts/scan.mjs` catches word lists, punctuation, and fixed phrases. These patterns need a reader, so check them by hand.

## Structure and formatting

- **Title Case headings.** "Origins Of A Legend" becomes "Origins of a legend." Proper nouns keep their capitals.
- **Colon lead-ins.** "The result: a faster app" becomes "The app got faster." Colons only introduce lists or examples.
- **Bold-label bullets.** "**Wisdom:** Merlin's wisdom helped..." Drop the label when the line restates it, or drop the list when it restates the paragraph above.
- **Binary contrasts in any wording.** "X isn't just A. It's B.", "not merely A, but B", "more than just A". State B.

## Content and framing

- **Puffery the scan missed.** Any sentence that asserts importance instead of showing it. State the fact and let the reader judge.
- **Superficial -ing tails.** "..., highlighting the need for change." Delete the tail, or replace it with the actual evidence.
- **Faux-insight setups.** Any sentence that promises a reveal ("The real problem is...") before making the point. Make the point.
- **Forced rule of three.** Three adjectives, three bullets, three examples when the content has two or four. Use the natural number.
- **False ranges.** "From startups to enterprises" where the two ends are not a real scale. Name who it is for.
- **Weasel attribution.** Unnamed experts, studies, or "many people". Name the source or cut the claim.

## Style and syntax

- **Synonym cycling.** Protagonist, main character, hero in one paragraph. Pick one word and repeat it.
- **Passive voice hiding the actor.** "Queries are validated" becomes "The compiler validates queries." Keep passive when the actor is unknown or irrelevant.
- **Adverb-propped claims.** "Significantly improves" becomes the measured delta. With no number available, cut the adverb.
- **Uniform rhythm.** Every sentence the same length and shape. Break one long sentence into two, or merge two short ones.
- **Bolding slop.** Bold on every proper noun or on labels that restate the line.

## Adding soul (register permitting)

Apply only when the draft is personal or opinion writing: blog posts, essays, newsletters, social posts, talks. Skip for docs, specs, reports, READMEs, and anything third-person.

- **React to facts.** Replace a neutral pros-and-cons list with the author's actual view, if the draft already implies one. Never invent an opinion.
- **Be specific.** "Agents churning away at 3am" beats "This is concerning."
- **Admit complexity.** "Impressive but also kind of unsettling" beats "impressive."
- **Allow some mess.** Perfectly symmetrical sections look machine-made.
- **First person.** "I" or "we" is fine when the author is already speaking as themselves.

## Self-check question

After the scan passes, reread once and ask what still reads as generated. Usually it is rhythm, a forced triad, or an ending that summarizes instead of stopping.
