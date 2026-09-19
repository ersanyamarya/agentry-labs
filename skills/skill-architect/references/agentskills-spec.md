# AgentSkills Specification Rules

When generating a new skill, strictly adhere to these rules:

- **Folder Naming:** Use `kebab-case` only for the root folder. Do not use spaces, capitals, or underscores.
- **`SKILL.md` Frontmatter:**
  - Set `name` to exactly match the root folder name.
  - State what the skill does and include specific trigger phrases, such as "Use when the user asks to...", in `description`. Keep the description within 1024 characters.
- **No `README.md`:** Never generate a `README.md` inside a skill folder. Put all instructions in `SKILL.md`.
- **Instruction Style:** Write `SKILL.md` steps in imperative or infinitive form, such as "Extract the data" or "Fetch the URL". Do not use second person, such as "You should".
- **Progressive Disclosure:** Keep static rules, examples, and templates out of `SKILL.md`. Put them in `references/` or `assets/`, then explicitly state when to read them during the workflow.
