/**
 * @parsrun/payments - Dunning Email Templates
 * Pre-built email templates for dunning notifications
 */

import type { DunningContext } from "./types.js";

// ============================================================================
// Template Types
// ============================================================================

/**
 * Dunning email template data
 */
export interface DunningEmailData {
  /** Customer name */
  customerName?: string;
  /** Amount owed in display format */
  amount: string;
  /** Currency code */
  currency: string;
  /** Days since initial failure */
  daysSinceFailure: number;
  /** Days until features are limited */
  daysUntilLimit?: number;
  /** Days until suspension */
  daysUntilSuspension?: number;
  /** Days until cancellation */
  daysUntilCancellation?: number;
  /** URL to update payment method */
  updatePaymentUrl?: string;
  /** URL to view invoice */
  invoiceUrl?: string;
  /** URL for support */
  supportUrl?: string;
  /** Brand name */
  brandName?: string;
  /** Brand color */
  brandColor?: string;
  /** Last 4 digits of card */
  cardLast4?: string;
  /** Card brand (Visa, Mastercard, etc.) */
  cardBrand?: string;
}

/**
 * Rendered email template
 */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Dunning email template
 */
export interface DunningEmailTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Subject template */
  subject: string;
  /** HTML template */
  html: string;
  /** Plain text template */
  text: string;
}

// ============================================================================
// Template Renderer
// ============================================================================

/**
 * Simple template engine - replaces {{key}} with values
 */
function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = data[key];
    return value !== undefined && value !== null ? String(value) : "";
  });
}

/**
 * Format currency amount for display
 */
