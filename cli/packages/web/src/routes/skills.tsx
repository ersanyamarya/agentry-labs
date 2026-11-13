import { createFileRoute } from "@tanstack/react-router";
import { SkillsScreen } from "../components/skills-screen.js";

export const Route = createFileRoute("/skills")({
  component: SkillsScreen,
});
