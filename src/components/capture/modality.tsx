import {
  FileText,
  Image as ImageIcon,
  Mic,
  StickyNote,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { Modality } from "@/domain";

export const MODALITY: Record<Modality, { label: string; icon: LucideIcon; textLabel: string }> = {
  voice: { label: "Voice", icon: Mic, textLabel: "Transcript" },
  photo: { label: "Photo", icon: ImageIcon, textLabel: "Caption" },
  video: { label: "Video", icon: Video, textLabel: "What it shows" },
  document: { label: "Document", icon: FileText, textLabel: "Description" },
  note: { label: "Note", icon: StickyNote, textLabel: "Note" },
};

export function ModalityIcon({ modality, className }: { modality: Modality; className?: string }) {
  const Icon = MODALITY[modality].icon;
  return <Icon className={className} aria-label={MODALITY[modality].label} />;
}
