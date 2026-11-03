#!/usr/bin/env node
// Kept so `node scripts/shelf.mjs list|on|off` still works. The CLI is `agentry shelf`, wired in bin/agentry.mjs.
process.argv.splice(2, 0, "shelf");
await import("../bin/agentry.mjs");
