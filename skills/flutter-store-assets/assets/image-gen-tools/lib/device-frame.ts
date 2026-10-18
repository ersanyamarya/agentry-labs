type DeviceKind = "island" | "punch" | "tablet";

/** What a device shows: a captured screenshot, as a data URI. */
export type DeviceScreen = { readonly src: string };

export type DeviceFrame = {
	readonly kind: DeviceKind;
	readonly width: number;
	/** Height / width of the whole device. */
	readonly aspect: number;
	readonly tiltDeg: number;
	readonly left: number;
	readonly top: number;
	readonly zIndex?: number;
};

/** A phone aspect (700 / 320) and tablet aspect (1013 / 760), as drawn on the design canvas. */
export const PHONE_ASPECT = 700 / 320;
export const TABLET_ASPECT = 1013 / 760;

/**
 * One tilted device holding `screen`. `k` scales every bezel measurement from the 320 pt phone / 760 pt iPad it was
 * drawn at, so the same frame works at any size: store cards, the Play feature graphic, the share card.
 */
export const deviceFrame = (screen: DeviceScreen, frame: DeviceFrame): string => {
	const { kind, width: w, tiltDeg: tilt, left, top } = frame;
	const tablet = kind === "tablet";
	const k = w / (tablet ? 760 : 320);
	const h = Math.round(w * frame.aspect);
	const pad = (tablet ? 16 : 9) * k;
	const outerR = (tablet ? 56 : 54) * k;
	const innerR = (tablet ? 40 : 45) * k;

	const content = `<img src="${screen.src}" alt="" style="display:block;width:100%;height:100%;object-fit:cover;object-position:top center" />`;

	const camera =
		kind === "island"
			? `<div style="position:absolute;left:50%;top:${10 * k}px;width:${92 * k}px;height:${26 * k}px;margin-left:${-46 * k}px;border-radius:${13 * k}px;background:#0A0D0F"></div>`
			: kind === "punch"
				? `<div style="position:absolute;left:50%;top:${14 * k}px;width:${14 * k}px;height:${14 * k}px;margin-left:${-7 * k}px;border-radius:50%;background:#0A0D0F"></div>`
				: "";

	return `<div style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;transform:rotate(${tilt}deg);transform-origin:50% 50%;z-index:${frame.zIndex ?? 3};box-sizing:border-box;padding:${pad}px;border-radius:${outerR}px;background:#11171A;box-shadow:0 0 0 ${(tablet ? 3 : 2) * k}px #8C8B87,0 ${(tablet ? 50 : 30) * k}px ${(tablet ? 110 : 70) * k}px rgba(9,35,43,0.32)">
		<div style="position:relative;width:100%;height:100%;border-radius:${innerR}px;overflow:hidden;background:#F5FAFC">
			${camera}${content}
		</div>
	</div>`;
};
