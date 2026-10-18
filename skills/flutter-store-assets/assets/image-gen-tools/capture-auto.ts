/**
 * Automatic capture of the store-asset and website screenshots, no tapping needed.
 *
 * It builds the app with `--dart-define=DEMO=true` (made-up brokers, teammates and messages, so nothing real is shown)
 * and runs `integration_test/capture_test.dart` through `flutter drive`, which walks every screen twice,
 * light then dark. Light shots land in captures/<set>/<slug>.png and dark ones in captures/<set>/dark/<slug>.png.
 *
 * - Every booted iPhone/iPad simulator -> captures/ios/ and captures/ipad/. Flutter takes the screenshot itself, so
 *   there is no status bar to paint over. The simulators run one after another: they share one `build/` folder.
 * - This Mac -> captures/macos/. Flutter cannot screenshot on desktop, so the test prints `CAPTURE_SHOT <name>` and holds
 *   still for 3 s while this script resizes the window to 1440x900 pt and grabs it with `screencapture`. Needs Screen
 *   Recording permission (and Accessibility for the resize) for the terminal; keep the window visible while it runs.
 *
 * Boot the simulators first, then: pnpm nx run image-gen-tools:capture [-- iphone ipad macos]
 * With no argument it does everything; name one or more targets to run only those.
 */
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { APP_DIR, MAC_PROCESS } from "./lib/app.ts";

const APP_ROOT = path.resolve(import.meta.dirname, "..", "..", APP_DIR);
import { captureWindow, resizeWindow, windowId } from "./lib/mac-window.ts";

type Target = "ipad" | "iphone" | "macos";
type Booted = { name: string; udid: string };

const CAPTURES = path.join(import.meta.dirname, "captures");
const DRIVE = ["drive", "--driver=test_driver/integration_test.dart", "--target=integration_test/capture_test.dart"];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const bootedSimulators = (): Booted[] => {
	const result = spawnSync("xcrun", ["simctl", "list", "devices", "booted", "-j"], { encoding: "utf-8" });
	if (result.status !== 0) {
		console.error(result.stderr || "Failed to run `xcrun simctl list devices booted`.");
		process.exit(1);
	}
	const parsed = JSON.parse(result.stdout) as { devices: Record<string, Booted[]> };
	return Object.values(parsed.devices).flat();
};

const driveSimulator = (device: Booted, outDir: string): boolean => {
	const result = spawnSync("flutter", [...DRIVE, "-d", device.udid, "--dart-define=DEMO=true"], {
		cwd: APP_ROOT,
		env: { ...process.env, CAPTURE_DIR: outDir },
		stdio: "inherit",
	});
	return result.status === 0;
};

/** Runs the test on this Mac and screenshots the window whenever the test announces a shot. */
const driveMac = (outDir: string): Promise<boolean> =>
	new Promise((resolve) => {
		const child = spawn("flutter", [...DRIVE, "-d", "macos", "--dart-define=DEMO=true", "--dart-define=CAPTURE_DESKTOP=true"], {
			cwd: APP_ROOT,
			env: { ...process.env, CAPTURE_DIR: outDir },
			stdio: ["ignore", "pipe", "inherit"],
		});
		let resized = false;
		// One capture at a time, in the order the test announced them.
		let queue: Promise<void> = Promise.resolve();

		const grab = async (name: string): Promise<void> => {
			const id = windowId(MAC_PROCESS);
			if (id === undefined) {
				console.error(`  No "${MAC_PROCESS}" window to capture for ${name}.`);
				return;
			}
			if (resized) {
				await sleep(400);
			} else {
				resized = true;
				resizeWindow(MAC_PROCESS);
				await sleep(1200);
			}
			const target = path.join(outDir, `${name}.png`);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			const failure = captureWindow(windowId(MAC_PROCESS) ?? id, target);
			console.log(failure === undefined ? `  Wrote ${path.relative(process.cwd(), target)}` : `  Failed ${name}: ${failure}`);
		};

		readline.createInterface({ input: child.stdout }).on("line", (line) => {
			console.log(line);
			const name = /CAPTURE_SHOT (\S+)/.exec(line)?.[1];
			if (name) {
				queue = queue.then(() => grab(name));
			}
		});
		child.on("close", (code) => {
			queue.then(
				() => resolve(code === 0),
				() => resolve(false)
			);
		});
	});

const requested = process.argv.slice(2).filter((a): a is Target => a === "iphone" || a === "ipad" || a === "macos");
const wants = (target: Target): boolean => requested.length === 0 || requested.includes(target);

const failures: string[] = [];

const simulators = bootedSimulators()
	.map((device) => ({ ...device, kind: (/ipad/i.test(device.name) ? "ipad" : "iphone") as "ipad" | "iphone" }))
	.filter((device) => wants(device.kind));

for (const device of simulators) {
	const outDir = path.join(CAPTURES, device.kind === "ipad" ? "ipad" : "ios");
	console.log(`\n== ${device.name} (${device.udid}) -> ${path.relative(process.cwd(), outDir)}/`);
	if (!driveSimulator(device, outDir)) {
		failures.push(device.name);
	}
}

if (wants("macos")) {
	const outDir = path.join(CAPTURES, "macos");
	console.log(`\n== This Mac -> ${path.relative(process.cwd(), outDir)}/`);
	if (!(await driveMac(outDir))) {
		failures.push("macOS");
	}
}

if (simulators.length === 0 && !wants("macos")) {
	console.error("No booted simulator found. Boot an iPhone and/or iPad simulator first.");
	process.exit(1);
}
if (failures.length > 0) {
	console.error(`\nCapture failed on: ${failures.join(", ")}`);
	process.exit(1);
}
console.log("\nDone. Run `pnpm nx run image-gen-tools:store` to rebuild the store assets from these captures.");
