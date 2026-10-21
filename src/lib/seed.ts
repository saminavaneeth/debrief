import { z } from "zod";
import {
  EhsRecord,
  HazardTaxonomy,
  McpConfig,
  Organization,
  PolicyConfig,
  WorkflowRule,
} from "@/domain";
import { dataPath, listFiles, readJson } from "./data-files";

/** Loaders for the checked-in seed and configuration files. Server-side only. */

function parse<T extends z.ZodType>(schema: T, file: string): z.infer<T> {
  const result = schema.safeParse(readJson(file));
  if (!result.success) throw new Error(`${file} is invalid:\n${z.prettifyError(result.error)}`);
  return result.data;
}

export const loadOrganization = () => parse(Organization, dataPath("data", "seed", "org.json"));

export function loadSeedRecords(): EhsRecord[] {
  return listFiles(dataPath("data", "seed", "records"), ".json").flatMap((file) =>
    parse(z.array(EhsRecord), file),
  );
}

export const loadTaxonomy = () =>
  parse(HazardTaxonomy, dataPath("data", "knowledge", "hazard-taxonomy.json"));

export const loadMcpConfig = () => parse(McpConfig, dataPath("mcp.config.json"));

export const loadPolicy = () => parse(PolicyConfig, dataPath("data", "policy.json"));

export const loadWorkflowRules = () =>
  listFiles(dataPath("data", "workflows"), ".json").map((file) => parse(WorkflowRule, file));
