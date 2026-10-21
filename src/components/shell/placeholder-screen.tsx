export function PlaceholderScreen({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
    </section>
  );
}
