// A Claude rule as a Copilot instructions file. Port of toInstructions in scripts/lib/copilot-global.mjs; keep both in step.

const unquote = (value: string): string =>
  /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;

// Short description: the first heading, else the first sentence, cut at a word under 120 characters.
const summarize = (body: string): string => {
  const line =
    body
      .split(/\r?\n/)
      .find((one) => one.trim() !== "")
      ?.trim() ?? "";
  const heading = /^#{1,6}\s+(.+)$/.exec(line);
  let text = heading
    ? (heading[1] as string).trim()
    : (/^(.+?[.!?])(\s|$)/.exec(line)?.[1] ?? line);
  if (text.length > 120) {
    text = `${text.slice(0, 117).replace(/\s+\S*$/, "")}...`;
  }
  return text;
};

/** applyTo from `paths:` (else "**"), description kept or derived from the body. */
export const toInstructions = (text: string): string => {
  let body = text;
  let applyTo: string | string[] = "**";
  let description: string | undefined;
  const fm = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (fm) {
    body = text.slice(fm[0].length);
    const lines = (fm[1] as string).split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const m = /^(paths|description):\s*(.*)$/.exec(lines[i] as string);
      if (!m) {
        continue;
      }
      const value = (m[2] as string).trim();
      if (m[1] === "description") {
        if (value) {
          description = unquote(value);
        }
      } else if (value === "") {
        const items: string[] = [];
        while (
          i + 1 < lines.length &&
          /^\s*-\s+/.test(lines[i + 1] as string)
        ) {
          i += 1;
          items.push(
            unquote((lines[i] as string).replace(/^\s*-\s+/, "").trim())
          );
        }
        if (items.length > 0) {
          applyTo = items;
        }
      } else if (value.startsWith("[") && value.endsWith("]")) {
        const items = value
          .slice(1, -1)
          .split(",")
          .map((one) => unquote(one.trim()))
          .filter(Boolean);
        if (items.length > 0) {
          applyTo = items;
        }
      } else {
        applyTo = unquote(value);
      }
    }
  }
  body = body.replace(/^(\s*\r?\n)+/, "");
  description ??= summarize(body);
  const applyLine = Array.isArray(applyTo)
    ? `[${applyTo.map((one) => JSON.stringify(one)).join(", ")}]`
    : JSON.stringify(applyTo);
  return `---\napplyTo: ${applyLine}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}`;
};
