// A spinner followed by text, for work in progress. The animated frames are braille dots; ASCII mode uses - \ | /.

import { Text } from "ink";
import Spinner from "ink-spinner";
import { useIcons, useStyle } from "../theme.js";

export const Busy = ({ text }: { text: string }) => {
  const style = useStyle();
  const ascii = /^[ -~]+$/.test(useIcons().on);
  return (
    <Text wrap="truncate-end">
      <Text {...style({ color: "cyan" })}>
        <Spinner type={ascii ? "line" : "dots"} />
      </Text>
      {` ${text}`}
    </Text>
  );
};
