/**
 * The store-listing design: one self-contained card per screenshot, rendered from HTML/CSS in Chromium.
 *
 * Each card stands alone (stores show them one at a time and as thumbnails): a large benefit headline, one short line,
 * and one full device or window bleeding off the bottom. Cards alternate between a deep petrol ground, which shows the
 * app in its light theme, and a pale ground, which shows the dark theme, so the contrast always lifts the device and
 * both themes get shown. Aged brass is the only accent; it marks the key word of a headline.
 *
 * Design canvas, in points: iPhone 440x956 @3x, Android 360x640 @3x, iPad 1032x1376 @2x, Mac 1440x900 @2x. Every
 * number below is in canvas points, so a card renders the same at any output scale.
 */
import { THEME } from "../theme.ts";
import { APP_NAME } from "./app.ts";
import { deviceFrame, PHONE_ASPECT, TABLET_ASPECT } from "./device-frame.ts";

export type StoreTarget = "android" | "android-tablet" | "ios" | "ipad" | "macos";

/** iPad and the Play tablet sets share a layout: both show the iPad captures in a tablet frame. */
export const isTablet = (target: StoreTarget): boolean => target === "ipad" || target === "android-tablet";
export type Tone = "dark" | "light";

type Canvas = { readonly h: number; readonly scale: number; readonly w: number };

export const CANVAS: Readonly<Record<StoreTarget, Canvas>> = {
	android: { h: 640, scale: 3, w: 360 },
	"android-tablet": { h: 1376, scale: 2, w: 1032 },
	ios: { h: 956, scale: 3, w: 440 },
	ipad: { h: 1376, scale: 2, w: 1032 },
	macos: { h: 900, scale: 2, w: 1440 },
};

/** Where a card puts its device: centred, or bleeding off the right or left edge with a slight tilt. */
export type Variant = "center" | "left" | "right";

/** A crop of the capture, popped out in front of the device. Fractions of the capture; phones only. */
export type Callout = {
	readonly left: number;
	/** [x, y, w, h] as fractions of the capture. */
	readonly rect: readonly [number, number, number, number];
	readonly top: number;
	/** Width as a fraction of the canvas width. */
	readonly width: number;
};

export type Card = {
	readonly body: string;
	/** iPad wording where "phone" would be wrong. */
	readonly bodyTablet?: string;
	/** Mac wording where a phone claim would not hold. */
	readonly bodyDesktop?: string;
	readonly callout?: Callout;
	/** Capture file name without extension; also the screen shown. */
	readonly capture: string;
	readonly cover?: boolean;
	/** Short file-name part; the generator prefixes the position, e.g. `03-broker-config`. */
	readonly name: string;
	/** Shows the screen in both themes, overlapping, like the cover but without the lockup. */
	readonly pair?: boolean;
	/** Targets that leave this card out (Play allows 8 phone screenshots; Apple allows 10). */
	readonly skip?: readonly StoreTarget[];
	/** Headline; `\n` breaks a line and `*word*` sets the word in the brass accent. */
	readonly title: string;
	readonly variant: Variant;
};

/** What a device shows. `theme` picks captures/<set>/ or captures/<set>/dark/. */
export type Screens = {
	readonly dark: string;
	readonly light: string;
};

export const PALETTE = {
	dark: {
		accent: "#F0CE79",
		body: "#B7D2D8",
		title: "#F4FAFB",
	},
	light: {
		accent: "#8A6500",
		body: "#3F5A62",
		title: "#09232B",
	},
} as const;

const escapeHtml = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

/** Escapes, then turns `*word*` into the accent span and `\n` into a line break. */
const titleHtml = (title: string, tone: Tone): string =>
	escapeHtml(title)
		.replace(/\*(.+?)\*/g, `<span style="color:${PALETTE[tone].accent}">$1</span>`)
		.replaceAll("\n", "<br>");

export const ground = (tone: Tone): string =>
	tone === "dark"
		? [
				"radial-gradient(120% 62% at 88% -4%, rgba(240,206,121,0.20), rgba(240,206,121,0) 58%)",
				"radial-gradient(90% 55% at 0% 104%, rgba(166,220,229,0.14), rgba(166,220,229,0) 62%)",
				"linear-gradient(180deg,#0E4654 0%,#09303A 55%,#062229 100%)",
			].join(",")
		: [
				"radial-gradient(110% 58% at 10% -6%, rgba(244,222,170,0.62), rgba(244,222,170,0) 60%)",
				"radial-gradient(90% 55% at 100% 104%, rgba(191,221,227,0.70), rgba(191,221,227,0) 62%)",
				"linear-gradient(180deg,#F7FBFC 0%,#E6EFF2 100%)",
			].join(",");

const img = (src: string, style: string): string => `<img src="${src}" alt="" style="${style}" />`;

