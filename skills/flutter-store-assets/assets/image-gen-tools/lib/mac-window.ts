/** Finding, sizing and grabbing the running Mac app's window, used by capture-auto.ts. */
import { spawnSync } from "node:child_process";

const osascript = (language: "AppleScript" | "JavaScript", script: string): { ok: boolean; out: string } => {
	const result = spawnSync("osascript", ["-l", language, "-e", script], { encoding: "utf-8" });
	return { ok: result.status === 0, out: (result.stdout || result.stderr).trim() };
};

/** CGWindowID of the app's main window (layer 0), or undefined when the app isn't running. */
export const windowId = (processName: string): number | undefined => {
	const { ok, out } = osascript(
		"JavaScript",
		`ObjC.import('CoreGraphics');
		const all = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0)));
		const w = all.find((x) => x.kCGWindowOwnerName === ${JSON.stringify(processName)} && x.kCGWindowLayer === 0 && x.kCGWindowBounds.Height > 200);
		w ? String(w.kCGWindowNumber) : ''`
	);
	return ok && out ? Number(out) : undefined;
};

export const resizeWindow = (processName: string): void => {
	const { ok, out } = osascript(
		"AppleScript",
		`tell application "System Events" to tell process ${JSON.stringify(processName)}
			set position of window 1 to {40, 40}
			set size of window 1 to {1440, 900}
		end tell`
	);
	if (!ok) {
		console.warn(`Could not resize the window (${out}). Grant Accessibility permission, or resize it to 1440x900 by hand.`);
	}
};

/** One window by id, no shadow, no sound. Returns the error text on failure. */
export const captureWindow = (id: number, target: string): string | undefined => {
	const result = spawnSync("screencapture", ["-l", String(id), "-o", "-x", target], { encoding: "utf-8" });
	return result.status === 0 ? undefined : result.stderr;
};
