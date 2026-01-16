/**
 * Cookie Utilities
 */

import type { CookieConfig } from "../types.js";

export interface CookieOptions {
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
}

const DEFAULT_COOKIE_CONFIG: Required<CookieConfig> = {
  prefix: "pars",
  domain: "",
  path: "/",
  secure: true,
  sameSite: "lax",
  httpOnly: true,
};

export function createCookieManager(config: CookieConfig = {}) {
  const cookieConfig = { ...DEFAULT_COOKIE_CONFIG, ...config };

  function getCookieName(name: string): string {
    return `${cookieConfig.prefix}_${name}`;
  }

  function serializeCookie(
    name: string,
    value: string,
    options: CookieOptions = {}
  ): string {
    const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

    const opts = {
      path: cookieConfig.path,
      domain: cookieConfig.domain,
      secure: cookieConfig.secure,
      httpOnly: cookieConfig.httpOnly,
      sameSite: cookieConfig.sameSite,
      ...options,
    };

    if (opts.maxAge !== undefined) {
      parts.push(`Max-Age=${opts.maxAge}`);
    }

    if (opts.expires) {
      parts.push(`Expires=${opts.expires.toUTCString()}`);
    }

    if (opts.path) {
      parts.push(`Path=${opts.path}`);
    }

    if (opts.domain) {
      parts.push(`Domain=${opts.domain}`);
    }

    if (opts.secure) {
      parts.push("Secure");
    }

    if (opts.httpOnly) {
      parts.push("HttpOnly");
    }

    if (opts.sameSite) {
      parts.push(`SameSite=${opts.sameSite}`);
    }

    return parts.join("; ");
  }

  function parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};

    if (!cookieHeader) {
      return cookies;
    }

    for (const part of cookieHeader.split(";")) {
      const [key, ...valueParts] = part.trim().split("=");
      if (key) {
        const value = valueParts.join("=");
        cookies[decodeURIComponent(key)] = decodeURIComponent(value || "");
      }
    }

    return cookies;
  }

  function deleteCookie(name: string): string {
    return serializeCookie(name, "", {
      maxAge: 0,
      expires: new Date(0),
    });
  }

  return {
    getCookieName,
    serializeCookie,
    parseCookies,
    deleteCookie,
    config: cookieConfig,
  };
}

export type CookieManager = ReturnType<typeof createCookieManager>;
