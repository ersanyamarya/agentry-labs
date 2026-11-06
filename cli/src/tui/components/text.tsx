// Ink's Text, with every glyph swapped for ASCII when the theme is in ASCII mode (see icons.ts). Rows and badges are
// built as plain strings elsewhere, so this is the one place they are converted.

import { Text as InkText, type TextProps } from "ink";
import React from "react";
import { toAscii } from "../icons.js";
import { ThemeContext } from "../theme.js";

const convert = (node: React.ReactNode): React.ReactNode =>
  typeof node === "string"
    ? toAscii(node)
    : Array.isArray(node)
      ? node.map(convert)
      : node;

export const Text = ({ children, ...props }: TextProps) => {
  const { ascii } = React.useContext(ThemeContext);
  const content = ascii ? convert(children) : children;
  return <InkText {...props}>{content}</InkText>;
};
