export const ComingLater = ({ title }: { title: string }) => (
  <section className="flex flex-col gap-2 px-8 py-7">
    <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
    <p className="text-muted-text text-sm">Coming in a later phase.</p>
  </section>
);
