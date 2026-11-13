import { createFileRoute } from "@tanstack/react-router";
import { McpScreen } from "../components/mcp-screen.js";

export const Route = createFileRoute("/mcp")({
  component: McpScreen,
});