/** The crop of `src` shown in a box `w` points wide; the box height follows the crop's aspect on a 1320x2868 capture. */
const calloutHtml = (src: string, callout: Callout, canvas: Canvas, tone: Tone): string => {
	const [fx, fy, fw, fh] = callout.rect;
	const w = callout.width * canvas.w;
	const imgW = w / fw;
	const imgH = imgW * (2868 / 1320);
	const h = fh * imgH;
	const edge = tone === "dark" ? "rgba(255,255,255,0.16)" : "rgba(9,35,43,0.10)";
	return `<div style="position:absolute;left:${callout.left * canvas.w}px;top:${callout.top * canvas.h}px;width:${w}px;height:${h}px;z-index:6;border-radius:${canvas.w * 0.045}px;overflow:hidden;background:#fff;box-shadow:0 0 0 1px ${edge},0 ${canvas.w * 0.04}px ${canvas.w * 0.11}px rgba(3,18,23,0.42)">
		${img(src, `position:absolute;left:${-fx * imgW}px;top:${-fy * imgH}px;width:${imgW}px;height:${imgH}px`)}
	</div>`;
};

/** A Mac window: our own title bar over the capture, whose own title bar (64 px of white at 2x) is cropped away. */
const macWindow = (src: string, theme: Tone, opts: { left: number; top: number; width: number; z: number }): string => {
	const barH = 28;
	const barColor = theme === "dark" ? "#0D1114" : "#F5FAFC";
	const edge = theme === "dark" ? "rgba(255,255,255,0.14)" : "rgba(9,35,43,0.14)";
	const imgW = opts.width;
	const crop = (64 / 2880) * imgW;
	const dot = (color: string): string => `<span style="width:11px;height:11px;border-radius:50%;background:${color}"></span>`;
	return `<div style="position:absolute;left:${opts.left}px;top:${opts.top}px;width:${opts.width}px;z-index:${opts.z};border-radius:14px;overflow:hidden;background:${barColor};box-shadow:0 0 0 1px ${edge},0 40px 110px rgba(3,18,23,0.46)">
		<div style="height:${barH}px;display:flex;align-items:center;gap:8px;padding-left:14px;background:${barColor}">${dot("#FF5F57")}${dot("#FEBC2E")}${dot("#28C840")}</div>
		<div style="width:${imgW}px;height:${(1800 / 2880) * imgW - crop}px;overflow:hidden">${img(src, `display:block;width:${imgW}px;margin-top:${-crop}px`)}</div>
	</div>`;
};

const phoneKind = (target: StoreTarget): "island" | "punch" => (target === "android" ? "punch" : "island");

type Placed = { left: number; tilt: number; top: number; width: number; z: number };

/** Device placement for the single-device cards, in canvas points. */
const place = (target: StoreTarget, variant: Variant): Placed => {
	const { h, w } = CANVAS[target];
	const tablet = isTablet(target);
	const width = Math.round(w * (tablet ? 0.8 : 0.8));
	const top = Math.round(h * (tablet ? 0.43 : target === "android" ? 0.33 : 0.3));
	const tilt = variant === "center" ? 0 : variant === "right" ? 3 : -3;
	const left = variant === "center" ? (w - width) / 2 : variant === "right" ? w - width * 0.94 : -width * 0.06;
	return { left, tilt, top, width, z: 3 };
};

const frameHtml = (target: StoreTarget, src: string, p: Placed): string =>
	deviceFrame(
		{ src },
		{
			aspect: isTablet(target) ? TABLET_ASPECT : PHONE_ASPECT,
			kind: isTablet(target) ? "tablet" : phoneKind(target),
			left: p.left,
			tiltDeg: p.tilt,
			top: p.top,
			width: p.width,
			zIndex: p.z,
		}
	);

type CopyMetrics = { bodySize: number; k: number; pad: number; titleSize: number; top: number };

/** Type sizes and offsets for a target's copy, in canvas points. The Mac canvas uses fixed sizes; the others scale from 440 pt. */
const copyMetrics = (card: Card, target: StoreTarget): CopyMetrics => {
	if (target === "macos") {
		return { bodySize: 24, k: 1, pad: 88, titleSize: 66, top: 76 };
	}
	const k = CANVAS[target].w / 440;
	// The cover headline is longer than the others, so it is set smaller to stay on two lines.
	const coverScale = isTablet(target) ? 0.6 : target === "android" ? 0.7 : 0.86;
	return { bodySize: 17 * k, k, pad: 28 * k, titleSize: 46 * k * (card.cover ? coverScale : 1), top: 62 * k };
};

