/**
 * WebAuthn Provider (Passkeys)
 * FIDO2 passwordless authentication
 */

import type { KVStorage } from '../../storage/types.js';
import type { TwoFactorProvider, TwoFactorSetupResult, ProviderInfo, AuthInput, AuthResult } from '../base.js';

/**
 * WebAuthn Configuration
 */
export interface WebAuthnConfig {
  /** Relying Party name (your app name) */
  rpName: string;
  /** Relying Party ID (domain without protocol) */
  rpId: string;
  /** Full origin (e.g., https://example.com) */
  origin: string;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Attestation preference (default: none) */
  attestation?: 'none' | 'indirect' | 'direct';
  /** User verification preference (default: preferred) */
  userVerification?: 'required' | 'preferred' | 'discouraged';
}

/**
 * Registration options returned to client
 */
export interface RegistrationOptions {
  challenge: string;
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  timeout: number;
  attestation: 'none' | 'indirect' | 'direct';
  authenticatorSelection: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    residentKey: 'required' | 'preferred' | 'discouraged';
    userVerification: 'required' | 'preferred' | 'discouraged';
  };
  excludeCredentials: Array<{ id: string; type: 'public-key'; transports?: string[] }>;
}

/**
 * Authentication options returned to client
 */
export interface AuthenticationOptions {
  challenge: string;
  timeout: number;
  rpId: string;
  allowCredentials: Array<{ id: string; type: 'public-key'; transports?: string[] }>;
  userVerification: 'required' | 'preferred' | 'discouraged';
}

/**
 * Registration response from client
 */
export interface RegistrationResponse {
  id: string;
  rawId: string;
  type: 'public-key';
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
}

/**
 * Authentication response from client
 */
export interface AuthenticationResponse {
  id: string;
  rawId: string;
  type: 'public-key';
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
}

/**
 * Client data JSON structure
 */
export interface ClientDataJSON {
  type: 'webauthn.create' | 'webauthn.get';
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
}

/**
 * Authenticator data structure
 */
export interface AuthenticatorData {
  rpIdHash: Uint8Array;
  flags: {
    userPresent: boolean;
    userVerified: boolean;
    attestedCredentialData: boolean;
    extensionDataIncluded?: boolean;
  };
  signCount: number;
  attestedCredentialData?: {
    aaguid: Uint8Array;
    credentialId: Uint8Array;
    publicKey: Uint8Array;
  };
}

/**
 * Stored credential (exported as WebAuthnCredential)
 */
export interface WebAuthnCredential {
  id: string;
  credentialId: string;
  userId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  name: string;
  deviceType?: string;
  createdAt: string;
  lastUsedAt?: string;
}

/**
 * Pending challenge
 */
interface PendingChallenge {
  challenge: string;
  userId?: string;
  type: 'registration' | 'authentication';
  expiresAt: string;
}

/**
 * Base64URL encode
 */
function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Generate secure random challenge
 */
function generateChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Parse authenticator data (simplified)
 */
function parseAuthenticatorData(data: Uint8Array): {
  rpIdHash: Uint8Array;
  flags: {
    userPresent: boolean;
    userVerified: boolean;
    attestedCredentialData: boolean;
  };
  signCount: number;
  attestedCredentialData?: {
    aaguid: Uint8Array;
    credentialId: Uint8Array;
    publicKey: Uint8Array;
  };
} {
  const rpIdHash = data.slice(0, 32);
  const flagsByte = data[32]!;
  const flags = {
    userPresent: (flagsByte & 0x01) !== 0,
    userVerified: (flagsByte & 0x04) !== 0,
    attestedCredentialData: (flagsByte & 0x40) !== 0,
  };

  const signCount = new DataView(data.buffer, data.byteOffset + 33, 4).getUint32(0, false);

  let attestedCredentialData;
  if (flags.attestedCredentialData && data.length > 37) {
    const aaguid = data.slice(37, 53);
    const credentialIdLength = new DataView(data.buffer, data.byteOffset + 53, 2).getUint16(0, false);
    const credentialId = data.slice(55, 55 + credentialIdLength);
    const publicKey = data.slice(55 + credentialIdLength);

    attestedCredentialData = { aaguid, credentialId, publicKey };
  }

  return { rpIdHash, flags, signCount, attestedCredentialData };
}

/**
 * Simple CBOR map parser for attestation object
 */
