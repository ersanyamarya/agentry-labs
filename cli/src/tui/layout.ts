// @ts-nocheck
// Width rules for the UI, pure so tests can use them. Below 110 columns the details go under the list (stacked) so the list
// keeps the whole width and its state badges are never cut; from 110 up they sit beside it, with both widths capped so a
// wide terminal does not push the details box to the far edge.

export const STACK_BELOW = 110;
export const STACKED_DETAILS_LINES = 10;

export const layoutFor = (cols = 100) => {
	const stacked = cols < STACK_BELOW;
	const listWidth = stacked ? cols : cols >= 130 ? 66 : 62;
	return { cols, stacked, listWidth, detailsWidth: stacked ? cols : Math.min(cols - listWidth, 60) };
};

// Cuts `text` to `width` characters with … in the middle, keeping both ends (paths, long names).
export const middle = (text, width) => {
	const chars = [...String(text)];
	if (chars.length <= width) {
		return chars.join("");
	}
	if (width <= 1) {
		return "…".slice(0, Math.max(width, 0));
	}
	const keep = width - 1;
	const head = Math.ceil(keep / 2);
	return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - (keep - head)).join("")}`;
};

// Cuts to `width` with … at the end (messages).
export const end = (text, width) => {
	const chars = [...String(text)];
	return chars.length <= width ? chars.join("") : `${chars.slice(0, Math.max(width - 1, 0)).join("")}…`;
};

export const pad = (text, width, align = "left") => {
	const gap = Math.max(width - [...text].length, 0);
	return align === "right" ? " ".repeat(gap) + text : text + " ".repeat(gap);
};

// Long text keeps its first lines and its last two (the question and the keys) when cut.
export const clipLines = (lines, max) => (lines.length <= max ? lines : [...lines.slice(0, Math.max(max - 3, 1)), `… ${lines.length - (max - 1)} more lines`, ...lines.slice(-2)]);
