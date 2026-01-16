/**
 * @parsrun/email - Email Templates
 * Pre-built templates for common email use cases
 */

import type { EmailTemplate, TemplateData } from "../types.js";

/**
 * Renders a template string by replacing placeholders with data values.
 *
 * Uses a simple mustache-like syntax where `{{key}}` is replaced with the value
 * of `data.key`. Supports nested keys like `{{user.name}}`.
 *
 * @param template - The template string containing placeholders
 * @param data - The data object containing values to substitute
 * @returns The rendered string with placeholders replaced by values
 *
 * @example
 * ```typescript
 * const result = renderTemplate("Hello {{name}}!", { name: "World" });
 * // result: "Hello World!"
 * ```
 */
export function renderTemplate(template: string, data: TemplateData): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path: string) => {
    const keys = path.split(".");
    let value: unknown = data;

    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return `{{${path}}}`; // Keep original if not found
      }
    }

    return String(value ?? "");
  });
}

/**
 * Wraps email content in a responsive HTML template with consistent styling.
 *
 * Provides a professional email layout with header branding, content area,
 * and footer. Styles are inlined for maximum email client compatibility.
 *
 * @param content - The HTML content to wrap
 * @param options - Optional branding configuration
 * @param options.brandName - The brand name to display in header (defaults to "Pars")
 * @param options.brandColor - The primary brand color for styling (defaults to "#0070f3")
 * @param options.footerText - Custom footer text (defaults to copyright notice)
 * @returns Complete HTML email document
 *
 * @example
 * ```typescript
 * const html = wrapEmailHtml("<h1>Hello!</h1>", {
 *   brandName: "My App",
 *   brandColor: "#ff0000",
 * });
 * ```
 */
