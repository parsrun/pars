/**
 * Users Service Handlers
 *
 * Implementation of the users service business logic.
 */

import { createRpcServer } from "@parsrun/service/rpc";
import {
  createEventEmitter,
  type EventTransport,
} from "@parsrun/service/events";
import { usersService } from "./definition.js";

// Simple in-memory database for demo
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

const users = new Map<string, User>();

// Helper to generate IDs
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export interface UsersHandlersDeps {
  eventTransport: EventTransport;
}

export function createUsersHandlers(deps: UsersHandlersDeps) {
  const { eventTransport } = deps;

  // Create event emitter for this service
  const emitter = createEventEmitter({
    service: "users",
    definition: usersService,
    transport: eventTransport,
  });

  // Create RPC server
  const server = createRpcServer({
    service: "users",
    version: "1.0.0",
    handlers: {
      // ============ Queries ============

      getUser: async ({ userId }, ctx) => {
        ctx.logger.info("Getting user", { userId });

        const user = users.get(userId);
        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt.toISOString(),
        };
      },

      listUsers: async ({ limit = 10, offset = 0 }, ctx) => {
        ctx.logger.info("Listing users", { limit, offset });

        const allUsers = Array.from(users.values());
        const paginatedUsers = allUsers.slice(offset, offset + limit);

        return {
          users: paginatedUsers.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            createdAt: u.createdAt.toISOString(),
          })),
          total: allUsers.length,
        };
      },

      // ============ Mutations ============

      createUser: async ({ email, name }, ctx) => {
        ctx.logger.info("Creating user", { email, name });

        // Check for duplicate email
        for (const user of users.values()) {
          if (user.email === email) {
            throw new Error(`User with email ${email} already exists`);
          }
        }

        // Create user
        const id = generateId();
        const user: User = {
          id,
          email,
          name,
          createdAt: new Date(),
        };
        users.set(id, user);

        // Emit event
        await emitter.emit("user.created", {
          userId: id,
          email,
          name,
        });

        ctx.logger.info("User created", { userId: id });

        return { id };
      },

      updateUser: async ({ userId, name, email }, ctx) => {
        ctx.logger.info("Updating user", { userId, name, email });

        const user = users.get(userId);
        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }

        const changes: Record<string, unknown> = {};

        if (name !== undefined) {
          changes.name = { from: user.name, to: name };
          user.name = name;
        }

        if (email !== undefined) {
          changes.email = { from: user.email, to: email };
          user.email = email;
        }

        // Emit event
        await emitter.emit("user.updated", {
          userId,
          changes,
        });

        ctx.logger.info("User updated", { userId, changes });

        return { success: true };
      },

      deleteUser: async ({ userId }, ctx) => {
        ctx.logger.info("Deleting user", { userId });

        const user = users.get(userId);
        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }

        users.delete(userId);

        // Emit event
        await emitter.emit("user.deleted", { userId });

        ctx.logger.info("User deleted", { userId });

        return { success: true };
      },
    },
  });

  return { server, emitter };
}
