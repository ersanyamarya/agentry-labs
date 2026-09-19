#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kebabCasePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validScopes = new Set(["local", "global"]);

function parseArguments(args) {
  let skillName;
  let scope = "local";
  let explicitScope;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--local" || argument === "--global") {
      const requestedScope = argument.slice(2);
      if (explicitScope && explicitScope !== requestedScope) {
        throw new Error("Choose either local or global scope, not both.");
      }
      scope = requestedScope;
      explicitScope = requestedScope;
      continue;
    }

    if (argument === "--scope") {
      const requestedScope = args[index + 1];
      if (!validScopes.has(requestedScope)) {
        throw new Error("Scope must be either local or global.");
      }
      if (explicitScope && explicitScope !== requestedScope) {
        throw new Error("Choose either local or global scope, not both.");
      }
      scope = requestedScope;
      explicitScope = requestedScope;
      index += 1;
      continue;
    }

    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (skillName) {
      throw new Error("Provide exactly one skill name.");
    }
    skillName = argument;
  }

  if (!skillName) {
    throw new Error("Provide exactly one skill name.");
  }

  return { scope, skillName };
}

let parsedArguments;
try {
  parsedArguments = parseArguments(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

const { scope, skillName } = parsedArguments;

if (!kebabCasePattern.test(skillName)) {
  console.error("Error: Skill name must use kebab-case.");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(scriptDir, "../assets/SKILL.md.template");
const skillsDir =
  scope === "global"
    ? path.join(os.homedir(), ".claude", "skills")
    : path.resolve(process.cwd(), ".claude", "skills");
const targetDir = path.join(skillsDir, skillName);
let targetCreated = false;

async function scaffold() {
  try {
    await fs.mkdir(skillsDir, { recursive: true });
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
      `Successfully scaffolded ${scope} agent skill at: ${targetDir}`,
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
