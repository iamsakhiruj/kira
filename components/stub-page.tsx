export default function StubPage({ title }: { title: string }) {
  return (
    <div>
      <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
        {title}
      </h1>
      <p style={{ color: "var(--text-muted)" }}>Coming soon.</p>
    </div>
  );
}
