/**
 * Core Module
 * Auth engine, tenant management, and session management
 */

export {
  ParsAuthEngine,
  createAuthEngine,
  type AuthContext,
  type SignInInput,
  type SignInResult,
  type SignUpInput,
  type SignUpResult,
  type VerifyTokenResult,
  type RefreshTokenResult,
  type SessionInfo,
} from './auth-engine.js';

// Tenant Resolution
export {
  TenantResolver,
  MultiStrategyTenantResolver,
  createTenantResolver,
  createMultiStrategyResolver,
  type TenantResolverConfig,
  type TenantResolutionResult,
} from './tenant-resolver.js';

// Tenant Management
export {
  TenantManager,
  createTenantManager,
  type CreateTenantInput,
  type UpdateTenantInput,
  type AddMemberInput,
  type UpdateMemberInput,
  type TenantWithMembers,
  type UserTenantMembership,
} from './tenant-manager.js';

// Invitation System
export {
  InvitationService,
  createInvitationService,
  type InvitationConfig,
  type InvitationRecord,
  type SendInvitationInput,
  type SendInvitationResult,
  type AcceptInvitationInput,
  type AcceptInvitationResult,
  type InvitationStatusResult,
} from './invitation.js';
