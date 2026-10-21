import type { WorkflowNotification, WorkflowRunEntry, WorkflowSuggestion } from "@/domain";

/** In-memory feed of what workflows did: notifications, suggestion cards and every evaluation. */
export class WorkflowFeed {
  notifications: WorkflowNotification[] = [];
  suggestions: WorkflowSuggestion[] = [];
  runs: WorkflowRunEntry[] = [];
  private seq = 0;

  nextId(prefix: string) {
    return `${prefix}-${String(++this.seq).padStart(5, "0")}`;
  }

  notify(n: Omit<WorkflowNotification, "id" | "read">): WorkflowNotification {
    const full = { ...n, id: this.nextId("NTF"), read: false };
    this.notifications.unshift(full);
    this.notifications.splice(300);
    return full;
  }

  /** Adds a suggestion unless an open one with the same key exists. */
  suggest(s: Omit<WorkflowSuggestion, "id" | "status">): WorkflowSuggestion | undefined {
    if (this.suggestions.some((x) => x.key === s.key && x.status === "open")) return undefined;
    const full = { ...s, id: this.nextId("SUG"), status: "open" as const };
    this.suggestions.unshift(full);
    this.suggestions.splice(300);
    return full;
  }

  hasOpenSuggestion(key: string) {
    return this.suggestions.some((x) => x.key === key && x.status === "open");
  }

  log(run: Omit<WorkflowRunEntry, "id">): WorkflowRunEntry {
    const full = { ...run, id: this.nextId("WFR") };
    this.runs.unshift(full);
    this.runs.splice(500);
    return full;
  }

  setSuggestion(id: string, status: WorkflowSuggestion["status"]) {
    const s = this.suggestions.find((x) => x.id === id);
    if (s) s.status = status;
  }

  markAllRead() {
    for (const n of this.notifications) n.read = true;
  }

  clear() {
    this.notifications = [];
    this.suggestions = [];
    this.runs = [];
  }
}