function parseCBORMap(data: Uint8Array): Record<string, Uint8Array> {
  const result: Record<string, Uint8Array> = {};
  let offset = 0;

  // Expect map (0xa0 - 0xbf)
  const initial = data[offset++]!;
  if ((initial & 0xe0) !== 0xa0) {
    throw new Error('Expected CBOR map');
  }

  const mapSize = initial & 0x1f;

  for (let i = 0; i < mapSize; i++) {
    // Read key (text string)
    const keyInitial = data[offset++]!;
    const keyLength = keyInitial & 0x1f;
    const key = new TextDecoder().decode(data.slice(offset, offset + keyLength));
    offset += keyLength;

    // Read value (byte string)
    const valueInitial = data[offset++]!;
    let valueLength: number;

    if ((valueInitial & 0x1f) < 24) {
      valueLength = valueInitial & 0x1f;
    } else if ((valueInitial & 0x1f) === 24) {
      valueLength = data[offset++]!;
    } else if ((valueInitial & 0x1f) === 25) {
      valueLength = (data[offset++]! << 8) | data[offset++]!;
    } else {
      throw new Error('Unsupported CBOR value length');
    }

    result[key] = data.slice(offset, offset + valueLength);
    offset += valueLength;
  }

  return result;
}

/**
 * Compare array buffers
 */
function arrayBufferEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  for (let i = 0; i < viewA.length; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
}

/**
 * WebAuthn Provider
 */
export class WebAuthnProvider implements TwoFactorProvider {
  readonly name = 'webauthn';
  readonly type = 'webauthn' as const;

  private storage: KVStorage;
  private config: Required<WebAuthnConfig>;
  private _enabled: boolean = true;

