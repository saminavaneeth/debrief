import { FlaskConical } from "lucide-react";

/** Always visible so it is clear the deterministic demo engine is running, not a live model. */
export function DemoEngineBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900"
      title="Perception uses fixtures; routing, matching, drafting and workflows run for real."
    >
      <FlaskConical className="size-3.5" aria-hidden />
      Demo engine
    </span>
  );
}
