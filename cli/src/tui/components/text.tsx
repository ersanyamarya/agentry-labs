// Ink's Text, with every glyph swapped for ASCII when the theme is in ASCII mode (see icons.ts). Rows and badges are
// built as plain strings elsewhere, so this is the one place they are converted. Ink's own truncation draws a Unicode
// "…", so in ASCII mode plain-string text that would be truncated is cut by hand to the terminal width instead.

import { Text as InkText, type TextProps, useStdout } from "ink";
import React from "react";
import { toAscii } from "../icons.js";
import { end, middle } from "../layout.js";
import { ThemeContext } from "../theme.js";

const convert = (node: React.ReactNode): React.ReactNode =>
  typeof node === "string"
    ? toAscii(node)
    : Array.isArray(node)
      ? node.map(convert)
      : node;

export const Text = ({ children, ...props }: TextProps) => {
  const { ascii } = React.useContext(ThemeContext);
  const { stdout } = useStdout();
  let content = children;
  if (ascii && typeof content === "string" && props.wrap?.startsWith("trunc")) {
    const cols = (stdout as NodeJS.WriteStream | undefined)?.columns ?? 100;
    content =
      props.wrap === "truncate-middle"
        ? middle(content, cols)
        : end(content, cols);
  }
  if (ascii) {
    content = convert(content);
  }
  return <InkText {...props}>{content}</InkText>;
};
