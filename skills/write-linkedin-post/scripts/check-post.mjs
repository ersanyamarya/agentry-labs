#!/usr/bin/env node
// Checks a LinkedIn post draft against the skill's output contract: bold opener, 3 bullets,
// 2-4 inline hashtags, no em dashes, word cap, and no hashtag in the CTA or after a sentence.
// Usage: node check-post.mjs <post-file | -> [--max-words N]
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'max-words': { type: 'string', default: '250' } },
});

if (positionals.length !== 1) {
  console.error('Usage: node check-post.mjs <post-file | -> [--max-words N]');
  process.exit(2);
}

const text = fs.readFileSync(positionals[0] === '-' ? 0 : positionals[0], 'utf8');
const maxWords = Number(values['max-words']);
const lines = text.split(/\r?\n/).map((l) => l.trim());
const nonEmpty = lines.filter(Boolean);
const failures = [];
const notes = [];

const HASHTAG = /(?:^|[\s(])#([A-Za-z][\w]*)/g;
const BULLET = /^(?:[-*•]\s+)(?!\*)|^\d+[.)]\s+/;
const tagsIn = (s) => [...s.matchAll(HASHTAG)].map((m) => `#${m[1]}`);

// Opener
const opener = nonEmpty[0] ?? '';
if (!/^\*\*[^*].*\*\*$/.test(opener)) failures.push('first line is not wrapped in **bold**');

// Bullets
const bullets = nonEmpty.filter((l) => BULLET.test(l));
if (bullets.length !== 3) failures.push(`expected exactly 3 bullets, found ${bullets.length}`);

// Words (markdown markers and URLs count as one word each, which is close enough)
const words = text.replace(/[*_]/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
if (words > maxWords) failures.push(`${words} words, over the ${maxWords} cap`);

// Dashes
const emDashes = (text.match(/—/g) ?? []).length;
const spacedEnDashes = (text.match(/\s–\s/g) ?? []).length;
if (emDashes) failures.push(`${emDashes} em dash(es)`);
if (spacedEnDashes) failures.push(`${spacedEnDashes} spaced en dash(es) used as em dashes`);

// Hashtags
const allTags = nonEmpty.flatMap(tagsIn);
if (allTags.length < 2 || allTags.length > 4) failures.push(`expected 2-4 hashtags, found ${allTags.length}`);
const isTagOnly = (l) => l.replace(BULLET, '').replace(HASHTAG, '').trim() === '';
const cta = nonEmpty.findLast((l) => !isTagOnly(l)) ?? '';
if (tagsIn(cta).length) failures.push(`hashtag in the call to action: "${cta}"`);
for (const line of nonEmpty) {
  const stripped = line.replace(BULLET, '');
  if (stripped && isTagOnly(line)) failures.push(`hashtag-only line: "${line}"`);
  // A hashtag that follows the line's last sentence end is tacked on, not part of a sentence.
  const tail = stripped.match(/[.!?]["')\]]?\s+((?:#\w+\s*)+)$/);
  if (tail) failures.push(`hashtag(s) appended after a sentence: "${tail[1].trim()}"`);
  for (const sentence of stripped.split(/(?<=[.!?])\s+/)) {
    if (tagsIn(sentence).length > 1) failures.push(`more than one hashtag in: "${sentence}"`);
  }
}

// Informational
const links = text.match(/https?:\/\/\S+|\[Link\]/g) ?? [];
notes.push(`words: ${words}`, `bullets: ${bullets.length}`, `hashtags: ${allTags.join(' ') || 'none'}`);
notes.push(`link in CTA: ${links.some((l) => cta.includes(l)) ? 'yes' : 'no'}`);
if (words < 120) notes.push('below the 120-200 word target: add a concrete detail if the source has one');

console.log(JSON.stringify({ pass: failures.length === 0, failures: [...new Set(failures)].slice(0, 15), notes }, null, 2));
process.exit(failures.length ? 1 : 0);
