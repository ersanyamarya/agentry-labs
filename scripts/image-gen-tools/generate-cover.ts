// Generates the README cover (.github/assets/cover.jpg) from the repo's own contents,
// so a newly added skill, agent, or guidance file shows up on the next run.
// Run: cd scripts/image-gen-tools && bun run cover
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cardDocument, escapeHtml, renderCards } from './lib/card-renderer.ts';

const ROOT = path.resolve(import.meta.dir, '../..');
const OUT_DIR = path.join(ROOT, '.github/assets');

const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').split('\n');
// Title is the first "# " heading; tagline is the first plain paragraph after it (not a heading or image).
const titleAt = readme.findIndex((l) => l.startsWith('# '));
const title = readme[titleAt]?.slice(2).trim();
const tagline = readme.slice(titleAt + 1).find((l) => l.trim() && !/^(#|!\[|<)/.test(l.trim()))?.trim();
if (!title || !tagline) {
  console.error('README.md needs a "# Title" line followed by a tagline paragraph.');
  process.exit(1);
}

const entries = (dir: string, keep: (name: string) => boolean) =>
  fs.existsSync(path.join(ROOT, dir)) ? fs.readdirSync(path.join(ROOT, dir)).filter((n) => !n.startsWith('.') && keep(n)).sort() : [];
const skills = entries('skills', (n) => fs.existsSync(path.join(ROOT, 'skills', n, 'SKILL.md')));
const agents = entries('agents', (n) => n.endsWith('.agent.md'));
const guidance = entries('claude-md-files', (n) => n.endsWith('.md'));
const rules = entries('rules', (n) => n !== 'README.md');

const repo = fs.readFileSync(path.join(ROOT, '.git/config'), 'utf8').match(/url = .*github\.com[:/](.+?)(?:\.git)?\s/)?.[1] ?? '';
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const counts = [plural(skills.length, 'skill'), plural(agents.length, 'agent'), plural(guidance.length, 'guidance file'), rules.length ? plural(rules.length, 'rule') : '']
  .filter(Boolean)
  .join(' · ');

const MAX_LISTED = 7;
const listed = skills.slice(0, MAX_LISTED).map((s) => `<li><span class="dir">skills/</span>${escapeHtml(s)}</li>`).join('');
const more = skills.length > MAX_LISTED ? `<li class="more">+ ${skills.length - MAX_LISTED} more</li>` : '';

const body = `
<div class="frame">
  <div class="left">
    <div class="eyebrow">Claude Code · Copilot · Cursor</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="desc">${escapeHtml(tagline)}</p>
    <p class="counts">${escapeHtml(counts)}</p>
  </div>
  <div class="term">
    <div class="bar"><i></i><i></i><i></i><span>install.sh</span></div>
    <div class="screen">
      <p class="cmd"><b>$</b> ls -d skills/*</p>
      <ul>${listed}${more}</ul>
      <p class="cmd"><b>$</b> curl -sSL …/install.sh | bash<span class="cursor"></span></p>
    </div>
  </div>
</div>
<div class="sig">${escapeHtml(repo)}</div>`;

const css = `
  .frame{padding:0 72px;gap:48px}
  h1{font-weight:700;font-size:74px;letter-spacing:-0.04em;line-height:1.02}
  .desc{max-width:none;font-size:27px;margin-top:22px}
  .counts{margin-top:28px;font-family:${'var(--mono)'};font-size:21px;color:oklch(0.8 0.19 150);letter-spacing:0.02em}
  :root{--mono:'JetBrains Mono',ui-monospace,monospace}
  .term{flex:0 0 520px;border-radius:14px;overflow:hidden;background:oklch(0.12 0.012 160 / 0.92);
    border:1px solid oklch(1 0 0 / 0.1);box-shadow:0 40px 90px -30px #000,0 0 0 1px oklch(0.8 0.19 150 / 0.08);
    font-family:var(--mono)}
  .bar{display:flex;align-items:center;gap:8px;height:40px;padding:0 16px;background:oklch(0.19 0.014 160);
    border-bottom:1px solid oklch(1 0 0 / 0.07);color:oklch(0.66 0.03 155);font-size:15px}
  .bar i{width:12px;height:12px;border-radius:50%;background:oklch(0.35 0.02 160)}
  .bar i:first-child{background:oklch(0.8 0.19 150 / 0.85)}
  .bar span{margin-left:auto}
  .screen{padding:24px 26px 26px;font-size:20px;line-height:1.55;color:oklch(0.9 0.02 150)}
  .cmd{color:oklch(0.96 0.01 150)} .cmd b{color:oklch(0.8 0.19 150);font-weight:600;margin-right:10px}
  ul{list-style:none;margin:6px 0 18px;padding-left:22px}
  li{white-space:nowrap} .dir{color:oklch(0.55 0.03 155)} .more{color:oklch(0.66 0.03 155)}
  .cursor{display:inline-block;width:11px;height:22px;margin-left:8px;vertical-align:-4px;background:oklch(0.8 0.19 150)}
`;

await renderCards([{ slug: 'cover', html: cardDocument(body, css) }], OUT_DIR, { scale: 1, format: 'jpeg' });
console.log(`cover: ${title}, ${counts}, repo ${repo || '(no GitHub remote found)'}`);
