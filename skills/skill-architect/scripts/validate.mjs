#!/usr/bin/env node
// Checks a skill folder against references/agentskills-spec.md rules that code can verify exactly.
// Judgment calls (project-specific leftovers, script vs model split) stay with the model.
// Usage: node validate.mjs <skill-dir> [<skill-dir> ...]   Exit 1 when any FAIL is found.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error('Usage: node validate.mjs <skill-dir> [<skill-dir> ...]');
  process.exit(1);
}

const listFiles = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile() && !f.endsWith('.DS_Store'))
    : [];

const frontmatter = (text) => {
  const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const field = (key) => block.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1].trim().replace(/^"(.*)"$/, '$1');
  return { name: field('name'), description: field('description'), argumentHint: field('argument-hint') };
};

const validate = (dir) => {
  const results = [];
  const report = (level, message) => results.push({ level, message });
  const folder = path.basename(path.resolve(dir));
  const skillFile = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return [{ level: 'FAIL', message: 'SKILL.md is missing' }];

  const text = fs.readFileSync(skillFile, 'utf8');
  const prose = text.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');
  const { name, description, argumentHint } = frontmatter(text);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folder)) report('FAIL', `folder "${folder}" is not kebab-case`);
  if (name !== folder) report('FAIL', `frontmatter name "${name}" does not match folder "${folder}"`);
  if (!description) report('FAIL', 'frontmatter description is missing');
  else {
    if (description.length > 1024) report('FAIL', `description is ${description.length} chars (max 1024)`);
    if (!/\buse (this )?(when|whenever|before|after|for)\b|\bwhen the user\b/i.test(description)) report('WARN', 'description has no "Use when ..." trigger phrases');
  }
  if (!argumentHint) report('WARN', 'frontmatter argument-hint is missing');

  // Text left over from assets/SKILL.md.template means the skill was never filled in.
  const placeholders = text.match(/\[(?:skill-name-kebab-case|expected-input|script-name|filename|What it does|One or two sentences|Skill title|Check or resolve|Run the deterministic|Apply judgment|Verify and report)[^\]]*\]/g);
  if (placeholders) report('FAIL', `unfilled template placeholder(s): ${[...new Set(placeholders)].slice(0, 3).join(', ')}`);
  if (fs.existsSync(path.join(dir, 'README.md'))) report('FAIL', 'README.md found; put instructions in SKILL.md');

  const lines = text.split('\n').length;
  if (lines > 150) report('WARN', `SKILL.md is ${lines} lines; move static content to references/ or assets/`);

  const secondPerson = prose.split('\n').filter((l) => /\b(you|your|you're|you'll)\b/i.test(l)).length;
  if (secondPerson) report('WARN', `${secondPerson} line(s) use second person; write imperative steps`);

  if (/\.claude\/skills\/[a-z0-9-]+\//.test(text)) report('FAIL', 'hardcoded .claude/skills/<name>/ path breaks global installs; use ${CLAUDE_SKILL_DIR}');
  for (const m of text.matchAll(/(?:node|python3?|bash|sh)\s+(scripts\/[\w./-]+)/g)) {
    report('WARN', `"${m[0]}" runs relative to the cwd; use \${CLAUDE_SKILL_DIR}/${m[1]}`);
  }

  // Every referenced bundled file must exist; every bundled file should be referenced.
  // A bare path like scripts/foo.ts may describe the target project, so only ${CLAUDE_SKILL_DIR}/ paths FAIL.
  const bundled = ['scripts', 'references', 'assets'].flatMap((sub) => listFiles(path.join(dir, sub)).map((f) => `${sub}/${f}`));
  const refs = [...text.matchAll(/(\$\{CLAUDE_SKILL_DIR\}\/)?\b((?:scripts|references|assets)\/[\w./-]+\.\w+)/g)];
  const referenced = new Set(refs.map((m) => m[2]));
  const explicit = new Set(refs.filter((m) => m[1]).map((m) => m[2]));
  for (const ref of referenced) {
    if (fs.existsSync(path.join(dir, ref))) continue;
    if (explicit.has(ref)) report('FAIL', `SKILL.md runs \${CLAUDE_SKILL_DIR}/${ref}, which does not exist`);
    else report('WARN', `${ref} is not in the skill (fine if it names a file in the target project)`);
  }
  for (const file of bundled) if (!referenced.has(file)) report('WARN', `${file} is never referenced in SKILL.md`);

  for (const file of bundled.filter((f) => f.startsWith('scripts/'))) {
    if (file.endsWith('.mjs')) {
      try {
        execFileSync(process.execPath, ['--check', path.join(dir, file)], { stdio: 'pipe' });
      } catch (error) {
        report('FAIL', `${file} has a syntax error: ${error.stderr.toString().split('\n').find(Boolean)}`);
      }
    } else if (!file.endsWith('.sh')) {
      report('WARN', `${file} is not .mjs or .sh; the repo convention is Node .mjs scripts`);
    }
  }

  const evals = path.join(dir, 'evals', 'evals.json');
  if (!fs.existsSync(evals)) report('WARN', 'no evals/evals.json; add 2-4 test prompts with expected behavior');
  else {
    try {
      const count = JSON.parse(fs.readFileSync(evals, 'utf8')).evals?.length ?? 0;
      if (!count) report('WARN', 'evals/evals.json has no evals');
    } catch (error) {
      report('FAIL', `evals/evals.json is not valid JSON: ${error.message}`);
    }
  }
  return results;
};

let failed = false;
for (const dir of dirs) {
  const results = validate(dir);
  const fails = results.filter((r) => r.level === 'FAIL').length;
  failed ||= fails > 0;
  console.log(`${path.basename(path.resolve(dir))}: ${fails ? 'FAIL' : 'PASS'} (${fails} fail, ${results.length - fails} warn)`);
  for (const r of results) console.log(`  ${r.level.padEnd(4)} ${r.message}`);
}
process.exit(failed ? 1 : 0);
