import type { EhsRecord, ServerId } from "@/domain";

export interface ConsoleServer {
  id: ServerId;
  enabled: boolean;
  transport: string;
  displayName: string;
  description: string;
  recordTypes: { recordType: string; displayName: string; idPrefix: string }[];
  recordCount: number;
}

export interface Lookup {
  sites: Record<string, string>;
  areas: Record<string, string>;
  people: Record<string, string>;
  roles: Record<string, string>;
  contractors: Record<string, string>;
}

export type ConsoleRecord = EhsRecord & Record<string, unknown>;
