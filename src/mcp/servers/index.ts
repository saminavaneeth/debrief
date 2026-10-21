import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerId } from "@/domain";
import { createEhsServer } from "./core/create-server";
import type { ModuleDefinition } from "./core/module";
import type { ServerDeps } from "./core/service";
import { auditsModule } from "./modules/audits";
import { hazardsModule } from "./modules/hazards";
import { incidentsModule } from "./modules/incidents";
import { inspectionsModule } from "./modules/inspections";
import { meetingsModule } from "./modules/meetings";
import { trainingModule } from "./modules/training";

export type { ServerDeps } from "./core/service";
export { ModuleService, ToolError } from "./core/service";

export const MODULES: Record<ServerId, ModuleDefinition> = {
  incidents: incidentsModule,
  audits: auditsModule,
  meetings: meetingsModule,
  hazards: hazardsModule,
  inspections: inspectionsModule,
  training: trainingModule,
};

export const createIncidentsServer = (deps: ServerDeps) => createEhsServer(incidentsModule, deps);
export const createAuditsServer = (deps: ServerDeps) => createEhsServer(auditsModule, deps);
export const createMeetingsServer = (deps: ServerDeps) => createEhsServer(meetingsModule, deps);
export const createHazardsServer = (deps: ServerDeps) => createEhsServer(hazardsModule, deps);
export const createInspectionsServer = (deps: ServerDeps) =>
  createEhsServer(inspectionsModule, deps);
export const createTrainingServer = (deps: ServerDeps) => createEhsServer(trainingModule, deps);

export const SERVER_FACTORIES: Record<ServerId, (deps: ServerDeps) => McpServer> = {
  incidents: createIncidentsServer,
  audits: createAuditsServer,
  meetings: createMeetingsServer,
  hazards: createHazardsServer,
  inspections: createInspectionsServer,
  training: createTrainingServer,
};

export const isServerId = (id: string): id is ServerId => id in SERVER_FACTORIES;
