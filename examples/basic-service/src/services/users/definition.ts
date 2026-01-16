/**
 * Users Service Definition
 *
 * Defines the contract for the users service including:
 * - Queries (read operations)
 * - Mutations (write operations)
 * - Events (async notifications)
 */

import { defineService } from "@parsrun/service";

export const usersService = defineService({
  name: "users",
  version: "1.0.0",

  queries: {
    // Get a single user by ID
    getUser: {
      input: { userId: "string" },
      output: {
        id: "string",
        email: "string",
        name: "string",
        createdAt: "string",
      },
      timeout: 5000,
    },

    // List users with pagination
    listUsers: {
      input: { limit: "number?", offset: "number?" },
      output: {
        users: "array",
        total: "number",
      },
    },
  },

  mutations: {
    // Create a new user
    createUser: {
      input: {
        email: "string",
        name: "string",
      },
      output: {
        id: "string",
      },
    },

    // Update user details
    updateUser: {
      input: {
        userId: "string",
        name: "string?",
        email: "string?",
      },
      output: {
        success: "boolean",
      },
    },

    // Delete a user
    deleteUser: {
      input: { userId: "string" },
      output: { success: "boolean" },
    },
  },

  events: {
    emits: {
      // Emitted when a new user is created
      "user.created": {
        data: {
          userId: "string",
          email: "string",
          name: "string",
        },
        delivery: "at-least-once",
      },

      // Emitted when a user is updated
      "user.updated": {
        data: {
          userId: "string",
          changes: "object",
        },
      },

      // Emitted when a user is deleted
      "user.deleted": {
        data: {
          userId: "string",
        },
      },
    },
  },
});

export type UsersService = typeof usersService;
