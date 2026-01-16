/**
 * @parsrun/payments - Dunning Types
 * Types for dunning automation and payment recovery
 */

import type { PaymentProviderType } from "../types.js";

// ============================================================================
// Payment Failure
// ============================================================================

/**
 * Payment failure reason categories
 * Used for smart retry logic
 */
export type PaymentFailureCategory =
  | "card_declined"           // Generic decline
  | "insufficient_funds"      // Retry later (payday)
  | "card_expired"            // Needs card update
  | "invalid_card"            // Needs card update
  | "processing_error"        // Retry immediately
  | "authentication_required" // 3DS required
  | "fraud_suspected"         // Don't retry
  | "velocity_exceeded"       // Rate limit, retry later
  | "unknown";                // Unknown, retry with caution

/**
 * Payment failure details
 */
export interface PaymentFailure {
  /** Unique failure ID */
  id: string;
  /** Customer ID */
  customerId: string;
  /** Subscription ID */
  subscriptionId: string;
  /** Invoice ID (if applicable) */
  invoiceId?: string;
  /** Amount that failed (cents) */
  amount: number;
  /** Currency */
  currency: string;
  /** Failure category */
  category: PaymentFailureCategory;
  /** Raw error code from provider */
  errorCode: string;
  /** Human-readable error message */
  errorMessage: string;
  /** Provider type */
  provider: PaymentProviderType;
  /** When the failure occurred */
  failedAt: Date;
  /** Number of retry attempts so far */
  retryCount: number;
  /** Next scheduled retry (if any) */
  nextRetryAt?: Date;
  /** Whether this failure is recoverable */
  isRecoverable: boolean;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Dunning Step
// ============================================================================

/**
 * Action to take in a dunning step
 */
export type DunningAction =
  | "notify"              // Send notification only
  | "retry_payment"       // Retry the payment
  | "limit_features"      // Reduce access level
  | "suspend"             // Suspend access
  | "cancel"              // Cancel subscription
  | "custom";             // Custom action via callback

/**
 * Notification channel
 */
export type NotificationChannel = "email" | "sms" | "in_app" | "webhook" | "push";

/**
 * Dunning step definition
 */
export interface DunningStep {
  /** Step ID (unique within sequence) */
  id: string;
  /** Step name for display */
  name: string;
  /** Days after initial failure (0 = immediately) */
  daysAfterFailure: number;
  /** Hours offset within the day (for precise timing) */
  hoursOffset?: number;
  /** Actions to take */
  actions: DunningAction[];
  /** Notification channels to use */
  notificationChannels?: NotificationChannel[];
  /** Notification template ID */
  notificationTemplateId?: string;
  /** Whether to retry payment in this step */
  retryPayment?: boolean;
  /** Access level to set (for limit_features action) */
  accessLevel?: "full" | "limited" | "read_only" | "none";
  /** Whether this step is final (ends the sequence) */
  isFinal?: boolean;
  /** Custom action handler */
  customAction?: (context: DunningContext) => Promise<void>;
  /** Condition to execute this step */
  condition?: (context: DunningContext) => boolean | Promise<boolean>;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Dunning sequence definition
 */
export interface DunningSequence {
  /** Sequence ID */
  id: string;
  /** Sequence name */
  name: string;
  /** Description */
  description?: string;
  /** Steps in order */
  steps: DunningStep[];
  /** Maximum days before auto-cancel (if not in steps) */
  maxDurationDays: number;
  /** Whether sequence is active */
  isActive: boolean;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Dunning State
// ============================================================================

/**
 * Dunning process status
 */
export type DunningStatus =
  | "active"      // Dunning in progress
  | "recovered"   // Payment successful
  | "exhausted"   // All steps completed, still failed
  | "canceled"    // Manually canceled
  | "paused";     // Temporarily paused

/**
 * Dunning process state for a customer
 */
export interface DunningState {
  /** State ID */
  id: string;
  /** Customer ID */
  customerId: string;
  /** Subscription ID */
  subscriptionId: string;
  /** Sequence ID being executed */
  sequenceId: string;
  /** Current step index */
  currentStepIndex: number;
  /** Current step ID */
  currentStepId: string;
  /** Status */
  status: DunningStatus;
  /** Initial failure that started dunning */
  initialFailure: PaymentFailure;
  /** All failures during this dunning */
  failures: PaymentFailure[];
  /** Steps executed so far */
  executedSteps: ExecutedStep[];
  /** When dunning started */
  startedAt: Date;
  /** When last step was executed */
  lastStepAt?: Date;
  /** When next step is scheduled */
  nextStepAt?: Date;
  /** When dunning ended (if ended) */
  endedAt?: Date;
  /** End reason */
  endReason?: "payment_recovered" | "max_retries" | "manually_canceled" | "subscription_canceled";
  /** Total retry attempts */
  totalRetryAttempts: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Executed step record
 */
export interface ExecutedStep {
  /** Step ID */
  stepId: string;
  /** Step name */
  stepName: string;
  /** When executed */
  executedAt: Date;
  /** Actions taken */
  actionsTaken: DunningAction[];
  /** Whether payment was retried */
  paymentRetried: boolean;
  /** Whether payment succeeded (if retried) */
  paymentSucceeded?: boolean;
  /** Notifications sent */
  notificationsSent: NotificationChannel[];
  /** Any errors during execution */
  error?: string;
}

// ============================================================================
// Dunning Context
// ============================================================================

/**
 * Context passed to dunning step handlers
 */
export interface DunningContext {
  /** Dunning state */
  state: DunningState;
  /** Current step being executed */
  step: DunningStep;
  /** Latest payment failure */
  latestFailure: PaymentFailure;
  /** Customer info */
  customer: {
    id: string;
    email?: string;
    name?: string;
    metadata?: Record<string, unknown>;
  };
  /** Subscription info */
  subscription: {
    id: string;
    planId?: string;
    status: string;
    currentPeriodEnd?: Date;
  };
  /** Days since initial failure */
  daysSinceFailure: number;
  /** Total amount owed */
  amountOwed: number;
  /** Currency */
  currency: string;
}

// ============================================================================
// Payment Retry
// ============================================================================

/**
 * Retry strategy based on failure category
 */
export interface RetryStrategy {
  /** Failure category this applies to */
  category: PaymentFailureCategory;
  /** Whether to retry at all */
  shouldRetry: boolean;
  /** Delay before first retry (hours) */
  initialDelayHours: number;
  /** Maximum retry attempts for this category */
  maxRetries: number;
  /** Delay multiplier for subsequent retries */
  backoffMultiplier: number;
  /** Maximum delay (hours) */
  maxDelayHours: number;
  /** Optimal retry times (hour of day, 0-23) */
  optimalRetryHours?: number[];
  /** Optimal retry days (0=Sunday, 1=Monday, etc.) */
  optimalRetryDays?: number[];
}

/**
 * Payment retry result
 */
export interface RetryResult {
  /** Whether retry was successful */
  success: boolean;
  /** New failure if retry failed */
  failure?: PaymentFailure;
  /** Transaction ID if successful */
  transactionId?: string;
  /** When retry was attempted */
  attemptedAt: Date;
  /** Provider response */
  providerResponse?: Record<string, unknown>;
}

// ============================================================================
// Notifications
// ============================================================================

/**
 * Dunning notification request
 */
export interface DunningNotification {
  /** Channel to send on */
  channel: NotificationChannel;
  /** Template ID */
  templateId: string;
  /** Recipient */
  recipient: {
    customerId: string;
    email?: string;
    phone?: string;
    userId?: string;
  };
  /** Template variables */
  variables: {
    customerName?: string;
    amount: number;
    currency: string;
    daysSinceFailure: number;
    daysUntilSuspension?: number;
    daysUntilCancellation?: number;
    updatePaymentUrl?: string;
    invoiceUrl?: string;
    supportUrl?: string;
    [key: string]: unknown;
  };
  /** Dunning context for reference */
  context: DunningContext;
}

/**
 * Notification result
 */
export interface NotificationResult {
  /** Whether notification was sent */
  success: boolean;
  /** Channel used */
  channel: NotificationChannel;
  /** External ID (email ID, SMS ID, etc.) */
  externalId?: string;
  /** Error if failed */
  error?: string;
  /** When sent */
  sentAt: Date;
}

// ============================================================================
// Events
// ============================================================================

/**
 * Dunning event types
 */
export type DunningEventType =
  | "dunning.started"
  | "dunning.step_executed"
  | "dunning.payment_retried"
  | "dunning.payment_recovered"
  | "dunning.notification_sent"
  | "dunning.access_limited"
  | "dunning.suspended"
  | "dunning.canceled"
  | "dunning.exhausted"
  | "dunning.paused"
  | "dunning.resumed";

/**
 * Dunning event
 */
export interface DunningEvent {
  /** Event type */
  type: DunningEventType;
  /** Customer ID */
  customerId: string;
  /** Subscription ID */
  subscriptionId: string;
  /** Dunning state ID */
  dunningStateId: string;
  /** Event timestamp */
  timestamp: Date;
  /** Event-specific data */
  data: Record<string, unknown>;
}

/**
 * Dunning event handler
 */
export type DunningEventHandler = (event: DunningEvent) => void | Promise<void>;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Dunning manager configuration
 */
export interface DunningManagerConfig {
  /** Default dunning sequence */
  defaultSequence: DunningSequence;

