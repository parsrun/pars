/**
 * @parsrun/service - defineService tests
 */

import { describe, it, expect } from "vitest";
import { defineService, satisfiesVersion, getServiceMethods, getServiceEvents } from "../src/define.js";

describe("defineService", () => {
  it("should create a valid service definition", () => {
    const service = defineService({
      name: "test",
      version: "1.0.0",
      queries: {
        getUser: {
          input: { userId: "string" },
          output: { id: "string", name: "string" },
        },
      },
      mutations: {
        createUser: {
          input: { name: "string" },
          output: { id: "string" },
        },
      },
      events: {
        emits: {
          "user.created": {
            data: { userId: "string" },
          },
        },
        handles: ["tenant.created"],
      },
    });

    expect(service.name).toBe("test");
    expect(service.version).toBe("1.0.0");
    expect(service.queries).toBeDefined();
    expect(service.mutations).toBeDefined();
    expect(service.events?.emits).toBeDefined();
    expect(service.events?.handles).toContain("tenant.created");
  });

  it("should throw on invalid service name", () => {
    expect(() =>
      defineService({
        name: "",
        version: "1.0.0",
      })
    ).toThrow("Service name is required");
  });

  it("should throw on invalid version format", () => {
    expect(() =>
      defineService({
        name: "test",
        version: "1.0",
      })
    ).toThrow("Invalid version format");
  });

  it("should freeze the definition", () => {
    const service = defineService({
      name: "test",
      version: "1.0.0",
    });

    expect(Object.isFrozen(service)).toBe(true);
  });
});

describe("satisfiesVersion", () => {
  it("should match exact version", () => {
    expect(satisfiesVersion("1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesVersion("1.2.3", "1.2.4")).toBe(false);
  });

  it("should match wildcard major", () => {
    expect(satisfiesVersion("1.2.3", "1.x")).toBe(true);
    expect(satisfiesVersion("2.0.0", "1.x")).toBe(false);
  });

  it("should match wildcard minor", () => {
    expect(satisfiesVersion("1.2.3", "1.2.x")).toBe(true);
    expect(satisfiesVersion("1.3.0", "1.2.x")).toBe(false);
  });

  it("should match * for any version", () => {
    expect(satisfiesVersion("1.2.3", "*")).toBe(true);
    expect(satisfiesVersion("99.99.99", "*")).toBe(true);
  });
});

describe("getServiceMethods", () => {
  it("should return query and mutation names", () => {
    const service = defineService({
      name: "test",
      version: "1.0.0",
      queries: {
        getUser: {},
        listUsers: {},
      },
      mutations: {
        createUser: {},
      },
    });

    const methods = getServiceMethods(service);

    expect(methods.queries).toEqual(["getUser", "listUsers"]);
    expect(methods.mutations).toEqual(["createUser"]);
  });
});

describe("getServiceEvents", () => {
  it("should return emits and handles", () => {
    const service = defineService({
      name: "test",
      version: "1.0.0",
      events: {
        emits: {
          "user.created": {},
          "user.updated": {},
        },
        handles: ["tenant.created", "tenant.deleted"],
      },
    });

    const events = getServiceEvents(service);

    expect(events.emits).toEqual(["user.created", "user.updated"]);
    expect(events.handles).toEqual(["tenant.created", "tenant.deleted"]);
  });
});
