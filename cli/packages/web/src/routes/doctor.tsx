import { createFileRoute } from "@tanstack/react-router";
import { DoctorScreen } from "../components/doctor-screen.js";

export const Route = createFileRoute("/doctor")({
  component: DoctorScreen,
});
