// @ts-nocheck
// One combined confirm step for an action on several marked rows: each item's own preview (the lib's dry run) is joined
// into one text, and one y applies the items one by one through the same lib call the single-row action uses.
// preview(item) → { appliable, text }; apply(item) → { ok, text }. Items whose preview is not appliable are skipped.

export const startBulk = async ({ flow, title, items, preview, apply, done }) => {
	const previews = [];
	for (const item of items) {
		previews.push(await preview(item));
	}
	const todo = items.filter((item, index) => previews[index].appliable);
	flow.begin({
		kind: "confirm",
		title: `${title}: ${todo.length} of ${items.length} (preview)`,
		text: items.map((item, index) => `== ${item.label.trim()} ==\n${previews[index].text || "(nothing to do)"}${previews[index].appliable ? "" : "\n(skipped: cannot be applied)"}`).join("\n\n"),
		appliable: todo.length > 0,
		apply: async () => {
			const results = [];
			for (const item of todo) {
				results.push({ item, ...(await apply(item)) });
			}
			return { ok: results.every((one) => one.ok), text: results.map((one) => `== ${one.item.label.trim()} ==\n${one.text}`).join("\n\n") };
		},
		done: `${done} (${todo.length} item${todo.length === 1 ? "" : "s"}).`,
	});
};
