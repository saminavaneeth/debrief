import type { AgentProvider } from "../provider";

/**
 * Placeholder for a provider backed by a language model. It implements the same interface as
 * `DemoProvider`, so the UI, gateway and workflows do not change when it is switched on.
 */
export function createLlmProvider(): AgentProvider {
  const unavailable = async (): Promise<never> => {
    throw new Error("The LLM provider is not configured. Debrief runs in demo mode.");
  };
  return {
    name: "llm",
    transcribe: unavailable,
    analyzeImage: unavailable,
    analyzeVideo: unavailable,
    extractDocument: unavailable,
    route: unavailable,
    match: unavailable,
    draft: unavailable,
    findGaps: unavailable,
    plan: unavailable,
  };
}
