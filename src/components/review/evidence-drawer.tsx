"use client";

import { BookOpen, Cpu, FileText, Pencil, Sparkles } from "lucide-react";
import type { Artifact, Evidence, FieldSupport } from "@/domain";
import { useBlobUrl, useMediaUrl, usePerception } from "@/capture/hooks";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MODALITY } from "@/components/capture/modality";
import { fieldLabel, formatScalar } from "./format";

export interface EvidenceTarget {
  path: string;
  value: unknown;
  support?: FieldSupport;
}

/** The capture's text with every supporting span highlighted. */
function Highlight({ text, needles }: { text: string; needles: string[] }) {
  const ranges = needles
    .map((n) => ({ start: n ? text.indexOf(n) : -1, end: 0, n }))
    .filter((r) => r.start >= 0)
    .map((r) => ({ ...r, end: r.start + r.n.length }))
    .sort((a, b) => a.start - b.start);
  if (ranges.length === 0)
    return <p className="text-[15px] leading-relaxed">“{needles.join(" … ") || text}”</p>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start < at) continue;
    parts.push(text.slice(at, r.start));
    parts.push(
      <mark key={r.start} className="text-foreground rounded bg-amber-200 px-0.5">
        {text.slice(r.start, r.end)}
      </mark>,
    );
    at = r.end;
  }
  parts.push(text.slice(at));
  return <p className="text-[15px] leading-relaxed">{parts}</p>;
}

function ImageRegion({ artifact, evidence }: { artifact: Artifact; evidence: Evidence }) {
  const perception = usePerception(artifact.id);
  const p = evidence.provenance;
  const frameMs = p.type === "image_region" ? p.frameMs : undefined;
  const frameUri =
    frameMs !== undefined && perception?.perception.kind === "video"
      ? perception.perception.keyframes.find((k) => k.atMs === frameMs)?.uri
      : undefined;
  const mediaUrl = useMediaUrl(artifact);
  const frameUrl = useBlobUrl(frameUri);
  const url = frameUri ? frameUrl : artifact.modality === "video" ? undefined : mediaUrl;
  if (p.type !== "image_region") return null;
  const box = p.box;
  const whole = box.w >= 0.99 && box.h >= 0.99;
  return (
    <div className="space-y-1.5">
      {url ? (
        <div className="bg-muted relative overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element -- local captures and demo assets */}
          <img src={url} alt="" className="w-full" />
          {!whole && (
            <div
              className="absolute rounded-sm border-[3px] border-amber-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.w * 100}%`,
                height: `${box.h * 100}%`,
              }}
            />
          )}
        </div>
      ) : null}
      <p className="text-[15px]">
        {evidence.text}
        {frameMs !== undefined && (
          <span className="text-muted-foreground"> · frame at {(frameMs / 1000).toFixed(0)} s</span>
        )}
      </p>
    </div>
  );
}

function EvidenceItem({
  evidence,
  artifact,
  spans,
}: {
  evidence: Evidence;
  artifact?: Artifact;
  spans?: string[];
}) {
  const p = evidence.provenance;
  const m = artifact ? MODALITY[artifact.modality] : undefined;
  const Icon = m?.icon ?? FileText;
  return (
    <li className="space-y-2 rounded-xl border p-3">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Icon className="size-3.5" aria-hidden />
        {m?.label ?? "Capture"} {artifact ? `· ${artifact.capturedAt.slice(11, 16)}` : ""} ·{" "}
        {Math.round(evidence.confidence * 100)}% · {evidence.source.replace("_", " ")}
      </p>
      {(p.type === "transcript_span" || p.type === "text_span") && (
        <Highlight text={artifact?.text ?? evidence.text} needles={spans ?? [evidence.text]} />
      )}
      {p.type === "image_region" && artifact && (
        <ImageRegion artifact={artifact} evidence={evidence} />
      )}
      {p.type === "document_field" && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">
            Page {p.page} · {p.field}
          </p>
          <pre className="bg-muted overflow-x-auto rounded-lg p-2 font-mono text-xs whitespace-pre-wrap">
            {p.excerpt}
          </pre>
        </div>
      )}
      {p.type === "capture_metadata" && (
        <p className="text-[15px]">
          {p.field === "capturedAt"
            ? `Captured at ${formatScalar("at", evidence.value)}`
            : p.field === "capturedBy"
              ? `Captured by ${formatScalar("reportedBy", evidence.value)}`
              : p.field === "areaId"
                ? `Captured in ${formatScalar("areaId", evidence.value)}`
                : p.field === "siteId"
                  ? `Captured at ${formatScalar("siteId", evidence.value)}`
                  : p.field === "assetTag"
                    ? `Asset tag ${String(evidence.value)}`
                    : evidence.text}
        </p>
      )}
    </li>
  );
}