  constructor(storage: KVStorage, config: WebAuthnConfig) {
    this.storage = storage;
    this.config = {
      timeout: 60000,
      attestation: 'none',
      userVerification: 'preferred',
      ...config,
    };
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Generate registration options
   */
  async generateRegistrationOptions(
    userId: string,
    userName: string,
    userDisplayName: string,
    authenticatorType?: 'platform' | 'cross-platform'
  ): Promise<RegistrationOptions> {
    const challenge = generateChallenge();

    // Get existing credentials to exclude
    const existingCredentials = await this.getUserCredentials(userId);

    // Store challenge
    const challengeData: PendingChallenge = {
      challenge,
      userId,
      type: 'registration',
      expiresAt: new Date(Date.now() + this.config.timeout).toISOString(),
    };
    await this.storage.set(`webauthn:challenge:${challenge}`, challengeData, this.config.timeout / 1000);

    return {
      challenge,
      rp: {
        name: this.config.rpName,
        id: this.config.rpId,
      },
      user: {
        id: base64UrlEncode(new TextEncoder().encode(userId)),
        name: userName,
        displayName: userDisplayName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      timeout: this.config.timeout,
      attestation: this.config.attestation,
      authenticatorSelection: {
        authenticatorAttachment: authenticatorType,
        residentKey: 'preferred',
        userVerification: this.config.userVerification,
      },
      excludeCredentials: existingCredentials.map((cred) => ({
        id: cred.credentialId,
        type: 'public-key' as const,
        transports: cred.transports,
      })),
    };
  }

  /**
   * Verify registration response
   */
  async verifyRegistration(
    response: RegistrationResponse,
    challenge: string,
    credentialName?: string
  ): Promise<{ success: boolean; credentialId?: string; error?: string }> {
    // Get and verify challenge
    const pending = await this.storage.get<PendingChallenge>(`webauthn:challenge:${challenge}`);
    if (!pending || new Date(pending.expiresAt) < new Date()) {
      return { success: false, error: 'Invalid or expired challenge' };
    }

    const userId = pending.userId;
    if (!userId) {
      return { success: false, error: 'No user ID in challenge' };
    }

    // Parse client data
    const clientDataJSON = base64UrlDecode(response.response.clientDataJSON);
    const clientData = JSON.parse(new TextDecoder().decode(clientDataJSON)) as Record<string, unknown>;

    // Verify client data
    if (clientData['type'] !== 'webauthn.create') {
      return { success: false, error: 'Invalid client data type' };
    }

    if (clientData['challenge'] !== challenge) {
      return { success: false, error: 'Challenge mismatch' };
    }

    if (clientData['origin'] !== this.config.origin) {
      return { success: false, error: 'Origin mismatch' };
    }

    // Parse attestation object
    const attestationObject = base64UrlDecode(response.response.attestationObject);
    let authData: Uint8Array;

    try {
      const attestation = parseCBORMap(attestationObject);
      authData = attestation['authData']!;
    } catch {
      return { success: false, error: 'Failed to parse attestation object' };
    }

    // Parse authenticator data
    const parsedAuthData = parseAuthenticatorData(authData);

    // Verify RP ID hash
    const expectedRpIdHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(this.config.rpId)
    );
    if (!arrayBufferEqual(parsedAuthData.rpIdHash.buffer as ArrayBuffer, expectedRpIdHash)) {
      return { success: false, error: 'RP ID hash mismatch' };
    }

    // Verify user presence
    if (!parsedAuthData.flags.userPresent) {
      return { success: false, error: 'User not present' };
    }

    // Get credential data
    if (!parsedAuthData.attestedCredentialData) {
      return { success: false, error: 'No credential data' };
    }

    const { credentialId, publicKey } = parsedAuthData.attestedCredentialData;
    const credentialIdBase64 = base64UrlEncode(credentialId);
    const publicKeyBase64 = base64UrlEncode(publicKey);

    // Check if credential already exists
    const existing = await this.storage.get<WebAuthnCredential>(`webauthn:cred:${credentialIdBase64}`);
    if (existing) {
      return { success: false, error: 'Credential already registered' };
    }

    // Store credential
    const credential: WebAuthnCredential = {
      id: crypto.randomUUID(),
      credentialId: credentialIdBase64,
      userId,
      publicKey: publicKeyBase64,
      counter: parsedAuthData.signCount,
      transports: response.response.transports ?? [],
      name: credentialName ?? 'Passkey',
      createdAt: new Date().toISOString(),
    };

    await this.storage.set(`webauthn:cred:${credentialIdBase64}`, credential);

    // Add to user's credential list
    const userCredIds = await this.storage.get<string[]>(`webauthn:user:${userId}`) ?? [];
    userCredIds.push(credentialIdBase64);
    await this.storage.set(`webauthn:user:${userId}`, userCredIds);

    // Clean up challenge
    await this.storage.delete(`webauthn:challenge:${challenge}`);

    return { success: true, credentialId: credentialIdBase64 };
  }

  /**
   * Generate authentication options
   */
  async generateAuthenticationOptions(userId?: string): Promise<AuthenticationOptions> {
    const challenge = generateChallenge();

    // Store challenge
    const challengeData: PendingChallenge = {
      challenge,
      userId,
      type: 'authentication',
      expiresAt: new Date(Date.now() + this.config.timeout).toISOString(),
    };
    await this.storage.set(`webauthn:challenge:${challenge}`, challengeData, this.config.timeout / 1000);

    let allowCredentials: AuthenticationOptions['allowCredentials'] = [];

    if (userId) {
      const userCredentials = await this.getUserCredentials(userId);
      allowCredentials = userCredentials.map((cred) => ({
        id: cred.credentialId,
        type: 'public-key' as const,
        transports: cred.transports,
      }));
    }

    return {
      challenge,
      timeout: this.config.timeout,
      rpId: this.config.rpId,
      allowCredentials,
      userVerification: this.config.userVerification,
    };
  }

  /**
   * Verify authentication response
   */
  async verifyAuthentication(
    response: AuthenticationResponse,
    challenge: string
  ): Promise<{ success: boolean; userId?: string; credentialId?: string; error?: string }> {
    // Get and verify challenge
    const pending = await this.storage.get<PendingChallenge>(`webauthn:challenge:${challenge}`);
    if (!pending || new Date(pending.expiresAt) < new Date()) {
      return { success: false, error: 'Invalid or expired challenge' };
    }

    // Get credential
    const credential = await this.storage.get<WebAuthnCredential>(`webauthn:cred:${response.id}`);
    if (!credential) {
      return { success: false, error: 'Credential not found' };
    }

    // Parse client data
    const clientDataJSON = base64UrlDecode(response.response.clientDataJSON);
    const clientData = JSON.parse(new TextDecoder().decode(clientDataJSON)) as Record<string, unknown>;

    // Verify client data
    if (clientData['type'] !== 'webauthn.get') {
      return { success: false, error: 'Invalid client data type' };
    }

    if (clientData['challenge'] !== challenge) {
      return { success: false, error: 'Challenge mismatch' };
    }

    if (clientData['origin'] !== this.config.origin) {
      return { success: false, error: 'Origin mismatch' };
    }

    // Parse authenticator data
    const authenticatorData = base64UrlDecode(response.response.authenticatorData);
    const parsedAuthData = parseAuthenticatorData(authenticatorData);

    // Verify RP ID hash
    const expectedRpIdHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(this.config.rpId)
    );
    if (!arrayBufferEqual(parsedAuthData.rpIdHash.buffer as ArrayBuffer, expectedRpIdHash)) {
      return { success: false, error: 'RP ID hash mismatch' };
    }

    // Verify user presence
    if (!parsedAuthData.flags.userPresent) {
      return { success: false, error: 'User not present' };
    }

    // Verify counter (replay protection)
    if (parsedAuthData.signCount > 0 && parsedAuthData.signCount <= credential.counter) {
      return { success: false, error: 'Possible credential cloning detected' };
    }

    // Update counter and last used
    credential.counter = parsedAuthData.signCount;
    credential.lastUsedAt = new Date().toISOString();
    await this.storage.set(`webauthn:cred:${response.id}`, credential);

    // Clean up challenge
    await this.storage.delete(`webauthn:challenge:${challenge}`);

    return {
      success: true,
      userId: credential.userId,
      credentialId: credential.credentialId,
    };
  }

