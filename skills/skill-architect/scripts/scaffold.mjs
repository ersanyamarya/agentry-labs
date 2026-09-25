#!/usr/bin/env node
// Scaffolds a new skill folder (SKILL.md from the template, plus scripts/, references/, assets/).
// Usage: node scaffold.mjs <skill-name> [--local | --global | --target <skills-dir>]
//   --local   <cwd>/.claude/skills (default)
//   --global  ~/.claude/skills
//   --target  any skills directory, e.g. a catalog repo's skills/
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const fail = (message) => {
  console.error(`Error: ${message}`);
  process.exit(1);
};

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { local: { type: 'boolean' }, global: { type: 'boolean' }, target: { type: 'string' } },
  });
} catch (error) {
  fail(error.message);
}

const { values, positionals } = parsed;
const [skillName] = positionals;
if (positionals.length !== 1) fail('Provide exactly one skill name.');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName)) fail('Skill name must use kebab-case.');
if ([values.local, values.global, values.target].filter(Boolean).length > 1) fail('Choose one of --local, --global, or --target.');

const skillsDir = values.target
  ? path.resolve(values.target)
  : values.global
    ? path.join(os.homedir(), '.claude', 'skills')
    : path.resolve('.claude', 'skills');
const targetDir = path.join(skillsDir, skillName);
const templatePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/SKILL.md.template');

let created = false;
try {
  await fs.mkdir(skillsDir, { recursive: true });
  await fs.mkdir(targetDir);
  created = true;
  await Promise.all(['scripts', 'references', 'assets'].map((dir) => fs.mkdir(path.join(targetDir, dir))));
  const template = await fs.readFile(templatePath, 'utf8');
  await fs.writeFile(path.join(targetDir, 'SKILL.md'), template.replaceAll('[skill-name-kebab-case]', skillName), { flag: 'wx' });
  console.log(`Scaffolded skill at: ${targetDir}`);
} catch (error) {
  if (created) await fs.rm(targetDir, { recursive: true, force: true });
  fail(error.code === 'EEXIST' ? `${targetDir} already exists. Improve it instead of scaffolding.` : `Scaffolding failed: ${error.message}`);
}