  /** Sequences by plan tier (optional) */
  sequencesByPlanTier?: Record<number, DunningSequence>;

  /** Payment retry strategies */
  retryStrategies?: RetryStrategy[];

  /** Notification handler */
  onNotification?: (notification: DunningNotification) => Promise<NotificationResult>;

  /** Payment retry handler (called to actually retry payment) */
  onRetryPayment?: (context: DunningContext) => Promise<RetryResult>;

  /** Access update handler */
  onAccessUpdate?: (customerId: string, accessLevel: "full" | "limited" | "read_only" | "none") => Promise<void>;

  /** Subscription cancel handler */
  onCancelSubscription?: (subscriptionId: string, reason: string) => Promise<void>;

  /** Event handlers */
  onEvent?: DunningEventHandler;

  /** Logger */
  logger?: DunningLogger;

  /** URLs for notification templates */
  urls?: {
    updatePayment?: string;
    viewInvoice?: string;
    support?: string;
  };

  /** Timezone for scheduling (default: UTC) */
  timezone?: string;
}

/**
 * Logger interface
 */
export interface DunningLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ============================================================================
// Storage
// ============================================================================

/**
 * Dunning storage interface
 */
export interface DunningStorage {
  // Dunning State
  getDunningState(customerId: string): Promise<DunningState | null>;
  getActiveDunningStates(): Promise<DunningState[]>;
  getDunningStatesByStatus(status: DunningStatus): Promise<DunningState[]>;
  saveDunningState(state: DunningState): Promise<void>;
  updateDunningState(id: string, updates: Partial<DunningState>): Promise<void>;

  // Payment Failures
  recordPaymentFailure(failure: PaymentFailure): Promise<void>;
  getPaymentFailures(customerId: string, limit?: number): Promise<PaymentFailure[]>;

  // Scheduled Steps
  getScheduledSteps(before: Date): Promise<Array<{ stateId: string; stepId: string; scheduledAt: Date }>>;
  scheduleStep(stateId: string, stepId: string, scheduledAt: Date): Promise<void>;
  removeScheduledStep(stateId: string, stepId: string): Promise<void>;
}
