/**
 * @parsrun/service-adapters - Definition tests
 */

import { describe, it, expect } from "vitest";
import { emailServiceDefinition } from "../src/email/definition.js";
import { paymentsServiceDefinition } from "../src/payments/definition.js";

describe("Email Service Definition", () => {
  it("should have correct name", () => {
    expect(emailServiceDefinition.name).toBe("email");
  });

  it("should have version", () => {
    expect(emailServiceDefinition.version).toBeDefined();
  });

  it("should have queries", () => {
    expect(emailServiceDefinition.queries).toBeDefined();
    expect(emailServiceDefinition.queries?.verify).toBeDefined();
    expect(emailServiceDefinition.queries?.getTemplates).toBeDefined();
  });

  it("should have mutations", () => {
    expect(emailServiceDefinition.mutations).toBeDefined();
    expect(emailServiceDefinition.mutations?.send).toBeDefined();
    expect(emailServiceDefinition.mutations?.sendBatch).toBeDefined();
    expect(emailServiceDefinition.mutations?.renderTemplate).toBeDefined();
  });

  it("should have events", () => {
    expect(emailServiceDefinition.events).toBeDefined();
    expect(emailServiceDefinition.events?.emits).toBeDefined();
  });
});

describe("Payments Service Definition", () => {
  it("should have correct name", () => {
    expect(paymentsServiceDefinition.name).toBe("payments");
  });

  it("should have version", () => {
    expect(paymentsServiceDefinition.version).toBeDefined();
  });

  it("should have queries", () => {
    expect(paymentsServiceDefinition.queries).toBeDefined();
    expect(paymentsServiceDefinition.queries?.getSubscription).toBeDefined();
    expect(paymentsServiceDefinition.queries?.getCustomer).toBeDefined();
    expect(paymentsServiceDefinition.queries?.checkQuota).toBeDefined();
    expect(paymentsServiceDefinition.queries?.getUsage).toBeDefined();
    expect(paymentsServiceDefinition.queries?.getPlans).toBeDefined();
  });

  it("should have mutations", () => {
    expect(paymentsServiceDefinition.mutations).toBeDefined();
    expect(paymentsServiceDefinition.mutations?.createCheckout).toBeDefined();
    expect(paymentsServiceDefinition.mutations?.cancelSubscription).toBeDefined();
    expect(paymentsServiceDefinition.mutations?.updateSubscription).toBeDefined();
    expect(paymentsServiceDefinition.mutations?.trackUsage).toBeDefined();
  });

  it("should have events", () => {
    expect(paymentsServiceDefinition.events).toBeDefined();
    expect(paymentsServiceDefinition.events?.emits).toBeDefined();
  });
});
