import { createFileRoute } from "@tanstack/react-router";
import { AgentsScreen } from "../components/agents-screen.js";

export const Route = createFileRoute("/agents")({
  component: AgentsScreen,
});
