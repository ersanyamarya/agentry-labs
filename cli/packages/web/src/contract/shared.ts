// Schemas every section shares. The browser imports these too, so this file stays free of `node:*` and core runtime code.
// The browser is untrusted input: anything that reaches a file path is narrowed here, and the router checks `dir` on disk.

import { oc } from "@orpc/contract";
import { z } from "zod";

export const base = oc;

// The project folder every call works in. It is the browser's choice on purpose (the TUI lets you pick any folder too), so
// it is only narrowed to an absolute path here; the router also checks it is an existing directory before core sees it.
export const dirSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((dir) => dir.startsWith("/") && !dir.includes("\0"), {
    message: "dir must be an absolute path",
  });

// One path segment: no slash, no leading dot (so never "." or ".."), no NUL. Used wherever core joins the value into a
// folder path itself (a shelf group, a skill folder name), so it cannot climb out of the folder core means.
export const nameSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_.@:+-]*$/, "not a usable name");

// "group" or "group/skill": a shelf target. Core resolves it against the shelf's own folder listing.
export const shelfTargetSchema = z
  .string()
  .min(1)
  .max(401)
  .refine(
    (target) => {
      const parts = target.split("/");
      return (
        parts.length <= 2 &&
        parts.every((part) => nameSchema.safeParse(part).success)
      );
    },
    { message: "target must be group or group/skill" }
  );

// A key core looks up in its own list (a rule label, a backup id, a hook selector); it is never joined into a path, so
// only its size and NUL are limited.
export const keySchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((key) => !key.includes("\0"), { message: "invalid key" });

export const dirInput = z.object({ dir: dirSchema });

// What every write returns (core's Outcome).
export const outcomeSchema = z.object({ ok: z.boolean(), text: z.string() });
// What every preview returns (core's Preview): the engine's dry-run text and whether apply would do anything.
export const previewSchema = z.object({
  appliable: z.boolean(),
  text: z.string(),
});

export type Outcome = z.infer<typeof outcomeSchema>;
export type Preview = z.infer<typeof previewSchema>;
