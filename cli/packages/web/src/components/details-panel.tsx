// The details column of a list screen: a mono title with a badge, label/value pairs, the actions, and a closing note.
import type { ReactNode } from "react";

export const DetailsPanel = ({
  title,
  badge,
  fields,
  actions,
  note,
}: {
  actions?: ReactNode;
  badge?: ReactNode;
  fields: [string, ReactNode][];
  note?: string;
  title: string;
}) => (
  <div className="flex flex-col gap-5">
    <div className="flex items-center gap-2.5">
      <span className="flex-1 font-mono text-base font-semibold break-all">
        {title}
      </span>
      {badge}
    </div>
    <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
      {fields.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-body break-all">{value}</dd>
        </div>
      ))}
    </dl>
    {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    {note ? (
      <p className="text-muted-foreground text-xs leading-relaxed">{note}</p>
    ) : null}
  </div>
);

export const NoSelection = ({ what }: { what: string }) => (
  <p className="text-muted-text text-sm">Select {what} to see its details.</p>
);
