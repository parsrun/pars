/**
 * @module
 * Service definitions for Pars extracted microservices.
 * Pre-built adapters for common services like email and payments.
 *
 * @example
 * ```typescript
 * import { emailService, paymentsService } from '@parsrun/service-adapters';
 *
 * // Use email service
 * const email = useService(emailService);
 * await email.call('sendEmail', { to: 'user@example.com', subject: 'Hello' });
 *
 * // Use payments service
 * const payments = useService(paymentsService);
 * await payments.call('createCheckout', { priceId: 'price_xxx' });
 * ```
 */

export * from "./email/index.js";
export * from "./payments/index.js";
