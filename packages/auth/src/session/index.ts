/**
 * Session Module
 * JWT management, token blocklist, and session lifecycle
 */

// JWT Manager
export {
  JwtManager,
  JwtError,
  createJwtManager,
  extractBearerToken,
  parseDuration,
  type JwtConfig,
  type JwtPayload,
  type TokenPair,
  type KeyRotationResult,
} from './jwt-manager.js';

// Blocklist
export {
  SessionBlocklist,
  TokenBlocklist,
  createSessionBlocklist,
  createTokenBlocklist,
  type BlocklistConfig,
} from './blocklist.js';
