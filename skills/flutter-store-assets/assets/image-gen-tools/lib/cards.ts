/**
 * The store-screenshot cards, shared by every platform (iPhone, Android, iPad, Mac) so all of them show the same seven
 * screens. Edit copy here, not in the generators. Copy follows docs/Brand.md: calm, concrete, no filler.
 *
 * The generator alternates the ground by position, so the set keeps its rhythm even when a target skips a card: petrol
 * (the device shows the light theme), then pale (the device shows the dark theme). `callout` pops a crop of the capture out in front of the device on
 * phones; its numbers are fractions of the 1320x2868 capture.
 */
import type { Card } from "./store-design.ts";

export const CARDS: readonly Card[] = [
	{
		body: "One shared workspace for the architect on desktop and the field agent on a phone.",
		bodyTablet: "One shared workspace for the architect on desktop and the field agent on a tablet or phone.",
		capture: "dashboard",
		cover: true,
		name: "cover",
		title: "MQTT configured *once.*\nDeployed everywhere.",
		variant: "center",
	},
	{
		body: "Set a broker up on desktop. Every field agent opens the app and finds it ready.",
		callout: { left: 0.2, rect: [0.037, 0.365, 0.924, 0.123], top: 0.6, width: 0.76 },
		capture: "workspace_brokers",
		name: "workspaces",
		title: "Configure *once.*\nThe team has it.",
		variant: "left",
	},
	{
		body: "TCP, WebSockets and TLS on MQTT 3.1.1 or 5.0, with last will.",
		capture: "broker_form",
		name: "broker-config",
		title: "Every setting,\nin *one place.*",
		variant: "center",
	},
	{
		body: "Search and filter every message, and tune QoS per topic without leaving the stream.",
		callout: { left: 0.06, rect: [0.039, 0.197, 0.623, 0.153], top: 0.7, width: 0.66 },
		capture: "broker_chat",
		name: "live-streams",
		title: "Watch the data\narrive *live.*",
		variant: "right",
	},
	{
		body: "Subscribe, mute and set QoS per topic, with a colour for each so the stream stays readable.",
		capture: "broker_panel",
		name: "broker-panel",
		title: "Every topic,\none *panel.*",
		variant: "left",
	},
	{
		body: "Build a payload once, save it, and share it with your whole workspace.",
		callout: { left: 0.14, rect: [0.037, 0.253, 0.924, 0.187], top: 0.66, width: 0.78 },
		capture: "templates_list",
		name: "templates",
		title: "Stop retyping\nthe same *JSON.*",
		variant: "left",
	},
	{
		body: "JSON or plain text, with sensor tags that fill in live when you publish.",
		capture: "template_edit_plain",
		name: "template-editor",
		skip: ["android", "android-tablet"],
		title: "Write the payload\n*once.*",
		variant: "right",
	},
	{
		body: "Accelerometer, gyro, GPS, magnetometer and battery tags become real device readings when you publish.",
		bodyDesktop: "Accelerometer, gyro, GPS, magnetometer and battery tags become real readings when you publish from a phone.",
		capture: "sensor_keyboard",
		name: "sensor-keyboard",
		title: "Inject live\n*sensor* data.",
		variant: "center",
	},
	{
		body: "Invite teammates by email and set admin, editor or peer access. No credentials passed around.",
		capture: "team_members",
		name: "collaboration",
		title: "Bring the whole\n*team* along.",
		variant: "right",
	},
	{
		body: "Light and dark, on every screen.",
		capture: "dashboard",
		name: "themes",
		pair: true,
		skip: ["android", "android-tablet"],
		title: "Easy on the eyes\nat *any* hour.",
		variant: "center",
	},
];
