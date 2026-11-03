// Fixes for doctor findings, keyed by rule id; `agentry fix` (lib/fix.mjs) plans, previews, backs up and applies them.
// An entry is `(finding, ctx) => fix | fix[] | undefined`; the fix shape and `ctx` are documented at the top of lib/fix.mjs.
// Empty on purpose: each concrete fix is added here by its own Phase 5 row.

export const fixes = {};
