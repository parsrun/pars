/**
 * @parsrun/core - Decimal Utilities
 * Precise decimal calculations for financial and quantity operations.
 * Edge-compatible - no external dependencies.
 *
 * @example
 * ```typescript
 * import { Decimal, decimal } from '@parsrun/core';
 *
 * // Create decimals
 * const price = new Decimal('19.99');
 * const quantity = decimal(3);
 *
 * // Arithmetic operations (chainable)
 * const total = price.mul(quantity).round(2);
 * console.log(total.toString()); // '59.97'
 *
 * // Static helpers
 * const sum = Decimal.sum(['10.50', '20.25', '15.75']);
 * const avg = Decimal.avg([100, 200, 300]);
 * ```
 */

/**
 * Internal precision for calculations (number of decimal places)
 */
const PRECISION = 20;

/**
 * Decimal class for precise arithmetic operations.
 * Uses string-based representation internally to avoid floating point issues.
 *
 * @example
 * ```typescript
 * const a = new Decimal('0.1');
 * const b = new Decimal('0.2');
 * const c = a.add(b);
 * console.log(c.toString()); // '0.3' (not 0.30000000000000004)
 * ```
 */
export class Decimal {
  private value: string;

  constructor(value: number | string | Decimal) {
    if (value instanceof Decimal) {
      this.value = value.value;
    } else if (typeof value === "number") {
      this.value = this.normalizeNumber(value);
    } else {
      this.value = this.normalizeString(value);
    }
  }

  private normalizeNumber(n: number): string {
    if (!isFinite(n)) {
      throw new Error(`Invalid number: ${n}`);
    }
    return n.toFixed(PRECISION).replace(/\.?0+$/, "") || "0";
  }

  private normalizeString(s: string): string {
    const trimmed = s.trim();
    if (!/^-?\d*\.?\d+$/.test(trimmed)) {
      throw new Error(`Invalid decimal string: ${s}`);
    }
    return trimmed.replace(/^(-?)0+(?=\d)/, "$1").replace(/\.?0+$/, "") || "0";
  }

  /**
   * Add another value to this decimal.
   * @param other - Value to add
   * @returns A new Decimal with the result
   */
  add(other: number | string | Decimal): Decimal {
    const a = parseFloat(this.value);
    const b = parseFloat(other instanceof Decimal ? other.value : String(other));
    return new Decimal(a + b);
  }

  /**
   * Subtract a value from this decimal.
   * @param other - Value to subtract
   * @returns A new Decimal with the result
   */
  sub(other: number | string | Decimal): Decimal {
    const a = parseFloat(this.value);
    const b = parseFloat(other instanceof Decimal ? other.value : String(other));
    return new Decimal(a - b);
  }

  /**
   * Multiply this decimal by another value.
   * @param other - Value to multiply by
   * @returns A new Decimal with the result
   */
  mul(other: number | string | Decimal): Decimal {
    const a = parseFloat(this.value);
    const b = parseFloat(other instanceof Decimal ? other.value : String(other));
    return new Decimal(a * b);
  }

  /**
   * Divide this decimal by another value.
   * @param other - Value to divide by
   * @returns A new Decimal with the result
   * @throws Error if dividing by zero
   */
  div(other: number | string | Decimal): Decimal {
    const a = parseFloat(this.value);
    const b = parseFloat(other instanceof Decimal ? other.value : String(other));
    if (b === 0) {
      throw new Error("Division by zero");
    }
    return new Decimal(a / b);
  }

  /**
   * Get the modulo (remainder) of dividing this decimal by another value.
   * @param other - Value to divide by
   * @returns A new Decimal with the remainder
   */
  mod(other: number | string | Decimal): Decimal {
    const a = parseFloat(this.value);
    const b = parseFloat(other instanceof Decimal ? other.value : String(other));
    return new Decimal(a % b);
  }

  /**
   * Raise this decimal to a power.
   * @param exp - The exponent
   * @returns A new Decimal with the result
   */
  pow(exp: number): Decimal {
    const a = parseFloat(this.value);
    return new Decimal(Math.pow(a, exp));
  }

  /**
   * Calculate the square root of this decimal.
   * @returns A new Decimal with the square root
   * @throws Error if the value is negative
   */
  sqrt(): Decimal {
    const a = parseFloat(this.value);
    if (a < 0) {
      throw new Error("Square root of negative number");
    }
    return new Decimal(Math.sqrt(a));
  }

  /**
   * Get the absolute value of this decimal.
   * @returns A new Decimal with the absolute value
   */
  abs(): Decimal {
    const a = parseFloat(this.value);
    return new Decimal(Math.abs(a));
  }

  /**
   * Negate this decimal (multiply by -1).
   * @returns A new Decimal with the negated value
   */
  neg(): Decimal {
    const a = parseFloat(this.value);
    return new Decimal(-a);
  }

