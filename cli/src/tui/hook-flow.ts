// @ts-nocheck
// Confirm steps for turning a settings hook off or on and for removing one. The preview is lib/hook-toggle.mjs's dry run
// (diff with secrets masked, backup location, refusals); nothing changes until y. `agentry fix --undo` restores the file.

const start = async ({ api, dir, flow, row, action, title, done }) => {
	const args = { dir, selector: row.hook, action, scope: row.hookScope };
	const preview = await api.previewHook(args);
	flow.begin({ kind: "confirm", title: `${title} (preview)`, text: preview.text, appliable: preview.appliable, apply: () => api.applyHook(args), done });
};

export const startHookToggle = ({ api, dir, flow, row }) => {
	const action = row.hookOff ? "enable" : "disable";
	return start({ api, dir, flow, row, action, title: `${row.hookOff ? "Turn on" : "Turn off"} hook ${row.hook}`, done: `Hook ${row.hook} is ${row.hookOff ? "back on" : "off (saved)"}. Applies to new sessions; undo with agentry fix --undo.` });
};

export const startHookRemove = ({ api, dir, flow, row }) => start({ api, dir, flow, row, action: "remove", title: `Remove hook ${row.hook}`, done: `Hook ${row.hook} is removed. Applies to new sessions; undo with agentry fix --undo.` });
