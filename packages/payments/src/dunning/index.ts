/**
 * @parsrun/payments - Dunning Module
 * Automated payment recovery and dunning sequence management
 *
 * Features:
 * - Smart payment retry based on failure categories
 * - Configurable dunning sequences (standard, aggressive, lenient, minimal)
 * - Multi-channel notifications (email, SMS, in-app, webhook, push)
 * - Built-in @parsrun/email integration with pre-built templates
 * - Feature limiting and subscription cancellation automation
 * - Flexible storage (memory for dev, Drizzle for production)
 *
 * @example Basic Usage
 * ```typescript
 * import {
 *   createDunningManager,
 *   createDunningScheduler,
 *   createMemoryDunningStorage,
 *   standardSaasSequence,
 *   simpleEmailHandler,
 * } from '@parsrun/payments/dunning';
 * import { createEmailService } from '@parsrun/email';
 *
 * // Setup email
 * const emailService = createEmailService({
 *   provider: 'resend',
 *   apiKey: process.env.RESEND_API_KEY,
 *   fromEmail: 'billing@example.com',
 *   fromName: 'Billing',
 * });
 *
 * // Create storage (use DrizzleDunningStorage for production)
 * const storage = createMemoryDunningStorage();
 *
 * // Create dunning manager with email integration
 * const manager = createDunningManager({
 *   defaultSequence: standardSaasSequence,
 *   onNotification: simpleEmailHandler(emailService, {
 *     brandName: 'MyApp',
 *     updatePaymentUrl: 'https://app.example.com/billing',
 *     supportUrl: 'https://app.example.com/support',
 *   }),
 *   onRetryPayment: async (context) => {
 *     // Retry via your payment provider
 *     return { success: false, attemptedAt: new Date() };
 *   },
 *   onAccessUpdate: async (customerId, level) => {
 *     // Update customer access level in your app
 *   },
 * }, storage);
 *
 * // Start dunning on payment failure
 * await manager.startDunning({
 *   id: 'fail_123',
 *   customerId: 'cus_456',
 *   subscriptionId: 'sub_789',
 *   amount: 2999,
 *   currency: 'usd',
 *   category: 'card_declined',
 *   errorCode: 'card_declined',
 *   errorMessage: 'Your card was declined.',
 *   provider: 'stripe',
 *   failedAt: new Date(),
 *   retryCount: 0,
 *   isRecoverable: true,
 * });
 *
 * // Create scheduler for automated processing
 * const scheduler = createDunningScheduler({
 *   manager,
 *   pollInterval: 60000, // Check every minute
 * });
 *
 * scheduler.start();
 * ```
 *
 * @example Advanced Email Integration
 * ```typescript
 * import { createDunningEmailHandler } from '@parsrun/payments/dunning';
 *
 * const dunningEmail = createDunningEmailHandler({
 *   emailService,
 *   brand: { name: 'MyApp', color: '#0070f3' },
 *   urls: {
 *     updatePayment: (customerId) => `https://app.example.com/billing?c=${customerId}`,
 *     support: 'https://app.example.com/support',
 *   },
 *   enrichData: (data, context) => ({
 *     ...data,
 *     // Add custom data to templates
 *     accountManager: context.customer.metadata?.accountManager,
 *   }),
 * });
 *
 * const manager = createDunningManager({
 *   defaultSequence: standardSaasSequence,
 *   onNotification: dunningEmail.handler,
 *   // ...
 * }, storage);
 *
 * // Manually send recovery email
 * await dunningEmail.sendRecoveryEmail('customer@example.com', context);
 * ```
 */

// Types
export * from "./types.js";

// Dunning Sequences
export {
  DunningStepBuilder,
  DunningSequenceBuilder,
  step,
  sequence,
  standardSaasSequence,
  aggressiveSequence,
  lenientSequence,
  minimalSequence,
  defaultSequences,
  getSequenceByTier,
} from "./dunning-sequence.js";

// Payment Retry
export {
  PaymentRetryCalculator,
  PaymentRetrier,
  createPaymentRetryCalculator,
  createPaymentRetrier,
  defaultRetryStrategies,
  stripeErrorCodes,
  paddleErrorCodes,
  iyzicoErrorCodes,
  allErrorCodeMappings,
} from "./payment-retry.js";
export type { ErrorCodeMapping, PaymentRetrierConfig } from "./payment-retry.js";

// Dunning Manager
export {
  DunningManager,
  createDunningManager,
  createDefaultDunningConfig,
} from "./dunning-manager.js";

// Dunning Scheduler
export {
  DunningScheduler,
  createDunningScheduler,
  createDunningCronHandler,
  createDunningEdgeHandler,
} from "./dunning-scheduler.js";
export type { DunningSchedulerConfig } from "./dunning-scheduler.js";

// Storage - Memory (dev/testing)
export {
  MemoryDunningStorage,
  createMemoryDunningStorage,
} from "./memory-storage.js";

// Storage - Drizzle (production)
export {
  DrizzleDunningStorage,
  createDrizzleDunningStorage,
} from "./drizzle-storage.js";
export type { DrizzleDb, DrizzleDunningStorageConfig } from "./drizzle-storage.js";

// Database Schema
export { dunningSchema } from "./schema.js";
export {
  dunningSequences,
  dunningSteps,
  paymentFailures,
  dunningStates,
  executedSteps,
  scheduledSteps,
  dunningEvents,
  retryStrategies,
} from "./schema.js";
export type {
  DunningSequenceRow,
  NewDunningSequence,
  DunningStepRow,
  NewDunningStep,
  PaymentFailureRow,
  NewPaymentFailure,
  DunningStateRow,
  NewDunningState,
  ExecutedStepRow,
  NewExecutedStep,
  ScheduledStepRow,
  NewScheduledStep,
  DunningEventRow,
  NewDunningEvent,
  RetryStrategyRow,
  NewRetryStrategy,
} from "./schema.js";

// Email Templates
export {
  dunningEmailTemplates,
  paymentFailedTemplate,
  paymentReminderTemplate,
  paymentWarningTemplate,
  featuresLimitedTemplate,
  accountSuspendedTemplate,
  finalWarningTemplate,
  subscriptionCanceledTemplate,
  paymentRecoveredTemplate,
  renderDunningEmail,
  buildTemplateData,
  formatAmount,
} from "./email-templates.js";
export type {
  DunningEmailTemplate,
  DunningEmailData,
  RenderedEmail,
} from "./email-templates.js";

// Email Integration (@parsrun/email)
export {
  createDunningEmailHandler,
  createMultiChannelHandler,
  simpleEmailHandler,
} from "./email-integration.js";
export type {
  EmailServiceLike,
  DunningEmailIntegrationConfig,
  DunningEmailHandler,
  SmsServiceLike,
  MultiChannelDunningConfig,
} from "./email-integration.js";