  /**
   * Round to the specified number of decimal places using standard rounding.
   * @param decimals - Number of decimal places (default: 0)
   * @returns A new Decimal with the rounded value
   */
  round(decimals: number = 0): Decimal {
    const a = parseFloat(this.value);
    const factor = Math.pow(10, decimals);
    return new Decimal(Math.round(a * factor) / factor);
  }

  /**
   * Round down to the specified number of decimal places.
   * @param decimals - Number of decimal places (default: 0)
   * @returns A new Decimal with the floored value
   */
  floor(decimals: number = 0): Decimal {
    const a = parseFloat(this.value);
    const factor = Math.pow(10, decimals);
    return new Decimal(Math.floor(a * factor) / factor);
  }

  /**
   * Round up to the specified number of decimal places.
   * @param decimals - Number of decimal places (default: 0)
   * @returns A new Decimal with the ceiled value
   */
  ceil(decimals: number = 0): Decimal {
    const a = parseFloat(this.value);
    const factor = Math.pow(10, decimals);
    return new Decimal(Math.ceil(a * factor) / factor);
  }

  /**
   * Compare this decimal to another value.
   * @param other - Value to compare against
   * @returns -1 if less, 0 if equal, 1 if greater
   */
  cmp(other: number | string | Decimal): -1 | 0 | 1 {
    const a = parseFloat(this.value);
    const b = parseFloat(other instanceof Decimal ? other.value : String(other));
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  /**
   * Check if this decimal equals another value.
   * @param other - Value to compare against
   * @returns True if values are equal
   */
  eq(other: number | string | Decimal): boolean {
    return this.cmp(other) === 0;
  }

  /**
   * Check if this decimal is greater than another value.
   * @param other - Value to compare against
   * @returns True if this is greater
   */
  gt(other: number | string | Decimal): boolean {
    return this.cmp(other) === 1;
  }

  /**
   * Check if this decimal is greater than or equal to another value.
   * @param other - Value to compare against
   * @returns True if this is greater or equal
   */
  gte(other: number | string | Decimal): boolean {
    return this.cmp(other) >= 0;
  }

  /**
   * Check if this decimal is less than another value.
   * @param other - Value to compare against
   * @returns True if this is less
   */
  lt(other: number | string | Decimal): boolean {
    return this.cmp(other) === -1;
  }

  /**
   * Check if this decimal is less than or equal to another value.
   * @param other - Value to compare against
   * @returns True if this is less or equal
   */
  lte(other: number | string | Decimal): boolean {
    return this.cmp(other) <= 0;
  }

  /**
   * Check if this decimal is exactly zero.
   * @returns True if value is zero
   */
  isZero(): boolean {
    return parseFloat(this.value) === 0;
  }

  /**
   * Check if this decimal is positive (greater than zero).
   * @returns True if value is positive
   */
  isPositive(): boolean {
    return parseFloat(this.value) > 0;
  }

  /**
   * Check if this decimal is negative (less than zero).
   * @returns True if value is negative
   */
  isNegative(): boolean {
    return parseFloat(this.value) < 0;
  }

  /**
   * Convert this decimal to a JavaScript number.
   * @returns The numeric value
   */
  toNumber(): number {
    return parseFloat(this.value);
  }

  /**
   * Convert this decimal to its string representation.
   * @returns The string value
   */
  toString(): string {
    return this.value;
  }

  /**
   * Format this decimal with a fixed number of decimal places.
   * @param decimals - Number of decimal places (default: 2)
   * @returns Formatted string
   */
  toFixed(decimals: number = 2): string {
    return parseFloat(this.value).toFixed(decimals);
  }

  /**
   * Convert to JSON (returns string representation for serialization).
   * @returns The string value for JSON serialization
   */
  toJSON(): string {
    return this.value;
  }

  /**
   * Create a Decimal from a value (alias for constructor).
   * @param value - The value to convert
   * @returns A new Decimal instance
   */
  static from(value: number | string | Decimal): Decimal {
    return new Decimal(value);
  }

  /**
   * Calculate the sum of an array of values.
   * @param values - Array of values to sum
   * @returns A new Decimal with the sum
   */
  static sum(values: (number | string | Decimal)[]): Decimal {
    return values.reduce<Decimal>(
      (acc, val) => acc.add(val),
      new Decimal(0)
    );
  }

  /**
   * Calculate the average of an array of values.
   * @param values - Array of values to average
   * @returns A new Decimal with the average (0 if empty array)
   */
  static avg(values: (number | string | Decimal)[]): Decimal {
    if (values.length === 0) return new Decimal(0);
    return Decimal.sum(values).div(values.length);
  }

  /**
   * Find the minimum value from the provided values.
   * @param values - Values to compare
   * @returns A new Decimal with the minimum value
   * @throws Error if no values provided
   */
  static min(...values: (number | string | Decimal)[]): Decimal {
    if (values.length === 0) throw new Error("No values provided");
    return values.reduce<Decimal>((min, val) => {
      const d = new Decimal(val);
      return d.lt(min) ? d : min;
    }, new Decimal(values[0]!));
  }

  /**
   * Find the maximum value from the provided values.
   * @param values - Values to compare
   * @returns A new Decimal with the maximum value
   * @throws Error if no values provided
   */
  static max(...values: (number | string | Decimal)[]): Decimal {
    if (values.length === 0) throw new Error("No values provided");
    return values.reduce<Decimal>((max, val) => {
      const d = new Decimal(val);
      return d.gt(max) ? d : max;
    }, new Decimal(values[0]!));
  }
}

/**
 * Utility functions for working with decimals in database operations.
 * Provides helpers for converting between JavaScript numbers and database decimal strings.
 *
 * @example
 * ```typescript
 * // Convert numeric fields before database insert
 * const data = DecimalUtils.prepareForDatabase(
 *   { price: 19.99, quantity: 5 },
 *   ['price']
 * );
 *
 * // Format for display
 * DecimalUtils.formatCurrency('19.99', { currency: 'USD' }); // '$19.99'
 * ```
 */
export const DecimalUtils = {
  /**
   * Convert a number to a database-safe decimal string.
   * @param value - The value to convert
   * @returns The decimal string or null if value is null/undefined
   */
  toDecimalString(value: number | string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    return new Decimal(value).toString();
  },

  /**
   * Convert a database decimal string to a JavaScript number.
   * @param value - The decimal string from database
   * @returns The numeric value (0 if null/undefined/empty)
   */
  fromDecimalString(value: string | null | undefined): number {
    if (!value) return 0;
    return new Decimal(value).toNumber();
  },

  /**
   * Multiply two values with precise decimal arithmetic.
   * @param a - First value
   * @param b - Second value
   * @returns The product as a string
   */
  multiply(a: number | string, b: number | string): string {
    return new Decimal(a).mul(b).toString();
  },

  /**
   * Add two values with precise decimal arithmetic.
   * @param a - First value
   * @param b - Second value
   * @returns The sum as a string
   */
  add(a: number | string, b: number | string): string {
    return new Decimal(a).add(b).toString();
  },

  /**
   * Subtract two values with precise decimal arithmetic.
   * @param a - Value to subtract from
   * @param b - Value to subtract
   * @returns The difference as a string
   */
  subtract(a: number | string, b: number | string): string {
    return new Decimal(a).sub(b).toString();
  },

  /**
   * Divide two values with precise decimal arithmetic.
   * @param a - Dividend
   * @param b - Divisor
   * @returns The quotient as a string
   */
  divide(a: number | string, b: number | string): string {
    return new Decimal(a).div(b).toString();
  },

  /**
   * Format a decimal value for display with fixed decimal places.
   * @param value - The value to format
   * @param decimalPlaces - Number of decimal places (default: 2)
   * @returns Formatted string
   */
  format(value: string | number, decimalPlaces: number = 2): string {
    return new Decimal(value).toFixed(decimalPlaces);
  },

  /**
   * Format a value as currency using Intl.NumberFormat.
   * @param value - The value to format
   * @param options - Currency formatting options
   * @returns Formatted currency string
   */
  formatCurrency(
    value: string | number,
    options: {
      currency?: string;
      locale?: string;
      decimals?: number;
    } = {}
  ): string {
    const { currency = "USD", locale = "en-US", decimals = 2 } = options;
    const num = new Decimal(value).toNumber();
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  },

  /**
   * Prepare an object for database insert/update by converting numeric fields to decimal strings.
   * @param data - The object to prepare
   * @param decimalFields - Array of field names that should be converted to decimal strings
   * @returns A new object with specified fields converted to decimal strings
   */
  prepareForDatabase<T extends Record<string, unknown>>(
    data: T,
    decimalFields: string[]
  ): T {
    const result = { ...data };
    for (const field of decimalFields) {
      if (field in result && result[field] !== undefined && result[field] !== null) {
        const value = result[field];
        if (typeof value === "number") {
          (result as Record<string, unknown>)[field] = DecimalUtils.toDecimalString(value);
        }
      }
    }
    return result;
  },

  /**
   * Parse an object from database by converting decimal string fields to JavaScript numbers.
   * @param data - The object from database
   * @param decimalFields - Array of field names that should be converted from decimal strings
   * @returns A new object with specified fields converted to numbers
   */
  parseFromDatabase<T extends Record<string, unknown>>(
    data: T,
    decimalFields: string[]
  ): T {
    const result = { ...data };
    for (const field of decimalFields) {
      if (field in result && result[field] !== undefined && result[field] !== null) {
        const value = result[field];
        if (typeof value === "string") {
          (result as Record<string, unknown>)[field] = DecimalUtils.fromDecimalString(value);
        }
      }
    }
    return result;
  },
};

/**
 * Shorthand function for creating a Decimal instance.
 *
 * @param value - The value to convert to a Decimal
 * @returns A new Decimal instance
 *
 * @example
 * ```typescript
 * const price = decimal('19.99');
 * const total = decimal(100).mul(price);
 * ```
 */
export function decimal(value: number | string): Decimal {
  return new Decimal(value);
}
