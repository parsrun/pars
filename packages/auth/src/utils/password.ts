/**
 * Password Hashing Utilities
 * Uses Web Crypto API for edge compatibility
 */

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Hash a password using PBKDF2
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    KEY_LENGTH * 8
  );

  const hash = new Uint8Array(derivedBits);
  const combined = new Uint8Array(salt.length + hash.length);
  combined.set(salt);
  combined.set(hash, salt.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    const combined = Uint8Array.from(atob(storedHash), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, SALT_LENGTH);
    const storedKey = combined.slice(SALT_LENGTH);

    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      passwordKey,
      KEY_LENGTH * 8
    );

    const derivedKey = new Uint8Array(derivedBits);

    // Constant-time comparison
    if (derivedKey.length !== storedKey.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < derivedKey.length; i++) {
      result |= derivedKey[i]! ^ storedKey[i]!;
    }

    return result === 0;
  } catch {
    return false;
  }
}

/**
 * Check password strength
 */
export interface PasswordStrengthResult {
  score: number; // 0-4
  feedback: string[];
  isStrong: boolean;
}

export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) {
    score++;
  } else {
    feedback.push("Password should be at least 8 characters");
  }

  if (password.length >= 12) {
    score++;
  }

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score++;
  } else {
    feedback.push("Include both uppercase and lowercase letters");
  }

  if (/\d/.test(password)) {
    score++;
  } else {
    feedback.push("Include at least one number");
  }

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score++;
  } else {
    feedback.push("Include at least one special character");
  }

  // Check for common patterns
  const commonPatterns = [
    /^123/,
    /password/i,
    /qwerty/i,
    /abc123/i,
    /(.)\1{2,}/, // Repeated characters
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      score = Math.max(0, score - 1);
      feedback.push("Avoid common patterns");
      break;
    }
  }

  return {
    score: Math.min(4, score),
    feedback,
    isStrong: score >= 3,
  };
}
