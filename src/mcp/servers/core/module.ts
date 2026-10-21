import type { Picklists, RecordType, ServerManifest } from "@/domain";

/** Everything that differs between the mock EHS servers. The tools and resources are shared. */
export interface ModuleDefinition {
  manifest: ServerManifest;
  /** Status given to a new record when the payload has none. */
  initialStatus: Partial<Record<RecordType, string>>;
  /** Module-specific picklists, merged with the shared ones. */
  picklists: Picklists;
}
