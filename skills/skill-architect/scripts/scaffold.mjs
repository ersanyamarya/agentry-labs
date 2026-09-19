#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [skillName, ...extraArgs] = process.argv.slice(2);
const kebabCasePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

if (!skillName || extraArgs.length > 0) {
  console.error("Error: Provide exactly one skill name.");
  process.exit(1);
}

if (!kebabCasePattern.test(skillName)) {
  console.error("Error: Skill name must use kebab-case.");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(scriptDir, "../assets/SKILL.md.template");
const targetDir = path.resolve(process.cwd(), skillName);
let targetCreated = false;

async function scaffold() {
  try {
    await fs.mkdir(targetDir);
    targetCreated = true;

    await Promise.all([
      fs.mkdir(path.join(targetDir, "scripts")),
      fs.mkdir(path.join(targetDir, "references")),
      fs.mkdir(path.join(targetDir, "assets")),
    ]);

    const template = await fs.readFile(templatePath, "utf8");
    const skillDocument = template.replaceAll(
      "[skill-name-kebab-case]",
      skillName,
    );
    await fs.writeFile(path.join(targetDir, "SKILL.md"), skillDocument, {
      flag: "wx",
    });

    console.log(
      `Successfully scaffolded agent skill directory at: ${targetDir}`,
    );
  } catch (error) {
    if (targetCreated) {
      await fs.rm(targetDir, { recursive: true, force: true });
    }

    console.error(`Scaffolding failed: ${error.message}`);
    process.exit(1);
  }
}

scaffold();
