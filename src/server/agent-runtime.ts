import { DemoProvider } from "@/agents/demo/demo-provider";
import { Gazetteer } from "@/agents/nlp/gazetteer";
import type { PipelineDeps } from "@/agents/orchestrator/pipeline";
import type { AgentProvider } from "@/agents/provider";
import type { CallContext } from "@/domain";
import { getRuntime } from "@/mcp/runtime";
import { getKnowledgeIndex } from "@/rag/knowledge-index";
import { RecordsIndex } from "@/rag/records-index";

/** The agent acts for the signed-in user (single user until sign-in exists). */
export const AGENT_CALL: CallContext = { actor: "P-001", roles: ["ehs_specialist"], via: "agent" };

interface AgentRuntime {
  provider: AgentProvider;
  deps: PipelineDeps;
}

const globalForAgent = globalThis as unknown as { __debriefAgent?: AgentRuntime };

/** Provider and pipeline dependencies wired to the process-wide gateway. */
export function getAgentRuntime(): AgentRuntime {
  if (!globalForAgent.__debriefAgent) {
    const runtime = getRuntime();
    const gazetteer = new Gazetteer(runtime.org);
    globalForAgent.__debriefAgent = {
      provider: new DemoProvider(gazetteer),
      deps: {
        gateway: runtime.gateway,
        knowledge: getKnowledgeIndex(),
        records: new RecordsIndex(runtime.gateway, AGENT_CALL),
        org: runtime.org,
        gazetteer,
        call: AGENT_CALL,
      },
    };
  }
  return globalForAgent.__debriefAgent;
}