  /**
   * Get user's credentials
   */
  async getUserCredentials(userId: string): Promise<WebAuthnCredential[]> {
    const credIds = await this.storage.get<string[]>(`webauthn:user:${userId}`) ?? [];
    const credentials: WebAuthnCredential[] = [];

    for (const credId of credIds) {
      const cred = await this.storage.get<WebAuthnCredential>(`webauthn:cred:${credId}`);
      if (cred) {
        credentials.push(cred);
      }
    }

    return credentials;
  }

  /**
   * Remove a credential
   */
  async removeCredential(userId: string, credentialId: string): Promise<boolean> {
    const credential = await this.storage.get<WebAuthnCredential>(`webauthn:cred:${credentialId}`);
    if (!credential || credential.userId !== userId) {
      return false;
    }

    await this.storage.delete(`webauthn:cred:${credentialId}`);

    // Remove from user's list
    const credIds = await this.storage.get<string[]>(`webauthn:user:${userId}`) ?? [];
    const filtered = credIds.filter((id) => id !== credentialId);
    await this.storage.set(`webauthn:user:${userId}`, filtered);

    return true;
  }

  /**
   * Check if user has any passkeys
   */
  async hasPasskeys(userId: string): Promise<boolean> {
    const credentials = await this.getUserCredentials(userId);
    return credentials.length > 0;
  }

  /**
   * Setup (for TwoFactorProvider interface)
   */
  async setup(userId: string): Promise<TwoFactorSetupResult> {
    const options = await this.generateRegistrationOptions(userId, userId, userId);
    return {
      secret: options.challenge,
      qrCode: '', // Not applicable for WebAuthn
      backupCodes: [],
      challenge: options.challenge,
    };
  }

  /**
   * Verify setup (for TwoFactorProvider interface)
   */
  async verifySetup(userId: string, _code: string): Promise<boolean> {
    // For WebAuthn, the registration is already stored on success
    const credentials = await this.getUserCredentials(userId);
    return credentials.length > 0;
  }

  /**
   * Verify login (for TwoFactorProvider interface)
   */
  async verifyLogin(userId: string, _code: string): Promise<boolean> {
    // For WebAuthn, verification happens through verifyAuthentication
    const credentials = await this.getUserCredentials(userId);
    return credentials.length > 0;
  }

  /**
   * Disable 2FA for user
   */
  async disable(userId: string): Promise<void> {
    const credentials = await this.getUserCredentials(userId);
    for (const cred of credentials) {
      await this.removeCredential(userId, cred.credentialId);
    }
  }

  /**
   * Authenticate (for AuthProvider interface)
   */
  async authenticate(_input: AuthInput): Promise<AuthResult> {
    // WebAuthn authentication is handled through generateAuthenticationOptions/verifyAuthentication
    return {
      success: false,
      error: 'Use generateAuthenticationOptions and verifyAuthentication for WebAuthn authentication',
      errorCode: 'USE_WEBAUTHN_METHODS',
    };
  }

  /**
   * Get provider info
   */
  getInfo(): ProviderInfo {
    return {
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      displayName: 'Passkey',
    };
  }
}

/**
 * Create WebAuthn provider
 */
export function createWebAuthnProvider(storage: KVStorage, config: WebAuthnConfig): WebAuthnProvider {
  return new WebAuthnProvider(storage, config);
}