export function wrapEmailHtml(content: string, options?: {
  brandName?: string | undefined;
  brandColor?: string | undefined;
  footerText?: string | undefined;
}): string {
  const { brandName = "Pars", brandColor = "#0070f3", footerText } = options ?? {};

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      padding: 40px;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .brand {
      font-size: 24px;
      font-weight: 700;
      color: ${brandColor};
    }
    .content {
      margin-bottom: 32px;
    }
    .code-box {
      background: #f8f9fa;
      border: 2px dashed #dee2e6;
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      margin: 24px 0;
    }
    .code {
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 8px;
      color: ${brandColor};
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    }
    .button {
      display: inline-block;
      background: ${brandColor};
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 6px;
      font-weight: 600;
      margin: 16px 0;
    }
    .button:hover {
      opacity: 0.9;
    }
    .footer {
      text-align: center;
      color: #666;
      font-size: 13px;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #eee;
    }
    .footer a {
      color: ${brandColor};
    }
    .text-muted {
      color: #666;
      font-size: 14px;
    }
    .text-center {
      text-align: center;
    }
    h1 {
      font-size: 24px;
      margin: 0 0 16px 0;
      color: #111;
    }
    p {
      margin: 0 0 16px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="brand">${brandName}</div>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        ${footerText ?? `&copy; ${new Date().getFullYear()} ${brandName}. All rights reserved.`}
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================================
// OTP Templates
// ============================================================================

/**
 * Data required for rendering OTP (One-Time Password) email templates.
 */
export interface OTPTemplateData extends TemplateData {
  /** The verification code to display */
  code: string;
  /** Expiration time in minutes (defaults to 10) */
  expiresInMinutes?: number;
  /** Brand name for email header */
  brandName?: string;
  /** Brand color for styling */
  brandColor?: string;
}

/**
 * Pre-built email template for OTP verification codes.
 *
 * Displays a large, easily copyable verification code with expiration notice.
 */
export const otpTemplate: EmailTemplate = {
  name: "otp",
  subject: "Your verification code: {{code}}",
  html: `
<h1>Your verification code</h1>
<p>Use the following code to verify your identity:</p>
<div class="code-box">
  <span class="code">{{code}}</span>
</div>
<p class="text-muted">This code expires in {{expiresInMinutes}} minutes.</p>
<p class="text-muted">If you didn't request this code, you can safely ignore this email.</p>
`,
  text: `Your verification code: {{code}}

This code expires in {{expiresInMinutes}} minutes.

If you didn't request this code, you can safely ignore this email.`,
};

/**
 * Renders an OTP verification email with the provided data.
 *
 * @param data - The template data including verification code and branding options
 * @returns Rendered email with subject, HTML body, and plain text body
 *
 * @example
 * ```typescript
 * const email = renderOTPEmail({
 *   code: "123456",
 *   expiresInMinutes: 15,
 *   brandName: "My App",
 * });
 * await emailService.send({
 *   to: "user@example.com",
 *   ...email,
 * });
 * ```
 */
export function renderOTPEmail(data: OTPTemplateData): { subject: string; html: string; text: string } {
  const templateData = {
    ...data,
    expiresInMinutes: data.expiresInMinutes ?? 10,
  };

  return {
    subject: renderTemplate(otpTemplate.subject, templateData),
    html: wrapEmailHtml(renderTemplate(otpTemplate.html, templateData), {
      brandName: data.brandName,
      brandColor: data.brandColor,
    }),
    text: renderTemplate(otpTemplate.text ?? "", templateData),
  };
}

// ============================================================================
// Magic Link Templates
// ============================================================================

/**
 * Data required for rendering magic link email templates.
 */
export interface MagicLinkTemplateData extends TemplateData {
  /** The magic link URL for sign-in */
  url: string;
  /** Expiration time in minutes (defaults to 15) */
  expiresInMinutes?: number;
  /** Brand name for email header and subject */
  brandName?: string;
  /** Brand color for styling */
  brandColor?: string;
}

/**
 * Pre-built email template for passwordless magic link sign-in.
 *
 * Provides a prominent sign-in button with fallback URL text.
 */
export const magicLinkTemplate: EmailTemplate = {
  name: "magic-link",
  subject: "Sign in to {{brandName}}",
  html: `
<h1>Sign in to your account</h1>
<p>Click the button below to securely sign in to your account:</p>
<div class="text-center">
  <a href="{{url}}" class="button">Sign In</a>
</div>
<p class="text-muted">This link expires in {{expiresInMinutes}} minutes.</p>
<p class="text-muted">If you didn't request this link, you can safely ignore this email.</p>
<p class="text-muted" style="margin-top: 24px; font-size: 12px;">
  If the button doesn't work, copy and paste this URL into your browser:<br>
  <a href="{{url}}">{{url}}</a>
</p>
`,
  text: `Sign in to {{brandName}}

Click this link to sign in:
{{url}}

This link expires in {{expiresInMinutes}} minutes.

If you didn't request this link, you can safely ignore this email.`,
};

/**
 * Renders a magic link sign-in email with the provided data.
 *
 * @param data - The template data including magic link URL and branding options
 * @returns Rendered email with subject, HTML body, and plain text body
 *
 * @example
 * ```typescript
 * const email = renderMagicLinkEmail({
 *   url: "https://example.com/auth/verify?token=abc123",
 *   brandName: "My App",
 * });
 * ```
 */
export function renderMagicLinkEmail(data: MagicLinkTemplateData): { subject: string; html: string; text: string } {
  const templateData = {
    ...data,
    brandName: data.brandName ?? "Pars",
    expiresInMinutes: data.expiresInMinutes ?? 15,
  };

  return {
    subject: renderTemplate(magicLinkTemplate.subject, templateData),
    html: wrapEmailHtml(renderTemplate(magicLinkTemplate.html, templateData), {
      brandName: templateData.brandName,
      brandColor: data.brandColor,
    }),
    text: renderTemplate(magicLinkTemplate.text ?? "", templateData),
  };
}

// ============================================================================
// Email Verification Templates
// ============================================================================

/**
 * Data required for rendering email verification templates.
 */
export interface VerificationTemplateData extends TemplateData {
  /** The verification URL */
  url: string;
  /** User's name for personalized greeting (optional) */
  name?: string;
  /** Expiration time in hours (defaults to 24) */
  expiresInHours?: number;
  /** Brand name for email header */
  brandName?: string;
  /** Brand color for styling */
  brandColor?: string;
}

/**
 * Pre-built email template for email address verification.
 *
 * Used when users need to confirm their email address after registration.
 */
export const verificationTemplate: EmailTemplate = {
  name: "verification",
  subject: "Verify your email address",
  html: `
<h1>Verify your email</h1>
<p>Hi{{#name}} {{name}}{{/name}},</p>
<p>Please verify your email address by clicking the button below:</p>
<div class="text-center">
  <a href="{{url}}" class="button">Verify Email</a>
</div>
<p class="text-muted">This link expires in {{expiresInHours}} hours.</p>
<p class="text-muted" style="margin-top: 24px; font-size: 12px;">
  If the button doesn't work, copy and paste this URL into your browser:<br>
  <a href="{{url}}">{{url}}</a>
</p>
`,
  text: `Verify your email address

Hi{{#name}} {{name}}{{/name}},

Please verify your email address by clicking this link:
{{url}}

This link expires in {{expiresInHours}} hours.`,
};

/**
 * Renders an email verification email with the provided data.
 *
 * @param data - The template data including verification URL and optional user name
 * @returns Rendered email with subject, HTML body, and plain text body
 *
 * @example
 * ```typescript
 * const email = renderVerificationEmail({
 *   url: "https://example.com/verify?token=abc123",
 *   name: "John",
 * });
 * ```
 */
export function renderVerificationEmail(data: VerificationTemplateData): { subject: string; html: string; text: string } {
  const templateData = {
    ...data,
    expiresInHours: data.expiresInHours ?? 24,
  };

  // Handle conditional name
  let html = verificationTemplate.html
    .replace(/\{\{#name\}\}(.*?)\{\{\/name\}\}/gs, data.name ? "$1" : "");
  let text = (verificationTemplate.text ?? "")
    .replace(/\{\{#name\}\}(.*?)\{\{\/name\}\}/gs, data.name ? "$1" : "");

  html = renderTemplate(html, templateData);
  text = renderTemplate(text, templateData);

  return {
    subject: renderTemplate(verificationTemplate.subject, templateData),
    html: wrapEmailHtml(html, {
      brandName: data.brandName,
      brandColor: data.brandColor,
    }),
    text,
  };
}

// ============================================================================
// Welcome Templates
// ============================================================================

/**
 * Data required for rendering welcome email templates.
 */
export interface WelcomeTemplateData extends TemplateData {
  /** User's name for personalized greeting (optional) */
  name?: string;
  /** URL to the user's dashboard or login page (optional) */
  loginUrl?: string;
  /** Brand name for email header */
  brandName?: string;
  /** Brand color for styling */
  brandColor?: string;
}

/**
 * Pre-built email template for welcoming new users.
 *
 * Sent after successful registration to greet users and provide next steps.
 */
export const welcomeTemplate: EmailTemplate = {
  name: "welcome",
  subject: "Welcome to {{brandName}}!",
  html: `
<h1>Welcome to {{brandName}}!</h1>
<p>Hi{{#name}} {{name}}{{/name}},</p>
<p>Thank you for joining us. We're excited to have you on board!</p>
<p>Your account is now ready to use.</p>
{{#loginUrl}}
<div class="text-center">
  <a href="{{loginUrl}}" class="button">Go to Dashboard</a>
</div>
{{/loginUrl}}
<p>If you have any questions, feel free to reach out to our support team.</p>
<p>Best regards,<br>The {{brandName}} Team</p>
`,
  text: `Welcome to {{brandName}}!

Hi{{#name}} {{name}}{{/name}},

Thank you for joining us. We're excited to have you on board!

Your account is now ready to use.

{{#loginUrl}}Go to your dashboard: {{loginUrl}}{{/loginUrl}}

If you have any questions, feel free to reach out to our support team.

Best regards,
The {{brandName}} Team`,
};

/**
 * Renders a welcome email with the provided data.
 *
 * @param data - The template data including optional user name and dashboard URL
 * @returns Rendered email with subject, HTML body, and plain text body
 *
 * @example
 * ```typescript
 * const email = renderWelcomeEmail({
 *   name: "John",
 *   loginUrl: "https://example.com/dashboard",
 *   brandName: "My App",
 * });
 * ```
 */
export function renderWelcomeEmail(data: WelcomeTemplateData): { subject: string; html: string; text: string } {
  const brandName = data.brandName ?? "Pars";
  const templateData = { ...data, brandName };

  // Handle conditionals
  let html = welcomeTemplate.html
    .replace(/\{\{#name\}\}(.*?)\{\{\/name\}\}/gs, data.name ? "$1" : "")
    .replace(/\{\{#loginUrl\}\}([\s\S]*?)\{\{\/loginUrl\}\}/g, data.loginUrl ? "$1" : "");

  let text = (welcomeTemplate.text ?? "")
    .replace(/\{\{#name\}\}(.*?)\{\{\/name\}\}/gs, data.name ? "$1" : "")
    .replace(/\{\{#loginUrl\}\}([\s\S]*?)\{\{\/loginUrl\}\}/g, data.loginUrl ? "$1" : "");

  html = renderTemplate(html, templateData);
  text = renderTemplate(text, templateData);

  return {
    subject: renderTemplate(welcomeTemplate.subject, templateData),
    html: wrapEmailHtml(html, {
      brandName,
      brandColor: data.brandColor,
    }),
    text,
  };
}

// ============================================================================
// Password Reset Templates
// ============================================================================

/**
 * Data required for rendering password reset email templates.
 */
export interface PasswordResetTemplateData extends TemplateData {
  /** The password reset URL */
  url: string;
  /** Expiration time in minutes (defaults to 60) */
  expiresInMinutes?: number;
  /** Brand name for email header */
  brandName?: string;
  /** Brand color for styling */
  brandColor?: string;
}

/**
 * Pre-built email template for password reset requests.
 *
 * Includes security notice that the link can be ignored if not requested.
 */
export const passwordResetTemplate: EmailTemplate = {
  name: "password-reset",
  subject: "Reset your password",
  html: `
<h1>Reset your password</h1>
<p>We received a request to reset your password. Click the button below to choose a new password:</p>
<div class="text-center">
  <a href="{{url}}" class="button">Reset Password</a>
</div>
<p class="text-muted">This link expires in {{expiresInMinutes}} minutes.</p>
<p class="text-muted">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
<p class="text-muted" style="margin-top: 24px; font-size: 12px;">
  If the button doesn't work, copy and paste this URL into your browser:<br>
  <a href="{{url}}">{{url}}</a>
</p>
`,
  text: `Reset your password

We received a request to reset your password. Click this link to choose a new password:
{{url}}

This link expires in {{expiresInMinutes}} minutes.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.`,
};

/**
 * Renders a password reset email with the provided data.
 *
 * @param data - The template data including reset URL and branding options
 * @returns Rendered email with subject, HTML body, and plain text body
 *
 * @example
 * ```typescript
 * const email = renderPasswordResetEmail({
 *   url: "https://example.com/reset?token=abc123",
 *   expiresInMinutes: 30,
 * });
 * ```
 */
export function renderPasswordResetEmail(data: PasswordResetTemplateData): { subject: string; html: string; text: string } {
  const templateData = {
    ...data,
    expiresInMinutes: data.expiresInMinutes ?? 60,
  };

  return {
    subject: renderTemplate(passwordResetTemplate.subject, templateData),
    html: wrapEmailHtml(renderTemplate(passwordResetTemplate.html, templateData), {
      brandName: data.brandName,
      brandColor: data.brandColor,
    }),
    text: renderTemplate(passwordResetTemplate.text ?? "", templateData),
  };
}

// ============================================================================
// Invitation Templates
// ============================================================================

/**
 * Data required for rendering invitation email templates.
 */
export interface InvitationTemplateData extends TemplateData {
  /** The invitation acceptance URL */
  url: string;
  /** Name of the person who sent the invitation (optional) */
  inviterName?: string;
  /** Name of the organization being invited to (defaults to "the team") */
  organizationName?: string;
  /** Role the user is being invited to (optional) */
  role?: string;
  /** Expiration time in days (defaults to 7) */
  expiresInDays?: number;
  /** Brand name for email header */
  brandName?: string;
  /** Brand color for styling */
  brandColor?: string;
}

/**
 * Pre-built email template for team/organization invitations.
 *
 * Supports inviter name, organization name, and role customization.
 */
export const invitationTemplate: EmailTemplate = {
  name: "invitation",
  subject: "{{#inviterName}}{{inviterName}} invited you to join {{/inviterName}}{{organizationName}}",
  html: `
<h1>You're invited!</h1>
{{#inviterName}}
<p><strong>{{inviterName}}</strong> has invited you to join <strong>{{organizationName}}</strong>{{#role}} as a {{role}}{{/role}}.</p>
{{/inviterName}}
{{^inviterName}}
<p>You've been invited to join <strong>{{organizationName}}</strong>{{#role}} as a {{role}}{{/role}}.</p>
{{/inviterName}}
<div class="text-center">
  <a href="{{url}}" class="button">Accept Invitation</a>
</div>
<p class="text-muted">This invitation expires in {{expiresInDays}} days.</p>
<p class="text-muted" style="margin-top: 24px; font-size: 12px;">
  If the button doesn't work, copy and paste this URL into your browser:<br>
  <a href="{{url}}">{{url}}</a>
</p>
`,
  text: `You're invited to join {{organizationName}}!

{{#inviterName}}{{inviterName}} has invited you to join {{organizationName}}{{#role}} as a {{role}}{{/role}}.{{/inviterName}}
{{^inviterName}}You've been invited to join {{organizationName}}{{#role}} as a {{role}}{{/role}}.{{/inviterName}}

Accept the invitation:
{{url}}

This invitation expires in {{expiresInDays}} days.`,
};

/**
 * Renders an invitation email with the provided data.
 *
 * @param data - The template data including invitation URL and organization details
 * @returns Rendered email with subject, HTML body, and plain text body
 *
 * @example
 * ```typescript
 * const email = renderInvitationEmail({
 *   url: "https://example.com/invite?token=abc123",
 *   inviterName: "Jane",
 *   organizationName: "Acme Corp",
 *   role: "developer",
 * });
 * ```
 */
export function renderInvitationEmail(data: InvitationTemplateData): { subject: string; html: string; text: string } {
  const templateData = {
    ...data,
    organizationName: data.organizationName ?? "the team",
    expiresInDays: data.expiresInDays ?? 7,
  };

  // Handle conditionals (mustache-like syntax)
  let html = invitationTemplate.html
    .replace(/\{\{#inviterName\}\}([\s\S]*?)\{\{\/inviterName\}\}/g, data.inviterName ? "$1" : "")
    .replace(/\{\{\^inviterName\}\}([\s\S]*?)\{\{\/inviterName\}\}/g, data.inviterName ? "" : "$1")
    .replace(/\{\{#role\}\}([\s\S]*?)\{\{\/role\}\}/g, data.role ? "$1" : "");

  let text = (invitationTemplate.text ?? "")
    .replace(/\{\{#inviterName\}\}([\s\S]*?)\{\{\/inviterName\}\}/g, data.inviterName ? "$1" : "")
    .replace(/\{\{\^inviterName\}\}([\s\S]*?)\{\{\/inviterName\}\}/g, data.inviterName ? "" : "$1")
    .replace(/\{\{#role\}\}([\s\S]*?)\{\{\/role\}\}/g, data.role ? "$1" : "");

  let subject = invitationTemplate.subject
    .replace(/\{\{#inviterName\}\}([\s\S]*?)\{\{\/inviterName\}\}/g, data.inviterName ? "$1" : "You're invited to join ");

  html = renderTemplate(html, templateData);
  text = renderTemplate(text, templateData);
  subject = renderTemplate(subject, templateData);

  return {
    subject,
    html: wrapEmailHtml(html, {
      brandName: data.brandName,
      brandColor: data.brandColor,
    }),
    text,
  };
}

// ============================================================================
// Export all templates
// ============================================================================

/**
 * Collection of all pre-built email templates.
 *
 * Use these templates with the corresponding render functions to generate
 * complete email content with proper styling.
 */
export const templates = {
  otp: otpTemplate,
  magicLink: magicLinkTemplate,
  verification: verificationTemplate,
  welcome: welcomeTemplate,
  passwordReset: passwordResetTemplate,
  invitation: invitationTemplate,
} as const;

/**
 * Collection of render functions for each email template.
 *
 * These functions take template data and return complete rendered emails
 * with subject, HTML body, and plain text body.
 *
 * @example
 * ```typescript
 * const email = renderFunctions.otp({ code: "123456" });
 * await emailService.send({ to: "user@example.com", ...email });
 * ```
 */
export const renderFunctions = {
  otp: renderOTPEmail,
  magicLink: renderMagicLinkEmail,
  verification: renderVerificationEmail,
  welcome: renderWelcomeEmail,
  passwordReset: renderPasswordResetEmail,
  invitation: renderInvitationEmail,
} as const;
