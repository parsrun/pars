/**
 * Invitation System
 * Handles tenant invitations and membership requests
 */

import type { KVStorage } from '../storage/types.js';
import type { AuthAdapter, AdapterMembership, AdapterTenant } from '../config.js';
import { generateRandomHex, sha256Hex } from '../utils/crypto.js';

/**
 * Invitation configuration
 */
export interface InvitationConfig {
  /** Base URL for invitation links */
  baseUrl: string;
  /** Invitation callback path (default: /auth/invitation) */
  callbackPath?: string;
  /** Token expiration in seconds (default: 604800 = 7 days) */
  expiresIn?: number;
  /** Token length in bytes (default: 32) */
  tokenLength?: number;
}

/**
 * Invitation record stored in KV
 */
export interface InvitationRecord {
  /** Unique invitation ID */
  id: string;
  /** Invited email address */
  email: string;
  /** Target tenant ID */
  tenantId: string;
  /** Role to assign */
  role: string;
  /** Permissions to assign */
  permissions?: string[];
  /** Who sent the invitation */
  invitedBy: string;
  /** Token hash for verification */
  tokenHash: string;
  /** Expiration timestamp */
  expiresAt: string;
  /** Status */
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  /** When invitation was accepted */
  acceptedAt?: string;
  /** User ID who accepted (if different from invited email) */
  acceptedBy?: string;
  /** Created timestamp */
  createdAt: string;
  /** Custom message */
  message?: string;
}

/**
 * Send invitation input
 */
export interface SendInvitationInput {
  /** Email to invite */
  email: string;
  /** Tenant ID */
  tenantId: string;
  /** Role to assign */
  role: string;
  /** Permissions to assign */
  permissions?: string[];
  /** User ID sending the invitation */
  invitedBy: string;
  /** Optional message to include */
  message?: string;
}

/**
 * Send invitation result
 */
export interface SendInvitationResult {
  success: boolean;
  invitation?: InvitationRecord;
  invitationUrl?: string;
  token?: string;
  error?: string;
}

/**
 * Accept invitation input
 */
export interface AcceptInvitationInput {
  /** Invitation token */
  token: string;
  /** User ID accepting the invitation */
  userId: string;
}

/**
 * Accept invitation result
 */
export interface AcceptInvitationResult {
  success: boolean;
  membership?: AdapterMembership;
  tenant?: AdapterTenant;
  error?: string;
}

/**
 * Invitation status check result
 */
export interface InvitationStatusResult {
  valid: boolean;
  invitation?: InvitationRecord;
  tenant?: AdapterTenant;
  error?: string;
}

/**
 * Invitation Service
 */
export class InvitationService {
  private storage: KVStorage;
  private adapter: AuthAdapter;
  private config: Required<InvitationConfig>;

  constructor(
    storage: KVStorage,
    adapter: AuthAdapter,
    config: InvitationConfig
  ) {
    this.storage = storage;
    this.adapter = adapter;
    this.config = {
      callbackPath: '/auth/invitation',
      expiresIn: 604800, // 7 days
      tokenLength: 32,
      ...config,
    };
  }

