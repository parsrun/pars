/**
 * @parsrun/payments - iyzico Provider
 * Edge-compatible iyzico provider using fetch API
 */

import type {
  CheckoutSession,
  CreateCheckoutOptions,
  CreateCustomerOptions,
  CreatePortalOptions,
  CreateSubscriptionOptions,
  Customer,
  PaymentProvider,
  PortalSession,
  Subscription,
  UpdateSubscriptionOptions,
  WebhookEvent,
  WebhookEventType,
} from "../types.js";
import { PaymentError, PaymentErrorCodes } from "../types.js";

/**
 * iyzico provider config
 */
export interface IyzicoProviderConfig {
  /** iyzico API key */
  apiKey: string;
  /** iyzico secret key */
  secretKey: string;
  /** Environment */
  environment?: "sandbox" | "production" | undefined;
  /** Base URL override */
  baseUrl?: string | undefined;
}

/**
 * iyzico basket item
 */
export interface IyzicoBasketItem {
  id: string;
  name: string;
  category1: string;
  category2?: string | undefined;
  itemType: "PHYSICAL" | "VIRTUAL";
  price: string; // Decimal string like "1.0"
}

/**
 * iyzico buyer info
 */
export interface IyzicoBuyer {
  id: string;
  name: string;
  surname: string;
  email: string;
  gsmNumber?: string | undefined;
  identityNumber: string;
  registrationAddress: string;
  city: string;
  country: string;
  ip: string;
}

/**
 * iyzico address
 */
export interface IyzicoAddress {
  contactName: string;
  city: string;
  country: string;
  address: string;
}

/**
 * Extended checkout options for iyzico
 */
export interface IyzicoCheckoutOptions extends CreateCheckoutOptions {
  /** Buyer information (required for iyzico) */
  buyer: IyzicoBuyer;
  /** Billing address */
  billingAddress: IyzicoAddress;
  /** Shipping address */
  shippingAddress: IyzicoAddress;
  /** Basket items */
  basketItems: IyzicoBasketItem[];
  /** Price (total amount as decimal string) */
  price: string;
  /** Paid price (can include installment fees) */
  paidPrice: string;
  /** Currency (TRY, USD, EUR, GBP, IRR) */
  currency: "TRY" | "USD" | "EUR" | "GBP" | "IRR";
  /** Installment options */
  enabledInstallments?: number[] | undefined;
  /** Force 3D Secure */
  force3ds?: boolean | undefined;
  /** Conversation ID for tracking */
  conversationId?: string | undefined;
}

/**
 * iyzico Payment Provider
 * Edge-compatible using fetch API
 *
 * @example
 * ```typescript
 * const iyzico = new IyzicoProvider({
 *   apiKey: process.env.IYZICO_API_KEY,
 *   secretKey: process.env.IYZICO_SECRET_KEY,
 *   environment: 'sandbox',
 * });
 *
 * const checkout = await iyzico.createCheckoutForm({
 *   price: '100.00',
 *   paidPrice: '100.00',
 *   currency: 'TRY',
 *   basketItems: [...],
 *   buyer: {...},
 *   billingAddress: {...},
 *   shippingAddress: {...},
 *   callbackUrl: 'https://example.com/callback',
 * });
 * ```
 */
export class IyzicoProvider implements PaymentProvider {
  readonly type = "iyzico" as const;

  private apiKey: string;
  private secretKey: string;
  private baseUrl: string;

  constructor(config: IyzicoProviderConfig) {
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.baseUrl =
      config.baseUrl ??
      (config.environment === "production"
        ? "https://api.iyzipay.com"
        : "https://sandbox-api.iyzipay.com");
  }

  private async request<T>(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const randomString = this.generateRandomString(8);

    // Generate authorization header
    const authorizationString = await this.generateAuthorizationString(
      body,
      randomString
    );

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: authorizationString,
        "x-iyzi-rnd": randomString,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as IyzicoResponse & T;

    if (data.status !== "success") {
      throw new PaymentError(
        `iyzico API error: ${data.errorMessage ?? "Unknown error"}`,
        data.errorCode ?? PaymentErrorCodes.API_ERROR,
        data
      );
    }

    return data as T;
  }

