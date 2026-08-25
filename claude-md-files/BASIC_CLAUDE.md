# CLAUDE.md

This file gives Claude Code project-specific context before it writes a single line — the same way a new engineer would read a README before their first commit.

## Project Overview

A short paragraph: what this project is, who it's for, and the stack (language, framework, package manager). This is the one paragraph Claude should never have to re-derive from scratch every session.

## Commands

```bash
npm install     # install dependencies
npm run dev      # start the dev server
npm test          # run the test suite
npm run build      # production build
```

## Implementation principles

Remember, before writing any code:

1. Does this need to exist? → no: skip it (YAGNI)
2. Already in this codebase? → reuse it, don't rewrite
3. Standard library does it? → use it
4. Native platform feature? → use it
5. Installed dependency? → use it
6. One line? → one line
7. Only then: the minimum that works → If reusable, write it in a shared file/widget.

## Architecture

Point at the load-bearing structure, not everything — the folders/patterns an agent needs to find before editing:

- Where business logic lives vs. where UI lives
- The one or two conventions that repeat everywhere (e.g. "every API route has a matching test file")
- Anything that looks generic but isn't — a naming convention, a required registration step, a file that must be updated in two places

## Coding Standards

- The style rules a linter can't enforce (naming philosophy, when to add an abstraction, comment policy)
- Anything you've had to correct an AI assistant on more than once

## What NOT to do

The fastest way to keep this file useful: list the specific mistakes an agent is likely to make in this codebase and say why they're wrong here — not generic advice, but this project's actual failure modes.
