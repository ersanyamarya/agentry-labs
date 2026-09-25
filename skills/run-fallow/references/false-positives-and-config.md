# False positives and config maintenance

## Check before reporting a finding

Most noisy "unused file/export" findings come from entry points fallow did not detect. Compare `fallow list --entry-points --format json` with how the project actually builds:

- Framework convention files (`next.config.*`, `app/**/page.tsx`, `gatsby-*.js`, `astro.config.*`, `vite.config.*`). Usually covered by a built-in plugin, which only activates when the framework package is installed in `node_modules`.
- Scripts referenced only from `package.json` scripts, CI config, or Dockerfiles.
- Files loaded dynamically (glob imports, string-based `require`, CLI plugin folders).
- Files copied or executed outside the bundler, such as templates, skill assets, or standalone `.mjs` scripts.
- Generated or vendored code (shadcn `components/ui/*`, codegen output) that drags down health scores. Exclude it rather than refactor it.

Confirm a suspected false positive with `fallow dead-code --trace <file>:<export> --format json` before editing config.

## Signs the config is the problem

- Entry points are missing or wrong, or a framework upgrade changed conventions.
- An `ignorePatterns` entry references a path that no longer exists. Compare `fallow config --format json` with `ls`/`find`.
- The same false positive recurs every run. Prefer an `ignorePatterns` / `ignoreDependencies` entry over repeated `fallow-ignore-next-line` comments.
- Thresholds (`duplicates.minOccurrences`, complexity limits) do not match the project's stated standards.

## Editing the config

1. Run `fallow config-schema --format json` to confirm field names and shapes. Do not guess at schema.
2. With no config, or more than two stale keys, run `fallow recommend --format json`. It returns `auto` (safe to apply), `default` (overridable), and `taste` (ask the user) groups. Prefer it over a blind rewrite.
3. Ask before creating a new config file (`fallow init` scaffolds `.fallowrc.json`). Edit an existing tracked config like any other source file.
4. Re-run the affected command. Confirm the finding disappeared and nothing legitimate got silenced.
5. State in the summary why the config changed, since a wrong scope change can hide a real issue later.
