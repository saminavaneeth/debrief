import type { AutonomyRule, PolicyConfig, RecordType, ServerId } from "@/domain";

export type Autonomy = PolicyConfig["defaultAutonomy"];

function matches(pattern: string, server: string, tool: string): boolean {
  if (pattern === "*") return true;
  const [p1, p2] = pattern.includes(".") ? pattern.split(".") : ["*", pattern];
  return (p1 === "*" || p1 === server) && (p2 === "*" || p2 === tool);
}

/** Role → tool permissions and per-action autonomy levels. */
export class Policy {
  private readonly initial: PolicyConfig;

  constructor(private config: PolicyConfig) {
    this.initial = structuredClone(config);
  }

  reset() {
    this.config = structuredClone(this.initial);
  }

  get rules(): PolicyConfig {
    return structuredClone(this.config);
  }

  update(config: PolicyConfig) {
    this.config = structuredClone(config);
  }

  isAllowed(roles: string[], server: string, tool: string): boolean {
    return roles.some((role) =>
      (this.config.roles[role] ?? []).some((pattern) => matches(pattern, server, tool)),
    );
  }

  autonomyFor(input: {
    action: AutonomyRule["action"];
    server?: ServerId;
    recordType?: RecordType;
    target?: "existing" | "new";
  }): { level: Autonomy; rule?: AutonomyRule } {
    const rule = this.config.autonomy.find(
      (r) =>
        r.action === input.action &&
        (!r.server || r.server === input.server) &&
        (!r.recordType || r.recordType === input.recordType) &&
        (!r.target || r.target === input.target),
    );
    return rule ? { level: rule.level, rule } : { level: this.config.defaultAutonomy };
  }
}