/** The wording for a target: tablet and desktop variants where the phone copy would overclaim. */
const bodyFor = (card: Card, target: StoreTarget): string => {
	if (isTablet(target) && card.bodyTablet) {
		return card.bodyTablet;
	}
	if (target === "macos" && card.bodyDesktop) {
		return card.bodyDesktop;
	}
	return card.body;
};

const coverMark = (logoSrc: string, tone: Tone, target: StoreTarget, k: number): string => {
	const mac = target === "macos";
	const logo = mac ? 52 : 40 * k;
	return `<div style="display:flex;align-items:center;gap:${12 * k}px;margin-bottom:${mac ? 30 : 22 * k}px">
		${img(logoSrc, `width:${logo}px;height:${logo}px;border-radius:${mac ? 12 : 9 * k}px`)}
		<span style="font-size:${mac ? 30 : 24 * k}px;font-weight:800;letter-spacing:0.14em;color:${PALETTE[tone].title}">${APP_NAME.toUpperCase()}</span>
	</div>`;
};

const copyBlock = (card: Card, tone: Tone, target: StoreTarget, logoSrc: string): string => {
	const mac = target === "macos";
	const { bodySize, k, pad, titleSize, top } = copyMetrics(card, target);
	const colors = PALETTE[tone];
	const mark = card.cover ? coverMark(logoSrc, tone, target, k) : "";
	return `<div id="copy" style="position:absolute;left:${pad}px;top:${top}px;width:${mac ? 760 : CANVAS[target].w - 2 * pad}px;z-index:7">
		${mark}
		<h1 style="margin:0;font-size:${titleSize}px;line-height:1.05;font-weight:800;letter-spacing:-0.025em;color:${colors.title}">${titleHtml(card.title, tone)}</h1>
		<p style="margin:${mac ? 20 : 14 * k}px 0 0;max-width:${mac ? 640 : 360 * k}px;font-size:${bodySize}px;line-height:1.42;font-weight:600;color:${colors.body}">${escapeHtml(bodyFor(card, target))}</p>
	</div>`;
};

/** The cover: the same screen twice, in both themes, overlapping. */
const coverDevices = (target: StoreTarget, screens: Screens): string => {
	const { h, w } = CANVAS[target];
	if (target === "macos") {
		return (
			macWindow(screens.dark, "dark", { left: 70, top: 500, width: 900, z: 2 }) +
			macWindow(screens.light, "light", { left: 420, top: 560, width: 1000, z: 3 })
		);
	}
	const tablet = isTablet(target);
	const width = Math.round(w * (tablet ? 0.6 : 0.56));
	const back = { left: w * (tablet ? 0.4 : 0.42), tilt: 6, top: h * (tablet ? 0.56 : 0.5), width, z: 2 };
	const front = { left: w * (tablet ? 0.04 : 0.05), tilt: -6, top: h * (tablet ? 0.5 : 0.45), width, z: 3 };
	return frameHtml(target, screens.dark, back) + frameHtml(target, screens.light, front);
};

export const cardDocument = (
	target: StoreTarget,
	card: Card,
	tone: Tone,
	screens: Screens,
	logoSrc: string,
	calloutSrc?: string
): string => {
	const canvas = CANVAS[target];
	// The device shows the theme opposite to the ground.
	const shown = tone === "dark" ? screens.light : screens.dark;
	const devices =
		card.cover || card.pair
			? coverDevices(target, screens)
			: target === "macos"
				? macWindow(shown, tone === "dark" ? "light" : "dark", { left: 88, top: 330, width: 1264, z: 3 })
				: frameHtml(target, shown, place(target, card.variant));
	const callout =
		card.callout && calloutSrc && !card.cover && !card.pair && (target === "ios" || target === "android")
			? calloutHtml(calloutSrc, card.callout, canvas, tone)
			: "";

	return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${THEME.fontsHref}">
<style>*{margin:0;padding:0;box-sizing:border-box}
body{width:${canvas.w}px;height:${canvas.h}px;overflow:hidden;font-family:${THEME.fontBody};background:${tone === "dark" ? "#09303A" : "#E6EFF2"}}</style></head><body>
<div style="position:absolute;inset:0;background:${ground(tone)}"></div>
${copyBlock(card, tone, target, logoSrc)}
<div id="devices" style="position:absolute;inset:0">${devices}${callout}</div>
<script>
// A long line of copy must never run into the devices: if it would, move them down (they bleed off the bottom anyway).
document.fonts.ready.then(() => {
	const copyBottom = document.getElementById("copy").getBoundingClientRect().bottom;
	const stage = document.getElementById("devices");
	const top = Math.min(...[...stage.children].map((el) => el.getBoundingClientRect().top));
	const gap = ${Math.round(canvas.w * 0.03)};
	if (top < copyBottom + gap) stage.style.transform = "translateY(" + (copyBottom + gap - top) + "px)";
});
</script>
</body></html>`;
};
