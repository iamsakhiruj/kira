export default function StubPage({
  title,
  step,
}: {
  title: string;
  step: string;
}) {
  return (
    <div>
      <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
        {title}
      </h1>
      <p style={{ color: "var(--text-muted)" }}>
        Not built yet — coming in Phase 2 step {step}.
      </p>
    </div>
  );
}