export function formatAmount(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

// ============================================================================
// Default Templates
// ============================================================================

/**
 * Payment failed - immediate notification
 */
export const paymentFailedTemplate: DunningEmailTemplate = {
  id: "dunning-payment-failed",
  name: "Payment Failed",
  subject: "Action required: Your payment failed",
  html: `
<h1>Your payment didn't go through</h1>
<p>Hi{{customerName}},</p>
<p>We weren't able to process your payment of <strong>{{amount}}</strong> for your subscription.</p>
{{cardInfo}}
<p>Don't worry - we'll automatically retry your payment. In the meantime, please make sure your payment information is up to date.</p>
<div style="text-align: center; margin: 24px 0;">
  <a href="{{updatePaymentUrl}}" style="display: inline-block; background: {{brandColor}}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600;">Update Payment Method</a>
</div>
<p style="color: #666; font-size: 14px;">If you have any questions, please <a href="{{supportUrl}}">contact our support team</a>.</p>
`,
  text: `Your payment didn't go through

Hi{{customerName}},

We weren't able to process your payment of {{amount}} for your subscription.

Don't worry - we'll automatically retry your payment. In the meantime, please make sure your payment information is up to date.

Update your payment method: {{updatePaymentUrl}}

If you have any questions, please contact our support team: {{supportUrl}}`,
};

/**
 * Payment reminder - gentle reminder
 */
export const paymentReminderTemplate: DunningEmailTemplate = {
  id: "dunning-reminder",
  name: "Payment Reminder",
  subject: "Reminder: Please update your payment method",
  html: `
<h1>Friendly reminder about your payment</h1>
<p>Hi{{customerName}},</p>
<p>We wanted to remind you that we were unable to process your payment of <strong>{{amount}}</strong>. It's been {{daysSinceFailure}} days since we first tried.</p>
<p>To keep your subscription active, please update your payment information.</p>
<div style="text-align: center; margin: 24px 0;">
  <a href="{{updatePaymentUrl}}" style="display: inline-block; background: {{brandColor}}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600;">Update Payment Method</a>
</div>
<p style="color: #666; font-size: 14px;">Need help? <a href="{{supportUrl}}">Contact support</a></p>
`,
  text: `Friendly reminder about your payment

Hi{{customerName}},

We wanted to remind you that we were unable to process your payment of {{amount}}. It's been {{daysSinceFailure}} days since we first tried.

To keep your subscription active, please update your payment information.

Update your payment method: {{updatePaymentUrl}}

Need help? Contact support: {{supportUrl}}`,
};

/**
 * Payment warning - features may be limited
 */
export const paymentWarningTemplate: DunningEmailTemplate = {
  id: "dunning-warning",
  name: "Payment Warning",
  subject: "Urgent: Your account access may be limited",
  html: `
<h1>Your account access may be limited soon</h1>
<p>Hi{{customerName}},</p>
<p>We've been trying to process your payment of <strong>{{amount}}</strong> for {{daysSinceFailure}} days without success.</p>
<p style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 16px; margin: 16px 0;">
  <strong>⚠️ Important:</strong> If we don't receive payment within {{daysUntilLimit}} days, some features will be limited.
</p>
<p>Please update your payment method to avoid any service interruption.</p>
<div style="text-align: center; margin: 24px 0;">
  <a href="{{updatePaymentUrl}}" style="display: inline-block; background: {{brandColor}}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600;">Update Payment Now</a>
</div>
<p style="color: #666; font-size: 14px;">Having trouble? <a href="{{supportUrl}}">We're here to help</a></p>
`,
  text: `Your account access may be limited soon

Hi{{customerName}},

We've been trying to process your payment of {{amount}} for {{daysSinceFailure}} days without success.

⚠️ Important: If we don't receive payment within {{daysUntilLimit}} days, some features will be limited.

Please update your payment method to avoid any service interruption.

Update your payment method: {{updatePaymentUrl}}

Having trouble? We're here to help: {{supportUrl}}`,
};

/**
 * Features limited notification
 */
export const featuresLimitedTemplate: DunningEmailTemplate = {
  id: "dunning-feature-limit",
  name: "Features Limited",
  subject: "Some features have been limited on your account",
  html: `
<h1>Some features have been limited</h1>
<p>Hi{{customerName}},</p>
<p>Due to the outstanding payment of <strong>{{amount}}</strong>, we've had to limit some features on your account.</p>
<p style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 16px; margin: 16px 0;">
  <strong>Current status:</strong> Limited access<br>
  <strong>Outstanding amount:</strong> {{amount}}<br>
  <strong>Days until suspension:</strong> {{daysUntilSuspension}}
</p>
<p>To restore full access, please update your payment method immediately.</p>
<div style="text-align: center; margin: 24px 0;">
  <a href="{{updatePaymentUrl}}" style="display: inline-block; background: #dc3545; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600;">Restore Full Access</a>
</div>
`,
  text: `Some features have been limited

Hi{{customerName}},

Due to the outstanding payment of {{amount}}, we've had to limit some features on your account.

Current status: Limited access
Outstanding amount: {{amount}}
Days until suspension: {{daysUntilSuspension}}

To restore full access, please update your payment method immediately.

Restore full access: {{updatePaymentUrl}}`,
};

/**
 * Account suspension notification
 */
export const accountSuspendedTemplate: DunningEmailTemplate = {
  id: "dunning-suspension",
  name: "Account Suspended",
  subject: "Your account has been suspended",
  html: `
<h1>Your account has been suspended</h1>
<p>Hi{{customerName}},</p>
<p>We've suspended your account due to an outstanding payment of <strong>{{amount}}</strong>.</p>
<p style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 16px; margin: 16px 0;">
  <strong>⛔ Your account is now suspended</strong><br>
  You have read-only access to your data.<br>
  <strong>Days until cancellation:</strong> {{daysUntilCancellation}}
</p>
<p>To reactivate your account and regain full access, please pay the outstanding balance.</p>
<div style="text-align: center; margin: 24px 0;">
  <a href="{{updatePaymentUrl}}" style="display: inline-block; background: #dc3545; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600;">Reactivate Account</a>
</div>
<p style="color: #666; font-size: 14px;">If you need to discuss payment options, please <a href="{{supportUrl}}">contact us</a>.</p>
`,
  text: `Your account has been suspended

Hi{{customerName}},

We've suspended your account due to an outstanding payment of {{amount}}.

⛔ Your account is now suspended
You have read-only access to your data.
Days until cancellation: {{daysUntilCancellation}}

To reactivate your account and regain full access, please pay the outstanding balance.

Reactivate account: {{updatePaymentUrl}}

If you need to discuss payment options, please contact us: {{supportUrl}}`,
};

/**
 * Final warning before cancellation
 */
export const finalWarningTemplate: DunningEmailTemplate = {
  id: "dunning-final-warning",
  name: "Final Warning",
  subject: "Final notice: Your subscription will be canceled",
  html: `
<h1>Final notice before cancellation</h1>
<p>Hi{{customerName}},</p>
<p>This is your final notice. Your subscription will be <strong>automatically canceled</strong> in {{daysUntilCancellation}} days due to an unpaid balance of <strong>{{amount}}</strong>.</p>
<p style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 16px; margin: 16px 0;">
  <strong>🚨 Action required immediately</strong><br>
  After cancellation, your data may be permanently deleted according to our data retention policy.
</p>
<p>Please pay now to keep your account and data.</p>
<div style="text-align: center; margin: 24px 0;">
  <a href="{{updatePaymentUrl}}" style="display: inline-block; background: #dc3545; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600;">Pay Now - Prevent Cancellation</a>
</div>
<p style="color: #666; font-size: 14px;">Questions? <a href="{{supportUrl}}">Contact us immediately</a></p>
`,
  text: `Final notice before cancellation

Hi{{customerName}},

This is your final notice. Your subscription will be automatically canceled in {{daysUntilCancellation}} days due to an unpaid balance of {{amount}}.

🚨 Action required immediately
After cancellation, your data may be permanently deleted according to our data retention policy.

Please pay now to keep your account and data.

Pay now: {{updatePaymentUrl}}

Questions? Contact us immediately: {{supportUrl}}`,
};

/**
 * Subscription canceled
 */
export const subscriptionCanceledTemplate: DunningEmailTemplate = {
  id: "dunning-canceled",
  name: "Subscription Canceled",
  subject: "Your subscription has been canceled",
  html: `
<h1>Your subscription has been canceled</h1>
<p>Hi{{customerName}},</p>
<p>Your subscription has been canceled due to non-payment of <strong>{{amount}}</strong>.</p>
<p style="background: #f8f9fa; border-radius: 6px; padding: 16px; margin: 16px 0;">
  Your data will be retained for 30 days. After that, it may be permanently deleted.
</p>
<p>If you'd like to resubscribe, you can do so at any time:</p>
<div style="text-align: center; margin: 24px 0;">
  <a href="{{updatePaymentUrl}}" style="display: inline-block; background: {{brandColor}}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600;">Resubscribe</a>
</div>
<p>We're sorry to see you go. If there's anything we can do to help, please <a href="{{supportUrl}}">let us know</a>.</p>
`,
  text: `Your subscription has been canceled

Hi{{customerName}},

Your subscription has been canceled due to non-payment of {{amount}}.

Your data will be retained for 30 days. After that, it may be permanently deleted.

If you'd like to resubscribe, you can do so at any time: {{updatePaymentUrl}}

We're sorry to see you go. If there's anything we can do to help, please let us know: {{supportUrl}}`,
};

/**
 * Payment recovered - success notification
 */
export const paymentRecoveredTemplate: DunningEmailTemplate = {
  id: "dunning-recovered",
  name: "Payment Recovered",
  subject: "Good news! Your payment was successful",
  html: `
<h1>Your payment was successful! 🎉</h1>
<p>Hi{{customerName}},</p>
<p>Great news! We've successfully processed your payment of <strong>{{amount}}</strong>.</p>
<p style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; padding: 16px; margin: 16px 0;">
  <strong>✓ Payment received:</strong> {{amount}}<br>
  <strong>✓ Account status:</strong> Active
</p>
<p>Your subscription is now fully active. Thank you for being a valued customer!</p>
<p style="color: #666; font-size: 14px;">If you have any questions, we're always here to help at <a href="{{supportUrl}}">support</a>.</p>
`,
  text: `Your payment was successful! 🎉

Hi{{customerName}},

Great news! We've successfully processed your payment of {{amount}}.

✓ Payment received: {{amount}}
✓ Account status: Active

Your subscription is now fully active. Thank you for being a valued customer!

If you have any questions, we're always here to help: {{supportUrl}}`,
};

// ============================================================================
// Template Registry
// ============================================================================

/**
 * All default dunning templates
 */
export const dunningEmailTemplates: Record<string, DunningEmailTemplate> = {
  "dunning-payment-failed": paymentFailedTemplate,
  "dunning-reminder": paymentReminderTemplate,
  "dunning-warning": paymentWarningTemplate,
  "dunning-feature-limit": featuresLimitedTemplate,
  "dunning-suspension": accountSuspendedTemplate,
  "dunning-final-warning": finalWarningTemplate,
  "dunning-canceled": subscriptionCanceledTemplate,
  "dunning-recovered": paymentRecoveredTemplate,
};

// ============================================================================
// Template Renderer
// ============================================================================

/**
 * Render a dunning email template
 */
export function renderDunningEmail(
  templateId: string,
  data: DunningEmailData,
  customTemplates?: Record<string, DunningEmailTemplate>
): RenderedEmail {
  // Look up template
  const templates = { ...dunningEmailTemplates, ...customTemplates };
  const template = templates[templateId];

  if (!template) {
    throw new Error(`Dunning email template not found: ${templateId}`);
  }

  // Prepare data with defaults
  const templateData: Record<string, unknown> = {
    ...data,
    customerName: data.customerName ? ` ${data.customerName}` : "",
    brandColor: data.brandColor ?? "#0070f3",
    brandName: data.brandName ?? "Your Service",
  };

  // Add card info if available
  if (data.cardLast4 && data.cardBrand) {
    templateData["cardInfo"] = `<p style="color: #666;">Card ending in ${data.cardLast4} (${data.cardBrand})</p>`;
  } else {
    templateData["cardInfo"] = "";
  }

  return {
    subject: renderTemplate(template.subject, templateData),
    html: renderTemplate(template.html, templateData),
    text: renderTemplate(template.text, templateData),
  };
}

/**
 * Build template data from dunning context
 */
export function buildTemplateData(
  context: DunningContext,
  options?: {
    brandName?: string;
    brandColor?: string;
    updatePaymentUrl?: string;
    invoiceUrl?: string;
    supportUrl?: string;
    daysUntilLimit?: number;
    daysUntilSuspension?: number;
    daysUntilCancellation?: number;
  }
): DunningEmailData {
  // Build result with required fields
  const result: DunningEmailData = {
    amount: formatAmount(context.amountOwed, context.currency),
    currency: context.currency,
    daysSinceFailure: context.daysSinceFailure,
  };

  // Add optional fields only if they have values
  if (context.customer.name) result.customerName = context.customer.name;
  if (options?.daysUntilLimit !== undefined) result.daysUntilLimit = options.daysUntilLimit;
  if (options?.daysUntilSuspension !== undefined) result.daysUntilSuspension = options.daysUntilSuspension;
  if (options?.daysUntilCancellation !== undefined) result.daysUntilCancellation = options.daysUntilCancellation;
  if (options?.updatePaymentUrl) result.updatePaymentUrl = options.updatePaymentUrl;
  if (options?.invoiceUrl) result.invoiceUrl = options.invoiceUrl;
  if (options?.supportUrl) result.supportUrl = options.supportUrl;
  if (options?.brandName) result.brandName = options.brandName;
  if (options?.brandColor) result.brandColor = options.brandColor;

  return result;
}
