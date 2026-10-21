import type { GatewayEvent } from "@/domain";

export type EventHandler = (event: GatewayEvent) => void | Promise<void>;

/**
 * Record events from the gateway. Handlers run in subscription order and are awaited, so a
 * workflow rule's own writes complete before the original call returns.
 */
export class EventBus {
  private handlers = new Set<EventHandler>();
  private recent: GatewayEvent[] = [];

  on(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async emit(event: GatewayEvent): Promise<void> {
    this.recent.push(event);
    if (this.recent.length > 500) this.recent.shift();
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (err) {
        console.error(`Event handler failed for ${event.type} ${event.recordId}:`, err);
      }
    }
  }

  /** Recent events, oldest first (for the console's live feed). */
  history(): GatewayEvent[] {
    return [...this.recent];
  }

  clearHistory() {
    this.recent = [];
  }
}