  /**
   * Send an invitation to join a tenant
   */
  async sendInvitation(input: SendInvitationInput): Promise<SendInvitationResult> {
    const normalizedEmail = input.email.toLowerCase().trim();

    // Check if user is already a member
    const existingUser = await this.adapter.findUserByEmail(normalizedEmail);
    if (existingUser) {
      const membership = await this.adapter.findMembership?.(existingUser.id, input.tenantId);
      if (membership && membership.status === 'active') {
        return { success: false, error: 'User is already a member of this tenant' };
      }
    }

    // Check for existing pending invitation
    const existingInvitation = await this.getInvitationByEmail(normalizedEmail, input.tenantId);
    if (existingInvitation && existingInvitation.status === 'pending') {
      // Cancel old invitation
      await this.cancelInvitation(existingInvitation.id);
    }

    // Generate secure token
    const token = await generateRandomHex(this.config.tokenLength);
    const tokenHash = await sha256Hex(token);
    const id = await generateRandomHex(16);

    // Calculate expiration
    const expiresAt = new Date(Date.now() + this.config.expiresIn * 1000);

    // Create invitation record
    const invitation: InvitationRecord = {
      id,
      email: normalizedEmail,
      tenantId: input.tenantId,
      role: input.role,
      permissions: input.permissions,
      invitedBy: input.invitedBy,
      tokenHash,
      expiresAt: expiresAt.toISOString(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      message: input.message,
    };

    // Store invitation
    await this.storage.set(
      `invitation:hash:${tokenHash}`,
      invitation,
      this.config.expiresIn
    );
    await this.storage.set(
      `invitation:id:${id}`,
      invitation,
      this.config.expiresIn
    );
    await this.storage.set(
      `invitation:email:${normalizedEmail}:${input.tenantId}`,
      id,
      this.config.expiresIn
    );

    // Build invitation URL
    const params = new URLSearchParams({ token });
    const invitationUrl = `${this.config.baseUrl}${this.config.callbackPath}?${params}`;

    return {
      success: true,
      invitation,
      invitationUrl,
      token,
    };
  }

  /**
   * Accept an invitation
   */
  async acceptInvitation(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
    const tokenHash = await sha256Hex(input.token);

    // Get invitation
    const invitation = await this.storage.get<InvitationRecord>(`invitation:hash:${tokenHash}`);

    if (!invitation) {
      return { success: false, error: 'Invalid or expired invitation' };
    }

    if (invitation.status !== 'pending') {
      return { success: false, error: `Invitation is ${invitation.status}` };
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      // Mark as expired
      invitation.status = 'expired';
      await this.updateInvitation(invitation);
      return { success: false, error: 'Invitation has expired' };
    }

    // Check if user is already a member
    const existingMembership = await this.adapter.findMembership?.(
      input.userId,
      invitation.tenantId
    );
    if (existingMembership && existingMembership.status === 'active') {
      return { success: false, error: 'You are already a member of this tenant' };
    }

    // Create or update membership
    let membership: AdapterMembership;
    if (existingMembership) {
      // Reactivate existing membership
      membership = await this.adapter.updateMembership!(existingMembership.id, {
        role: invitation.role,
        permissions: invitation.permissions,
        status: 'active',
      });
    } else {
      // Create new membership
      membership = await this.adapter.createMembership!({
        userId: input.userId,
        tenantId: invitation.tenantId,
        role: invitation.role,
        permissions: invitation.permissions,
      });
    }

    // Mark invitation as accepted
    invitation.status = 'accepted';
    invitation.acceptedAt = new Date().toISOString();
    invitation.acceptedBy = input.userId;
    await this.updateInvitation(invitation);

    // Get tenant info
    const tenant = await this.adapter.findTenantById?.(invitation.tenantId);

    return {
      success: true,
      membership,
      tenant: tenant ?? undefined,
    };
  }

  /**
   * Check invitation status
   */
  async checkInvitation(token: string): Promise<InvitationStatusResult> {
    const tokenHash = await sha256Hex(token);

    const invitation = await this.storage.get<InvitationRecord>(`invitation:hash:${tokenHash}`);

    if (!invitation) {
      return { valid: false, error: 'Invalid or expired invitation' };
    }

    if (invitation.status !== 'pending') {
      return { valid: false, error: `Invitation is ${invitation.status}`, invitation };
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      invitation.status = 'expired';
      await this.updateInvitation(invitation);
      return { valid: false, error: 'Invitation has expired', invitation };
    }

    // Get tenant info
    const tenant = await this.adapter.findTenantById?.(invitation.tenantId);

    return {
      valid: true,
      invitation,
      tenant: tenant ?? undefined,
    };
  }

  /**
   * Cancel an invitation
   */
  async cancelInvitation(invitationId: string): Promise<boolean> {
    const invitation = await this.storage.get<InvitationRecord>(`invitation:id:${invitationId}`);

    if (!invitation) {
      return false;
    }

    if (invitation.status !== 'pending') {
      return false;
    }

    invitation.status = 'cancelled';
    await this.updateInvitation(invitation);

    return true;
  }

  /**
   * Get invitation by ID
   */
  async getInvitationById(id: string): Promise<InvitationRecord | null> {
    return this.storage.get<InvitationRecord>(`invitation:id:${id}`);
  }

  /**
   * Get invitation by email and tenant
   */
  async getInvitationByEmail(
    email: string,
    tenantId: string
  ): Promise<InvitationRecord | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const invitationId = await this.storage.get<string>(
      `invitation:email:${normalizedEmail}:${tenantId}`
    );

    if (!invitationId) {
      return null;
    }

    return this.getInvitationById(invitationId);
  }

  /**
   * Resend invitation (generates new token)
   */
  async resendInvitation(
    invitationId: string,
    invitedBy: string
  ): Promise<SendInvitationResult> {
    const invitation = await this.getInvitationById(invitationId);

    if (!invitation) {
      return { success: false, error: 'Invitation not found' };
    }

    if (invitation.status !== 'pending') {
      return { success: false, error: `Cannot resend ${invitation.status} invitation` };
    }

    // Cancel old invitation and create new one
    await this.cancelInvitation(invitationId);

    return this.sendInvitation({
      email: invitation.email,
      tenantId: invitation.tenantId,
      role: invitation.role,
      permissions: invitation.permissions,
      invitedBy,
      message: invitation.message,
    });
  }

  /**
   * Get pending invitations for a tenant
   * Note: This requires listing keys which may not be efficient for all storage backends
   */
  async getPendingInvitations(_tenantId: string): Promise<InvitationRecord[]> {
    // This is a placeholder - ideally the storage should support this
    // For now, return empty array
    console.warn(
      'getPendingInvitations: Consider implementing list operation in storage'
    );
    return [];
  }

  /**
   * Update invitation record
   */
  private async updateInvitation(invitation: InvitationRecord): Promise<void> {
    const ttl = Math.max(
      0,
      Math.floor((new Date(invitation.expiresAt).getTime() - Date.now()) / 1000)
    );

    await this.storage.set(`invitation:id:${invitation.id}`, invitation, ttl || 300);
    await this.storage.set(
      `invitation:hash:${invitation.tokenHash}`,
      invitation,
      ttl || 300
    );
  }
}

/**
 * Create invitation service
 */
export function createInvitationService(
  storage: KVStorage,
  adapter: AuthAdapter,
  config: InvitationConfig
): InvitationService {
  return new InvitationService(storage, adapter, config);
}
