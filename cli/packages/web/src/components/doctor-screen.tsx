// Doctor: what is wrong with this setup, one finding at a time, with the fix core offers. Fixing previews first; the last
// fix set can be undone. Findings are flat blocks with a hairline between them (no cards).

import { UndoIcon } from "lucide-react";
import type { LoadData } from "../contract/index.js";
import { useAppData } from "../lib/app-data.js";
import { whileLoading } from "../lib/format.js";
import { client } from "../lib/orpc.js";
import { Pill, type Tone } from "./pill.js";
import { usePreviewFlow } from "./preview-flow.js";
import { Button } from "./ui/button.js";

type Finding = LoadData["doctor"]["findings"][number];

const SEVERITY: Record<Finding["severity"], { label: string; tone: Tone }> = {
  error: { label: "Error", tone: "error" },
  warning: { label: "Warning", tone: "project" },
  info: { label: "Info", tone: "muted" },
};

const STAT_COLOUR = {
  error: "text-error",
  warning: "text-project",
  info: "text-muted-text",
} as const;

export const DoctorScreen = () => {
  const { data, dir, loading } = useAppData();
  const flow = usePreviewFlow();
  const findings = data?.doctor.findings ?? [];
  const summary = data?.doctor.summary ?? { error: 0, warning: 0, info: 0 };

  const fix = (finding: Finding) =>
    flow.start({
      title: `Fix: ${finding.message.slice(0, 60)}`,
      preview: () => client.doctor.previewFix({ dir, finding }),
      apply: () => client.doctor.applyFix({ dir, finding }),
      note: "A backup is made first, and Undo last fix restores it.",
    });
  const undo = () =>
    flow.start({
      title: "Undo the last fix set",
      preview: () => client.doctor.previewUndo({ dir }),
      apply: () => client.doctor.applyUndo({ dir }),
    });

  return (
    <section className="flex flex-col gap-8 px-8 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Doctor</h1>
          <p className="text-muted-text text-sm">
            {whileLoading(
              loading,
              findings.length === 0
                ? "No problems found."
                : `${findings.length} findings in ~/.claude and this project`
            )}
          </p>
        </div>
        <Button className="h-11 px-4" onClick={undo} variant="outline">
          <UndoIcon aria-hidden="true" className="size-4" /> Undo last fix
        </Button>
      </div>
      <dl className="flex flex-wrap gap-x-12 gap-y-4">
        {(["error", "warning", "info"] as const).map((severity) => (
          <div className="flex flex-col gap-1" key={severity}>
            <dt className="text-muted-foreground text-sm">
              {SEVERITY[severity].label}s
            </dt>
            <dd
              className={`font-mono text-3xl font-semibold ${STAT_COLOUR[severity]}`}
            >
              {summary[severity]}
            </dd>
          </div>
        ))}
      </dl>
      <ul className="flex flex-col">
        {findings.map((finding) => (
          <li
            className="border-row-border flex flex-col gap-3 border-t py-5"
            key={`${finding.id}:${finding.file}:${finding.line ?? 0}:${finding.message}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Pill tone={SEVERITY[finding.severity].tone}>
                {SEVERITY[finding.severity].label}
              </Pill>
              <h2 className="min-w-0 flex-1 text-base font-medium">
                {finding.message}
              </h2>
              <span className="text-muted-foreground font-mono text-xs">
                {finding.id}
              </span>
            </div>
            <p className="text-muted-text font-mono text-xs break-all">
              {finding.file}
              {finding.line ? `:${finding.line}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <code className="bg-muted text-body min-w-0 flex-1 basis-72 rounded-md px-3 py-2 font-mono text-xs break-words">
                {finding.fix ?? "No automatic fix. Change it by hand."}
              </code>
              <Button
                className="h-11 px-4"
                disabled={!finding.fix}
                onClick={() => fix(finding)}
              >
                Fix it
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {flow.dialog}
    </section>
  );
};
