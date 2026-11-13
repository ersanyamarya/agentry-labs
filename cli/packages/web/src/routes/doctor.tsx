import { createFileRoute } from "@tanstack/react-router";
import { ComingLater } from "../components/coming-later.js";

export const Route = createFileRoute("/doctor")({
  component: () => <ComingLater title="Doctor" />,
});
