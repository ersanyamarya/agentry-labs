import { createFileRoute } from "@tanstack/react-router";
import { ComingLater } from "../components/coming-later.js";

export const Route = createFileRoute("/catalog")({
  component: () => <ComingLater title="Catalog" />,
});
