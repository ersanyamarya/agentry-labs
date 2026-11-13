import { createFileRoute } from "@tanstack/react-router";
import { CatalogScreen } from "../components/catalog-screen.js";

export const Route = createFileRoute("/catalog")({
  component: CatalogScreen,
});
