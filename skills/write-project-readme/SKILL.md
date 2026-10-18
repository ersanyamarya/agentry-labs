---
name: write-project-readme
description: "Draft or refresh a project README from Product.md, Brand.md, and the repository structure. Use when a project needs a polished README based on product intent, brand voice, and verified repo contents."
argument-hint: "Optional: project path or focus area, e.g. 'draft for this repo' or 'make it more concise'"
user-invocable: true
---

# Write a Project README from Product and Brand Docs

## When to Use

Use this skill when you need to create or refresh a repository README for a project that already has:

- [docs/Product.md](../../../docs/Product.md) or another product-spec document
- [docs/Brand.md](../../../docs/Brand.md) or another brand/voice document
- a codebase that should be described accurately and comprehensively

The goal is to produce a README that is grounded in the project’s actual structure, capabilities, and intent rather than generic boilerplate.

## Workflow

### 1. Read the product and brand sources

Start by reading the project’s source-of-truth docs:

- [docs/Product.md](../../../docs/Product.md) for goals, user personas, user stories, requirements, and phases
- [docs/Brand.md](../../../docs/Brand.md) for voice, tone, visual guardrails, and messaging
- Any existing [README.md](../../../README.md) if present, so the new version matches the repository’s current style

Use the product and brand docs to decide:

- the one-line positioning statement
- the product pillars to highlight
- the tone and phrasing that fit the brand
- whether the README should emphasize product vision, implementation status, or setup guidance

### 2. Read the whole project, not just the docs

Before writing, inspect the repository broadly:

- the repository root for setup files and scripts
- the [docs/](../../../docs/) folder, including product, brand, and any codebase docs
- the source tree for key entry points, architecture, and feature folders
- package or build manifests to confirm runtime requirements and available scripts
- tests, assets, and platform folders when they affect setup or project structure

The README should reflect what is actually in the project, including the docs folder and any implementation status details that are already present.

### 3. Draft the README in the repository’s existing style

Use the bundled template as the starting point and adapt it to the project.

Prefer this structure:

1. Project title and short positioning line
2. Product concept or value proposition
3. Current implementation status
4. Getting started instructions
5. Project structure overview
6. Conventions or contributor guidance

Match the style of the existing repository README when available. If the repo already has a README, preserve its tone and organization while improving it.

### 4. Keep claims evidence-based

Only include facts that are supported by the codebase or the docs:

- Use verified setup commands from manifests or scripts
- Use implementation status that is clearly reflected in the repo or the project docs
- Avoid inventing features or roadmap items that are not supported by the source
- If the repo is incomplete, say so clearly with planned or pending items instead of pretending it is finished

### 5. Validate the README

Before finishing, check that:

- the README covers the product story, project structure, and setup path
- the tone fits the brand voice
- the documentation is consistent with the repository contents
- links and paths are correct for the repo layout
- no obvious feature claims exceed what the codebase actually contains

## Output Contract

The task is complete only when all of the following are true:

- a README has been written or updated at the repository root
- it is based on the product/brand docs and the repository contents
- it follows the style of the existing README when present
- the content is clear, concise, and tailored to the project

## Bundled Assets

- [README_TEMPLATE.md](README_TEMPLATE.md) — a reusable template that follows the README style used in this repository

## Suggested Prompt Examples

- “Write a README for this project from Product.md and Brand.md.”
- “Refresh the repo README using the product spec, brand guidelines, and current project structure.”
- “Draft a README that reads the whole repo, including docs/, and matches the existing style.”
