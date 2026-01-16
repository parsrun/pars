/**
 * @parsrun/realtime - Channel Implementation
 * Channel abstraction for realtime communication
 */

import type {
  Channel,
  ChannelInfo,
  MessageHandler,
  PresenceEvent,
  PresenceUser,
  RealtimeAdapter,
} from "../types.js";
import { createMessage } from "../types.js";

/**
 * Channel implementation using an adapter
 */
export class ChannelImpl implements Channel {
  private presenceHandlers: Set<(event: PresenceEvent) => void> = new Set();

  constructor(
    public readonly name: string,
    private adapter: RealtimeAdapter,
    private sessionId: string
  ) {}

  async broadcast<T = unknown>(event: string, data: T): Promise<void> {
    const message = createMessage({
      event,
      channel: this.name,
      data,
    });

    await this.adapter.publish(this.name, message);
  }

  async send<T = unknown>(
    userId: string,
    event: string,
    data: T
  ): Promise<void> {
    const message = createMessage({
      event,
      channel: this.name,
      data,
      metadata: { targetUserId: userId },
    });

    // Find session for user and send
    const presence = await this.adapter.getPresence(this.name);

    for (const user of presence) {
      if (user.userId === userId) {
        await this.adapter.sendToSession(user.sessionId, message);
      }
    }
  }

  async getPresence<T = unknown>(): Promise<PresenceUser<T>[]> {
    return this.adapter.getPresence<T>(this.name);
  }

  subscribe<T = unknown>(handler: MessageHandler<T>): () => void {
    // Subscribe this session to the channel
    this.adapter.subscribe(this.name, this.sessionId, handler as MessageHandler);

    return () => {
      this.adapter.unsubscribe(this.name, this.sessionId);
    };
  }

  onPresence<T = unknown>(
    handler: (event: PresenceEvent<T>) => void
  ): () => void {
    this.presenceHandlers.add(handler as (event: PresenceEvent) => void);

    return () => {
      this.presenceHandlers.delete(handler as (event: PresenceEvent) => void);
    };
  }

  /**
   * Emit presence event to handlers
   */
  emitPresence<T = unknown>(event: PresenceEvent<T>): void {
    for (const handler of this.presenceHandlers) {
      try {
        handler(event as PresenceEvent);
      } catch {
        // Ignore handler errors
      }
    }
  }

  async getInfo(): Promise<ChannelInfo> {
    const subscribers = await this.adapter.getSubscribers(this.name);
    const presence = await this.adapter.getPresence(this.name);

    return {
      name: this.name,
      subscriberCount: subscribers.length,
      presence,
    };
  }
}

/**
 * Create a channel instance
 */
export function createChannel(
  name: string,
  adapter: RealtimeAdapter,
  sessionId: string
): Channel {
  return new ChannelImpl(name, adapter, sessionId);
}
