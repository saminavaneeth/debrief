import { AsyncLocalStorage } from "node:async_hooks";
import type { GatewayEvent } from "@/domain";

export type EventHandler = (event: GatewayEvent) => void | Promise<void>;

/**
 * Record events from the gateway. Handlers run in subscription order and are awaited, so a
 * workflow rule's own writes complete before the original call returns.
 *
 * `batch()` holds the events raised inside it (e.g. one change-set push) and delivers them once
 * it finishes, so handlers see the final state of every record the push touched. Batches are
 * scoped to the async call chain, so concurrent pushes do not hold each other's events.
 */
export class EventBus {
  private handlers = new Set<EventHandler>();
  private recent: GatewayEvent[] = [];
  private held = new AsyncLocalStorage<GatewayEvent[]>();

  on(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async emit(event: GatewayEvent): Promise<void> {
    this.recent.push(event);
    if (this.recent.length > 500) this.recent.shift();
    const queue = this.held.getStore();
    if (queue) {
      queue.push(event);
      return;
    }
    await this.deliver(event);
  }

  async batch<T>(run: () => Promise<T>): Promise<T> {
    const queue: GatewayEvent[] = [];
    const result = await this.held.run(queue, run);
    // Deliver outside the batch, so handlers' own writes are delivered immediately.
    await this.held.exit(async () => {
      for (const event of queue) await this.deliver(event);
    });
    return result;
  }

  private async deliver(event: GatewayEvent) {
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