/** Why a drafted field has its value: the evidence, rule, default or citation behind it. */
export function EvidenceDrawer({
  target,
  evidence,
  artifacts,
  knowledge,
  onOpenChange,
}: {
  target: EvidenceTarget | null;
  evidence: Evidence[];
  artifacts: Artifact[];
  knowledge: Record<string, string>;
  onOpenChange: (open: boolean) => void;
}) {
  const support = target?.support;
  const items = (support?.evidenceIds ?? [])
    .map((id) => evidence.find((e) => e.id === id))
    .filter((e): e is Evidence => !!e);
  const byArtifact = new Map(artifacts.map((a) => [a.id, a]));
  // Text spans from the same capture are shown together, with every span highlighted.
  const grouped: { evidence: Evidence; spans?: string[] }[] = [];
  for (const e of items) {
    const isText = e.provenance.type === "transcript_span" || e.provenance.type === "text_span";
    const same = isText && grouped.find((g) => g.spans && g.evidence.artifactId === e.artifactId);
    if (same) same.spans!.push(e.text);
    else grouped.push(isText ? { evidence: e, spans: [e.text] } : { evidence: e });
  }
  const sourceLine =
    support?.source === "user"
      ? { icon: Pencil, text: "You entered this value." }
      : support?.source === "schema_default"
        ? { icon: Cpu, text: "Default value from the module's schema." }
        : support?.rule
          ? { icon: Sparkles, text: `Derived: ${support.rule}.` }
          : { icon: FileText, text: "Taken from your captures." };
  const SourceIcon = sourceLine.icon;

  return (
    <Sheet open={!!target} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] max-w-md overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader>
          <SheetTitle>{target ? fieldLabel(target.path) : "Evidence"}</SheetTitle>
          <SheetDescription className="line-clamp-3">
            {target &&
              (Array.isArray(target.value)
                ? `${target.value.length} item(s)`
                : formatScalar(target.path, target.value))}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-8">
          <p className="flex items-start gap-2 text-sm">
            <SourceIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {sourceLine.text}
          </p>
          {items.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                Evidence ({items.length} from {grouped.length} source
                {grouped.length === 1 ? "" : "s"})
              </h3>
              <ul className="space-y-2">
                {grouped.map(({ evidence: e, spans }) => (
                  <EvidenceItem
                    key={e.id}
                    evidence={e}
                    artifact={byArtifact.get(e.artifactId)}
                    spans={spans}
                  />
                ))}
              </ul>
            </section>
          )}
          {(support?.citations.length ?? 0) > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">References</h3>
              <ul className="space-y-2">
                {support!.citations.map((c, i) => (
                  <li key={i} className="space-y-1 rounded-xl border bg-sky-50/60 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <BookOpen className="size-4" aria-hidden />
                      {knowledge[c.docId] ?? c.docId}
                    </p>
                    {c.section && <p className="text-muted-foreground text-xs">{c.section}</p>}
                    {c.excerpt && <p className="text-sm">“{c.excerpt.split(" | ")[0]}”</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
