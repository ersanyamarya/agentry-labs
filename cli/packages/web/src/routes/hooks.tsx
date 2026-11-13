import { createFileRoute } from "@tanstack/react-router";
import { HooksScreen } from "../components/hooks-screen.js";

export const Route = createFileRoute("/hooks")({
  component: HooksScreen,
});
