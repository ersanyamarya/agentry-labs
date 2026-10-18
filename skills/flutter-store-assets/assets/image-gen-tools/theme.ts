/**
 * Brand tokens transcribed from docs/Brand.md and lib/core/theme/app_theme.dart.
 * This project has no root package.json (Flutter), so these values can't be
 * imported directly — re-sync by hand from those two files if the brand changes.
 */
export const THEME = {
	border: "#C1CDD0",
	// Neutral canvas — light-mode-first, per docs/Brand.md "UI & Interface Design".
	canvas: "#FFFFFF",
	card: "#ECF0F2",
	chrome: "#F5F7F8",
	containerHigh: "#DDE3E8",
	fontBody: "'Nunito', ui-sans-serif, system-ui, sans-serif",

	fontDisplay: "'Nunito', ui-sans-serif, system-ui, sans-serif",
	fontMono: "'Fira Code', ui-monospace, SFMono-Regular, monospace",
	fontsHref: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap",
	onSecondaryContainer: "#241A00",

	// Primary — Deep Petrol. "Act, or you are here."
	primary: "#0B3B46",
	primaryContainer: "#BFDDE3",

	// Secondary — Aged Brass. "This is which thing."
	secondary: "#826000",
	secondaryContainer: "#F4DEAA",

	// Semantic
	success: "#3E6B22",
	successContainer: "#E1EFD8",

	// Tertiary — Technical Violet. "Data is moving."
	tertiary: "#4A3F8F",
	tertiaryContainer: "#E5DFFF",

	// Typography
	textPrimary: "#09232B",
	textSecondary: "#455A60",
} as const;

/**
 * App icon + native splash colors. The backgrounds are also written in
 * flutter_launcher_icons.yaml and flutter_native_splash.yaml (YAML can't import
 * this) — change all three together.
 */
export const ICON_THEME = {
	backgroundDark: "#001A1D",
	backgroundLight: "#EAF0F1",
	markDark: "#A6DCE5",
	markLight: "#0B3B46",
	/** Mid-grey so iOS's tinted-icon desaturation and Android's monochrome mask both read it. */
	markTinted: "#999898",
} as const;
