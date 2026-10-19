---
name: mongoose-schema-docs
description: Generate documentation and an entity-relationship diagram from a codebase's Mongoose schemas. Use this whenever the user asks to document the database/data model, map out or visualize the schema, explain how collections relate to each other, generate an ER diagram from Mongoose models, or wants an up-to-date README/reference describing what fields, types, indexes, and relationships exist across the app's models — even if they just say "document the schema" or "diagram the database" without naming Mongoose explicitly.
---

# Mongoose Schema Documentation & Diagramming

Mongoose schema files are the ground truth for what a document database actually looks like — more current than any hand-written doc, and more precise than reading the Zod/TypeScript types that mirror them (those describe the API shape, not necessarily indexes, refs, or Mongoose-specific behavior like defaults and validators). This skill turns that ground truth into two artifacts: per-package field documentation, and one relationship diagram tying it all together.

## Step 1 — Find every schema

Search the codebase for Mongoose schema definitions. The concrete syntax varies by project, so look for several signals rather than one fixed pattern:

- `new Schema({...})` or `new mongoose.Schema({...})`
- Files named `*.schema.ts` / `*.schema.js` / `*.model.ts`
- `mongoose.model("Name", ...)` or `connection.model("Name", ...)` calls (the string argument is the ER-diagram entity name — use it, not the filename, since they can differ)

Group the schema files by the package or module they live in — the nearest directory that is its own logical unit (typically the nearest ancestor with its own `package.json`, or a clearly-named top-level domain folder if the project doesn't split by package). This grouping becomes the documentation boundary in Step 3: don't produce one file per schema and don't flatten everything into one undifferentiated file — match the codebase's own module boundaries so the docs stay useful for someone working in one package at a time.

## Step 2 — Extract the real shape of each schema

For every schema file, read the whole file (not an excerpt) and record:

- **Model/entity name** — the string registered with Mongoose, which is what other schemas' `ref` fields will point to.
- **Every field**: name, type, whether it's required, default value if any, enum values if constrained, and array-ness.
- **Nested/embedded sub-documents** — treat these as part of the parent entity in the diagram (they're not independently queryable), but still document their fields.
- **References** (`ref: "OtherModel"` on an ObjectId field, or inside an array) — these are the edges of the ER diagram. Note the cardinality direction as best you can infer from the field being a single ObjectId (belongs-to-one) vs. an array of ObjectIds (belongs-to-many).
- **Indexes** — both inline (`{ index: true }`, `{ unique: true }` on a field) and schema-level `.index({...})` calls, including compound ones. These matter for documentation because they reveal the query patterns the schema was designed for.

Skip this step by reading Zod/TypeScript types instead of the actual schema file — they commonly drift from the Mongoose definition (extra Mongoose-only fields, different required-ness, indexes that don't exist in the type layer at all) and would make the documentation wrong in exactly the way this skill exists to prevent.

## Step 3 — Write the documentation

Produce one markdown file per package/module identified in Step 1, placed where that module's own docs already live (its `README.md` if there's a natural place to add a "Data Model" section, otherwise a new file alongside the schema files, e.g. `SCHEMA.md`). Match whatever documentation convention already exists in the repo for that kind of package before inventing a new one.

For each model within that file, use this shape — it mirrors how someone would actually read the schema top to bottom:

```markdown
### ModelName

Collection: `modelnames` (or whatever Mongoose derives/is configured)

| Field | Type | Required | Notes |
|---|---|---|---|
| _id | ObjectId | | |
| name | String | yes | |
| ownerId | ObjectId → User | yes | ref |
| tags | String[] | | enum: [...] if constrained |

**Indexes:** `{ ownerId: 1, createdAt: -1 }`
```

Keep prose commentary minimal — the table is the reference; only add a sentence where something isn't obvious from the table alone (e.g. why a field is denormalized, or a non-obvious cascade/cleanup behavior tied to this schema found in its repository file).

## Step 4 — Draw the relationship diagram

Produce one Mermaid ER diagram (`erDiagram`) covering every model found in Step 1, regardless of which package it lives in — relationships often cross package boundaries and the value of the diagram is showing that whole graph in one place, even though the written docs stay split by package.

- One entity per top-level Mongoose model (not per embedded sub-document — fold those into their parent entity's attribute list, or note them as an inline comment, rather than drawing them as separate boxes; they don't have independent identity).
- One relationship line per `ref`, labeled with the field name that carries it, and using `||--o{` / `||--||` / `}o--o{` per the cardinality you inferred in Step 2 — a single ObjectId ref is a many-to-one from the referencing model's side, an array of ObjectId refs is many-to-many.
- Where a repository or handler always joins two collections via extended-reference fields (duplicated data) rather than an actual `ref`, it's fine to leave that out of the diagram — the diagram should reflect real Mongoose-level relationships, not every place data happens to be duplicated.

Save the diagram as its own `.md` file with a fenced ` ```mermaid ` block (or append it to a top-level architecture doc if one already exists and welcomes this kind of addition) so it renders wherever the repo's docs are viewed. If the user is working in a context that can render an inline visual — an Artifact, a canvas, a chat surface with diagram support — prefer showing it there as well as saving the file, since a relationship diagram is much easier to verify by eye than by reading Mermaid source.

## Keep it accurate, not exhaustive

If a schema has a field whose purpose isn't inferable from its name, type, or repository usage, say so plainly in the doc rather than guessing at a plausible-sounding description — a wrong explanation is worse than an honest gap. Likewise, if the codebase's schemas and its separate type-validation layer (Zod, Joi, etc.) disagree on a field, flag the discrepancy instead of silently picking one as authoritative; that's exactly the kind of drift this documentation is meant to surface.
