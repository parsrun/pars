/**
 * @parsrun/service - Events tests
 */

import { describe, it, expect, vi } from "vitest";
import {
  createEvent,
  toCompactEvent,
  fromCompactEvent,
  matchEventType,
  formatEventType,
  parseEventType,
} from "../src/events/format.js";
import { createMemoryEventTransport } from "../src/events/transports/memory.js";
import { createEventHandlerRegistry } from "../src/events/handler.js";

describe("createEvent", () => {
  it("should create a CloudEvents-compatible event", () => {
    const event = createEvent({
      type: "user.created",
      source: "auth",
      data: { userId: "123" },
    });

    expect(event.specversion).toBe("1.0");
    expect(event.type).toBe("user.created");
    expect(event.source).toBe("auth");
    expect(event.id).toBeDefined();
    expect(event.time).toBeDefined();
    expect(event.data).toEqual({ userId: "123" });
  });

  it("should include tenant and trace context", () => {
    const event = createEvent({
      type: "user.created",
      source: "auth",
      data: {},
      tenantId: "tenant_123",
      requestId: "req_456",
      traceContext: {
        traceId: "abcd1234abcd1234abcd1234abcd1234",
        spanId: "1234567890abcdef",
        traceFlags: 1,
      },
    });

    expect(event.parstenantid).toBe("tenant_123");
    expect(event.parsrequestid).toBe("req_456");
    expect(event.parstracecontext).toContain("abcd1234abcd1234abcd1234abcd1234");
  });
});

describe("compact event format", () => {
  it("should convert to compact format", () => {
    const event = createEvent({
      type: "user.created",
      source: "auth",
      data: { userId: "123" },
    });

    const compact = toCompactEvent(event);

    expect(compact.e).toBe("user.created");
    expect(compact.s).toBe("auth");
    expect(compact.i).toBe(event.id);
    expect(compact.d).toEqual({ userId: "123" });
  });

  it("should convert from compact format", () => {
    const compact = {
      e: "user.created",
      s: "auth",
      i: "evt_123",
      t: Date.now(),
      d: { userId: "123" },
    };

    const event = fromCompactEvent(compact);

    expect(event.specversion).toBe("1.0");
    expect(event.type).toBe("user.created");
    expect(event.source).toBe("auth");
    expect(event.id).toBe("evt_123");
    expect(event.data).toEqual({ userId: "123" });
  });
});

describe("matchEventType", () => {
  it("should match exact type", () => {
    expect(matchEventType("user.created", "user.created")).toBe(true);
    expect(matchEventType("user.created", "user.updated")).toBe(false);
  });

  it("should match single segment wildcard", () => {
    expect(matchEventType("user.created", "user.*")).toBe(true);
    expect(matchEventType("user.updated", "user.*")).toBe(true);
    expect(matchEventType("tenant.created", "user.*")).toBe(false);
  });

  it("should match multi-segment wildcard", () => {
    expect(matchEventType("payment.invoice.created", "payment.**")).toBe(true);
    expect(matchEventType("payment.invoice.item.added", "payment.**")).toBe(true);
    expect(matchEventType("user.created", "payment.**")).toBe(false);
  });

  it("should match global wildcard", () => {
    expect(matchEventType("anything.goes.here", "*")).toBe(true);
    expect(matchEventType("user.created", "**")).toBe(true);
  });
});

describe("formatEventType / parseEventType", () => {
  it("should format event type with source prefix", () => {
    const full = formatEventType("payments", "subscription.created");
    expect(full).toBe("com.pars.payments.subscription.created");
  });

  it("should parse full event type", () => {
    const result = parseEventType("com.pars.payments.subscription.created");
    expect(result?.source).toBe("payments");
    expect(result?.type).toBe("subscription.created");
  });

  it("should parse simple event type", () => {
    const result = parseEventType("payments.subscription.created");
    expect(result?.source).toBe("payments");
    expect(result?.type).toBe("subscription.created");
  });
});

describe("MemoryEventTransport", () => {
  it("should emit and receive events", async () => {
    const transport = createMemoryEventTransport({ sync: true });
    const received: unknown[] = [];

    transport.subscribe("user.created", async (event) => {
      received.push(event.data);
    });

    const event = createEvent({
      type: "user.created",
      source: "test",
      data: { userId: "123" },
    });

    await transport.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ userId: "123" });
  });

  it("should support wildcard subscriptions", async () => {
    const transport = createMemoryEventTransport({ sync: true });
    const received: string[] = [];

    transport.subscribe("user.*", async (event) => {
      received.push(event.type);
    });

    await transport.emit(createEvent({ type: "user.created", source: "test", data: {} }));
    await transport.emit(createEvent({ type: "user.updated", source: "test", data: {} }));
    await transport.emit(createEvent({ type: "tenant.created", source: "test", data: {} }));

    expect(received).toEqual(["user.created", "user.updated"]);
  });
});

describe("EventHandlerRegistry", () => {
  it("should register and invoke handlers", async () => {
    const registry = createEventHandlerRegistry();
    const handler = vi.fn();

    registry.register("user.created", handler);

    const event = createEvent({
      type: "user.created",
      source: "test",
      data: { userId: "123" },
    });

    await registry.handle(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event, expect.any(Object));
  });

  it("should unsubscribe handlers", async () => {
    const registry = createEventHandlerRegistry();
    const handler = vi.fn();

    const unsubscribe = registry.register("user.created", handler);

    const event = createEvent({
      type: "user.created",
      source: "test",
      data: {},
    });

    await registry.handle(event);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();

    await registry.handle(event);
    expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
  });
});
