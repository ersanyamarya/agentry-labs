import { createFileRoute } from "@tanstack/react-router";
import { BackupsScreen } from "../components/backups-screen.js";

export const Route = createFileRoute("/backups")({
  component: BackupsScreen,
});
