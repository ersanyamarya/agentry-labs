import { createFileRoute } from "@tanstack/react-router";
import { PluginsScreen } from "../components/plugins-screen.js";

export const Route = createFileRoute("/plugins")({
  component: PluginsScreen,
});