  private generateRandomString(length: number): string {
    const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      const randomValue = randomValues[i];
      if (randomValue !== undefined) {
        result += chars[randomValue % chars.length];
      }
    }
    return result;
  }

  private async generateAuthorizationString(
    body: Record<string, unknown>,
    randomString: string
  ): Promise<string> {
    // Sort and flatten the body for PKI string
    const pkiString = this.generatePkiString(body);

    // Create hash string
    const hashString = `${this.apiKey}${randomString}${this.secretKey}${pkiString}`;

    // SHA256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(hashString);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    const hashBase64 = btoa(String.fromCharCode(...hashArray));

    // Create authorization
    const authorizationString = `${this.apiKey}:${hashBase64}`;
    const authorizationBase64 = btoa(authorizationString);

    return `IYZWS ${authorizationBase64}`;
  }

  private generatePkiString(obj: Record<string, unknown>): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        const arrayParts = value.map((item) => {
          if (typeof item === "object" && item !== null) {
            return this.generatePkiString(item as Record<string, unknown>);
          }
          return String(item);
        });
        parts.push(`${key}=[${arrayParts.join(", ")}]`);
      } else if (typeof value === "object") {
        parts.push(
          `${key}=[${this.generatePkiString(value as Record<string, unknown>)}]`
        );
      } else {
        parts.push(`${key}=${value}`);
      }
    }

    return `[${parts.join(",")}]`;
  }

  // ============================================================================
  // Customer - iyzico uses buyer info per transaction, not stored customers
  // ============================================================================

  async createCustomer(_options: CreateCustomerOptions): Promise<Customer> {
    // iyzico doesn't have a separate customer API
    // Customers are identified by buyer info in each transaction
    throw new PaymentError(
      "iyzico does not support stored customers. Use buyer info in checkout.",
      PaymentErrorCodes.API_ERROR
    );
  }

  async getCustomer(_customerId: string): Promise<Customer | null> {
    return null;
  }

  async updateCustomer(
    _customerId: string,
    _options: Partial<CreateCustomerOptions>
  ): Promise<Customer> {
    throw new PaymentError(
      "iyzico does not support stored customers",
      PaymentErrorCodes.API_ERROR
    );
  }

  async deleteCustomer(_customerId: string): Promise<void> {
    throw new PaymentError(
      "iyzico does not support stored customers",
      PaymentErrorCodes.API_ERROR
    );
  }

  // ============================================================================
  // Checkout
  // ============================================================================

  async createCheckout(_options: CreateCheckoutOptions): Promise<CheckoutSession> {
    // For standard createCheckout, we need extended options
    throw new PaymentError(
      "Use createCheckoutForm() with IyzicoCheckoutOptions for iyzico",
      PaymentErrorCodes.INVALID_CONFIG
    );
  }

  /**
   * Create iyzico checkout form (iframe/popup)
   */
  async createCheckoutForm(options: IyzicoCheckoutOptions): Promise<IyzicoCheckoutResult> {
    const body: Record<string, unknown> = {
      locale: "tr",
      conversationId: options.conversationId ?? this.generateRandomString(16),
      price: options.price,
      paidPrice: options.paidPrice,
      currency: options.currency,
      basketId: options.metadata?.["basketId"] ?? this.generateRandomString(16),
      paymentGroup: "PRODUCT",
      callbackUrl: options.successUrl,
      buyer: {
        id: options.buyer.id,
        name: options.buyer.name,
        surname: options.buyer.surname,
        gsmNumber: options.buyer.gsmNumber,
        email: options.buyer.email,
        identityNumber: options.buyer.identityNumber,
        registrationAddress: options.buyer.registrationAddress,
        ip: options.buyer.ip,
        city: options.buyer.city,
        country: options.buyer.country,
      },
      shippingAddress: {
        contactName: options.shippingAddress.contactName,
        city: options.shippingAddress.city,
        country: options.shippingAddress.country,
        address: options.shippingAddress.address,
      },
      billingAddress: {
        contactName: options.billingAddress.contactName,
        city: options.billingAddress.city,
        country: options.billingAddress.country,
        address: options.billingAddress.address,
      },
      basketItems: options.basketItems.map((item) => ({
        id: item.id,
        name: item.name,
        category1: item.category1,
        category2: item.category2,
        itemType: item.itemType,
        price: item.price,
      })),
    };

    if (options.enabledInstallments) {
      body["enabledInstallments"] = options.enabledInstallments;
    }

    if (options.force3ds) {
      body["forceThreeDS"] = 1;
    }

    const result = await this.request<IyzicoCheckoutFormResponse>(
      "/payment/iyzi-pos/checkoutform/initialize/auth/ecom",
      body
    );

    return {
      token: result.token,
      checkoutFormContent: result.checkoutFormContent,
      tokenExpireTime: result.tokenExpireTime,
      paymentPageUrl: result.paymentPageUrl,
    };
  }

  /**
   * Retrieve checkout form result
   */
  async retrieveCheckoutForm(token: string): Promise<IyzicoPaymentResult> {
    const body = {
      locale: "tr",
      conversationId: this.generateRandomString(16),
      token,
    };

    const result = await this.request<IyzicoPaymentResponse>(
      "/payment/iyzi-pos/checkoutform/auth/ecom/detail",
      body
    );

    return {
      paymentId: result.paymentId,
      status: result.status,
      paymentStatus: result.paymentStatus,
      price: result.price,
      paidPrice: result.paidPrice,
      currency: result.currency,
      installment: result.installment,
      basketId: result.basketId,
      binNumber: result.binNumber,
      lastFourDigits: result.lastFourDigits,
      cardAssociation: result.cardAssociation,
      cardFamily: result.cardFamily,
      cardType: result.cardType,
      fraudStatus: result.fraudStatus,
      raw: result,
    };
  }

  async getCheckout(_sessionId: string): Promise<CheckoutSession | null> {
    // Use retrieveCheckoutForm instead
    return null;
  }

  // ============================================================================
  // 3D Secure Payment
  // ============================================================================

  /**
   * Initialize 3D Secure payment
   */
  async initialize3DSPayment(options: {
    price: string;
    paidPrice: string;
    currency: "TRY" | "USD" | "EUR" | "GBP" | "IRR";
    installment: number;
    paymentCard: {
      cardHolderName: string;
      cardNumber: string;
      expireMonth: string;
      expireYear: string;
      cvc: string;
      registerCard?: 0 | 1;
    };
    buyer: IyzicoBuyer;
    billingAddress: IyzicoAddress;
    shippingAddress: IyzicoAddress;
    basketItems: IyzicoBasketItem[];
    callbackUrl: string;
    conversationId?: string;
  }): Promise<IyzicoThreeDSInitResult> {
    const body: Record<string, unknown> = {
      locale: "tr",
      conversationId: options.conversationId ?? this.generateRandomString(16),
      price: options.price,
      paidPrice: options.paidPrice,
      currency: options.currency,
      installment: options.installment,
      basketId: this.generateRandomString(16),
      paymentChannel: "WEB",
      paymentGroup: "PRODUCT",
      paymentCard: options.paymentCard,
      buyer: options.buyer,
      shippingAddress: options.shippingAddress,
      billingAddress: options.billingAddress,
      basketItems: options.basketItems,
      callbackUrl: options.callbackUrl,
    };

    const result = await this.request<IyzicoThreeDSResponse>(
      "/payment/3dsecure/initialize",
      body
    );

    return {
      threeDSHtmlContent: result.threeDSHtmlContent,
      status: result.status,
    };
  }

  /**
   * Complete 3D Secure payment after callback
   */
  async complete3DSPayment(paymentId: string, conversationId?: string): Promise<IyzicoPaymentResult> {
    const body = {
      locale: "tr",
      conversationId: conversationId ?? this.generateRandomString(16),
      paymentId,
    };

    const result = await this.request<IyzicoPaymentResponse>(
      "/payment/3dsecure/auth",
      body
    );

    return {
      paymentId: result.paymentId,
      status: result.status,
      paymentStatus: result.paymentStatus,
      price: result.price,
      paidPrice: result.paidPrice,
      currency: result.currency,
      installment: result.installment,
      basketId: result.basketId,
      binNumber: result.binNumber,
      lastFourDigits: result.lastFourDigits,
      cardAssociation: result.cardAssociation,
      cardFamily: result.cardFamily,
      cardType: result.cardType,
      fraudStatus: result.fraudStatus,
      raw: result,
    };
  }

  // ============================================================================
  // Refund
  // ============================================================================

  /**
   * Create a refund
   */
  async createRefund(options: {
    paymentTransactionId: string;
    price: string;
    currency: "TRY" | "USD" | "EUR" | "GBP" | "IRR";
    ip: string;
    conversationId?: string;
  }): Promise<IyzicoRefundResult> {
    const body = {
      locale: "tr",
      conversationId: options.conversationId ?? this.generateRandomString(16),
      paymentTransactionId: options.paymentTransactionId,
      price: options.price,
      currency: options.currency,
      ip: options.ip,
    };

    const result = await this.request<IyzicoRefundResponse>(
      "/payment/refund",
      body
    );

    return {
      paymentId: result.paymentId,
      paymentTransactionId: result.paymentTransactionId,
      price: result.price,
      status: result.status,
    };
  }

  /**
   * Cancel a payment (full refund before settlement)
   */
  async cancelPayment(options: {
    paymentId: string;
    ip: string;
    conversationId?: string;
  }): Promise<IyzicoCancelResult> {
    const body = {
      locale: "tr",
      conversationId: options.conversationId ?? this.generateRandomString(16),
      paymentId: options.paymentId,
      ip: options.ip,
    };

    const result = await this.request<IyzicoCancelResponse>(
      "/payment/cancel",
      body
    );

    return {
      paymentId: result.paymentId,
      price: result.price,
      currency: result.currency,
      status: result.status,
    };
  }

  // ============================================================================
  // Installment
  // ============================================================================

  /**
   * Get installment info for a BIN number
   */
  async getInstallmentInfo(
    binNumber: string,
    price: string
  ): Promise<IyzicoInstallmentResult> {
    const body = {
      locale: "tr",
      conversationId: this.generateRandomString(16),
      binNumber: binNumber.substring(0, 6),
      price,
    };

    const result = await this.request<IyzicoInstallmentResponse>(
      "/payment/iyzi-pos/installment",
      body
    );

    return {
      installmentDetails: result.installmentDetails ?? [],
    };
  }

  // ============================================================================
  // Subscriptions - iyzico has separate subscription API
  // ============================================================================

  async createSubscription(_options: CreateSubscriptionOptions): Promise<Subscription> {
    throw new PaymentError(
      "Use iyzico subscription API methods directly",
      PaymentErrorCodes.API_ERROR
    );
  }

  async getSubscription(_subscriptionId: string): Promise<Subscription | null> {
    return null;
  }

  async updateSubscription(
    _subscriptionId: string,
    _options: UpdateSubscriptionOptions
  ): Promise<Subscription> {
    throw new PaymentError(
      "Use iyzico subscription API methods directly",
      PaymentErrorCodes.API_ERROR
    );
  }

  async cancelSubscription(
    _subscriptionId: string,
    _cancelAtPeriodEnd?: boolean
  ): Promise<Subscription> {
    throw new PaymentError(
      "Use iyzico subscription API methods directly",
      PaymentErrorCodes.API_ERROR
    );
  }

  async listSubscriptions(_customerId: string): Promise<Subscription[]> {
    return [];
  }

  // ============================================================================
  // Portal - not supported
  // ============================================================================

  async createPortalSession(_options: CreatePortalOptions): Promise<PortalSession> {
    throw new PaymentError(
      "iyzico does not support customer portal",
      PaymentErrorCodes.API_ERROR
    );
  }

  // ============================================================================
  // Webhooks
  // ============================================================================

  async verifyWebhook(
    payload: string | Uint8Array,
    _signature: string
  ): Promise<WebhookEvent | null> {
    // iyzico uses IPN (Instant Payment Notification) system
    // The callback includes payment data that should be verified by retrieving the payment

    const payloadString = typeof payload === "string" ? payload : new TextDecoder().decode(payload);

    try {
      const data = JSON.parse(payloadString) as {
        token?: string;
        paymentId?: string;
        status?: string;
        iyziEventType?: string;
      };

      // Verify by retrieving the payment
      if (data.token) {
        const result = await this.retrieveCheckoutForm(data.token);

        return {
          id: result.paymentId ?? data.token,
          type: this.mapEventType(data.status ?? result.status),
          data: result,
          created: new Date(),
          provider: "iyzico",
          raw: data,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  private mapEventType(status: string): WebhookEventType {
    const mapping: Record<string, WebhookEventType> = {
      success: "payment.succeeded",
      failure: "payment.failed",
      INIT_THREEDS: "payment.succeeded",
      CALLBACK_THREEDS: "payment.succeeded",
    };

    return mapping[status] ?? "payment.succeeded";
  }
}

// ============================================================================
// iyzico Response Types
// ============================================================================

interface IyzicoResponse {
  status: "success" | "failure";
  errorCode?: string;
  errorMessage?: string;
  locale?: string;
  systemTime?: number;
  conversationId?: string;
}

interface IyzicoCheckoutFormResponse extends IyzicoResponse {
  token: string;
  checkoutFormContent: string;
  tokenExpireTime: number;
  paymentPageUrl: string;
}

interface IyzicoPaymentResponse extends IyzicoResponse {
  paymentId: string;
  paymentStatus: string;
  price: string;
  paidPrice: string;
  currency: string;
  installment: number;
  basketId: string;
  binNumber: string;
  lastFourDigits: string;
  cardAssociation: string;
  cardFamily: string;
  cardType: string;
  fraudStatus: number;
  itemTransactions?: Array<{
    itemId: string;
    paymentTransactionId: string;
    transactionStatus: number;
    price: string;
    paidPrice: string;
  }>;
}

interface IyzicoThreeDSResponse extends IyzicoResponse {
  threeDSHtmlContent: string;
}

interface IyzicoRefundResponse extends IyzicoResponse {
  paymentId: string;
  paymentTransactionId: string;
  price: string;
}

interface IyzicoCancelResponse extends IyzicoResponse {
  paymentId: string;
  price: string;
  currency: string;
}

interface IyzicoInstallmentResponse extends IyzicoResponse {
  installmentDetails?: Array<{
    binNumber: string;
    price: string;
    cardType: string;
    cardAssociation: string;
    cardFamilyName: string;
    force3ds: number;
    bankCode: number;
    bankName: string;
    forceCvc: number;
    installmentPrices: Array<{
      installmentNumber: number;
      totalPrice: string;
      installmentPrice: string;
    }>;
  }>;
}

// ============================================================================
// Result Types
// ============================================================================

export interface IyzicoCheckoutResult {
  token: string;
  checkoutFormContent: string;
  tokenExpireTime: number;
  paymentPageUrl: string;
}

export interface IyzicoPaymentResult {
  paymentId: string;
  status: string;
  paymentStatus: string;
  price: string;
  paidPrice: string;
  currency: string;
  installment: number;
  basketId: string;
  binNumber: string;
  lastFourDigits: string;
  cardAssociation: string;
  cardFamily: string;
  cardType: string;
  fraudStatus: number;
  raw: unknown;
}

export interface IyzicoThreeDSInitResult {
  threeDSHtmlContent: string;
  status: string;
}

export interface IyzicoRefundResult {
  paymentId: string;
  paymentTransactionId: string;
  price: string;
  status: string;
}

export interface IyzicoCancelResult {
  paymentId: string;
  price: string;
  currency: string;
  status: string;
}

export interface IyzicoInstallmentResult {
  installmentDetails: Array<{
    binNumber: string;
    price: string;
    cardType: string;
    cardAssociation: string;
    cardFamilyName: string;
    force3ds: number;
    bankCode: number;
    bankName: string;
    forceCvc: number;
    installmentPrices: Array<{
      installmentNumber: number;
      totalPrice: string;
      installmentPrice: string;
    }>;
  }>;
}

/**
 * Create an iyzico provider
 */
export function createIyzicoProvider(config: IyzicoProviderConfig): IyzicoProvider {
  return new IyzicoProvider(config);
}
