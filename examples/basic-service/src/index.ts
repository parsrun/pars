/**
 * Pars Basic Service Example
 *
 * This example demonstrates:
 * - Service definitions with queries, mutations, and events
 * - RPC server and client communication
 * - Event-driven architecture with memory transport
 * - Cross-service event handling
 * - HTTP server with Hono
 *
 * Run with: pnpm dev
 */

import { Hono } from "hono";
import { createMemoryEventTransport } from "@parsrun/service/events";
import { createHttpHandler, EmbeddedTransport, createRpcClient } from "@parsrun/service/rpc";
import { createUsersHandlers } from "./services/users/handlers.js";
import { createEmailHandlers } from "./services/email/handlers.js";

// ============================================================================
// SETUP
// ============================================================================

console.log("🚀 Starting Pars Basic Service Example...\n");

// Create shared event transport
// In production, you'd use QueueEventTransport or similar
const eventTransport = createMemoryEventTransport({ sync: true });

// Create service handlers
const users = createUsersHandlers({ eventTransport });
const email = createEmailHandlers({ eventTransport });

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// When a user is created, send them a welcome email
eventTransport.subscribe("user.created", async (event, ctx) => {
  console.log("📬 Received user.created event:", event.data);

  // Call email service to send welcome email
  const emailClient = createRpcClient({
    service: "email",
    transport: new EmbeddedTransport(email.server),
  });

  await emailClient.call("sendWelcome", {
    userId: event.data.userId,
    email: event.data.email,
    name: event.data.name,
  });

  await emailClient.close();
});

// Log all email events
eventTransport.subscribe("email.*", async (event, ctx) => {
  console.log(`📧 Email event: ${event.type}`, event.data);
});

// ============================================================================
// HTTP SERVER
// ============================================================================

const app = new Hono();

// Health check
app.get("/", (c) => {
  return c.json({
    name: "Pars Basic Service Example",
    services: ["users", "email"],
    endpoints: {
      users: "/rpc/users",
      email: "/rpc/email",
    },
  });
});

app.get("/health", (c) => c.json({ status: "ok" }));

// RPC endpoints
app.post("/rpc/users", async (c) => {
  const handler = createHttpHandler(users.server);
  return handler(c.req.raw);
});

app.post("/rpc/email", async (c) => {
  const handler = createHttpHandler(email.server);
  return handler(c.req.raw);
});

// ============================================================================
// DEMO: Run some operations
// ============================================================================

async function runDemo() {
  console.log("\n📝 Running demo operations...\n");

  // Create a client for the users service
  const usersClient = createRpcClient({
    service: "users",
    transport: new EmbeddedTransport(users.server),
  });

  try {
    // Create a user (this will trigger the welcome email)
    console.log("1️⃣ Creating user...");
    const { id: userId } = await usersClient.call<
      { email: string; name: string },
      { id: string }
    >("createUser", {
      email: "demo@example.com",
      name: "Demo User",
    });
    console.log(`   ✅ User created with ID: ${userId}\n`);

    // Wait for events to process
    await new Promise((r) => setTimeout(r, 100));

    // Get the user
    console.log("2️⃣ Getting user...");
    const user = await usersClient.call<
      { userId: string },
      { id: string; email: string; name: string; createdAt: string }
    >("getUser", { userId });
    console.log(`   ✅ User found:`, user, "\n");

    // Update the user
    console.log("3️⃣ Updating user...");
    await usersClient.call<
      { userId: string; name: string },
      { success: boolean }
    >("updateUser", { userId, name: "Updated Name" });
    console.log(`   ✅ User updated\n`);

    // Wait for events
    await new Promise((r) => setTimeout(r, 100));

    // List all users
    console.log("4️⃣ Listing users...");
    const list = await usersClient.call<
      { limit?: number },
      { users: unknown[]; total: number }
    >("listUsers", { limit: 10 });
    console.log(`   ✅ Found ${list.total} user(s):`, list.users, "\n");

    // Delete the user
    console.log("5️⃣ Deleting user...");
    await usersClient.call<{ userId: string }, { success: boolean }>(
      "deleteUser",
      { userId }
    );
    console.log(`   ✅ User deleted\n`);

    // Wait for events
    await new Promise((r) => setTimeout(r, 100));

  } catch (error) {
    console.error("❌ Demo error:", error);
  } finally {
    await usersClient.close();
  }

  console.log("✨ Demo completed!\n");
}

// ============================================================================
// START SERVER
// ============================================================================

const port = parseInt(process.env.PORT || "3000");

console.log(`
╔════════════════════════════════════════════════════════════╗
║             Pars Basic Service Example                     ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  HTTP Server: http://localhost:${port}                       ║
║                                                            ║
║  Endpoints:                                                ║
║    GET  /           - Service info                         ║
║    GET  /health     - Health check                         ║
║    POST /rpc/users  - Users service RPC                    ║
║    POST /rpc/email  - Email service RPC                    ║
║                                                            ║
║  Example curl commands:                                    ║
║                                                            ║
║  Create user:                                              ║
║  curl -X POST http://localhost:${port}/rpc/users \\           ║
║    -H "Content-Type: application/json" \\                   ║
║    -d '{"id":"1","service":"users","method":"createUser",  ║
║         "type":"mutation","input":{"email":"a@b.com",      ║
║         "name":"Test"}}'                                   ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);

// Run demo first
await runDemo();

// Start HTTP server
// Note: In Node.js you'd use node:http or the serve function
// This example uses Bun/Deno native server or needs @hono/node-server
if (typeof Bun !== "undefined") {
  // Bun runtime
  Bun.serve({
    port,
    fetch: app.fetch,
  });
  console.log(`🌐 Server running on http://localhost:${port}`);
} else if (typeof Deno !== "undefined") {
  // Deno runtime
  Deno.serve({ port }, app.fetch);
  console.log(`🌐 Server running on http://localhost:${port}`);
} else {
  // Node.js - need @hono/node-server
  try {
    const { serve } = await import("@hono/node-server");
    serve({
      fetch: app.fetch,
      port,
    });
    console.log(`🌐 Server running on http://localhost:${port}`);
  } catch {
    console.log(`
⚠️  To run HTTP server in Node.js, install @hono/node-server:
    pnpm add @hono/node-server

    For now, demo operations have been completed above.
    `);
  }
}
