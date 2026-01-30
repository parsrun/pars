/**
 * @parsrun/core - Decimal Utilities
 * Precise decimal calculations for financial and quantity operations.
 * Edge-compatible - wraps decimal.js for arbitrary precision arithmetic.
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
 * // Precision info
 * const d = new Decimal('123.45');
 * d.precision();      // 5 (total significant digits)
 * d.decimalPlaces();  // 2 (digits after decimal point)
 *
 * // Static helpers
 * const sum = Decimal.sum(['10.50', '20.25', '15.75']);
 * const avg = Decimal.avg([100, 200, 300]);
 * ```
 */

import DecimalJS from 'decimal.js';

// Configure decimal.js for financial precision
DecimalJS.set({
  precision: 40,
  rounding: DecimalJS.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 21,
});

/**
 * Decimal class for precise arithmetic operations.
 * Wraps decimal.js to provide arbitrary precision decimal arithmetic.
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
  private readonly _value: DecimalJS;

  constructor(value: number | string | Decimal | DecimalJS) {
    if (value instanceof Decimal) {
      this._value = value._value;
    } else if (value instanceof DecimalJS) {
      this._value = value;
    } else {
      this._value = new DecimalJS(value);
    }
  }

  /**
   * Add another value to this decimal.
   * @param other - Value to add
   * @returns A new Decimal with the result
   */
  add(other: number | string | Decimal): Decimal {
    const otherValue = other instanceof Decimal ? other._value : other;
    return new Decimal(this._value.plus(otherValue));
  }

  /**
   * Subtract a value from this decimal.
   * @param other - Value to subtract
   * @returns A new Decimal with the result
   */
  sub(other: number | string | Decimal): Decimal {
    const otherValue = other instanceof Decimal ? other._value : other;
    return new Decimal(this._value.minus(otherValue));
  }

  /**
   * Multiply this decimal by another value.
   * @param other - Value to multiply by
   * @returns A new Decimal with the result
   */
  mul(other: number | string | Decimal): Decimal {
    const otherValue = other instanceof Decimal ? other._value : other;
    return new Decimal(this._value.times(otherValue));
  }

  /**
   * Divide this decimal by another value.
   * @param other - Value to divide by
   * @returns A new Decimal with the result
   * @throws Error if dividing by zero
   */
  div(other: number | string | Decimal): Decimal {
    const otherValue = other instanceof Decimal ? other._value : other;
    const divisor = new DecimalJS(otherValue);
    if (divisor.isZero()) {
      throw new Error('Division by zero');
    }
    return new Decimal(this._value.dividedBy(divisor));
  }

  /**
   * Get the modulo (remainder) of dividing this decimal by another value.
   * @param other - Value to divide by
   * @returns A new Decimal with the remainder
   */
  mod(other: number | string | Decimal): Decimal {
    const otherValue = other instanceof Decimal ? other._value : other;
    return new Decimal(this._value.modulo(otherValue));
  }

  /**
   * Raise this decimal to a power.
   * @param exp - The exponent
   * @returns A new Decimal with the result
   */
  pow(exp: number): Decimal {
    return new Decimal(this._value.pow(exp));
  }

  /**
   * Calculate the square root of this decimal.
   * @returns A new Decimal with the square root
   * @throws Error if the value is negative
   */
  sqrt(): Decimal {
    if (this._value.isNegative()) {
      throw new Error('Square root of negative number');
    }
    return new Decimal(this._value.sqrt());
  }

  /**
   * Get the absolute value of this decimal.
   * @returns A new Decimal with the absolute value
   */
  abs(): Decimal {
    return new Decimal(this._value.abs());
  }

  /**
   * Negate this decimal (multiply by -1).
   * @returns A new Decimal with the negated value
   */
  neg(): Decimal {
    return new Decimal(this._value.negated());
  }

  /**
   * Round to the specified number of decimal places using standard rounding.
   * @param decimals - Number of decimal places (default: 0)
   * @returns A new Decimal with the rounded value
   */
  round(decimals: number = 0): Decimal {
    return new Decimal(this._value.toDecimalPlaces(decimals, DecimalJS.ROUND_HALF_UP));
  }

  /**
   * Round down to the specified number of decimal places.
   * @param decimals - Number of decimal places (default: 0)
   * @returns A new Decimal with the floored value
   */
  floor(decimals: number = 0): Decimal {
    return new Decimal(this._value.toDecimalPlaces(decimals, DecimalJS.ROUND_FLOOR));
  }

  /**
   * Round up to the specified number of decimal places.
   * @param decimals - Number of decimal places (default: 0)
   * @returns A new Decimal with the ceiled value
   */
  ceil(decimals: number = 0): Decimal {
    return new Decimal(this._value.toDecimalPlaces(decimals, DecimalJS.ROUND_CEIL));
  }

  /**
   * Compare this decimal to another value.
   * @param other - Value to compare against
   * @returns -1 if less, 0 if equal, 1 if greater
   */
  cmp(other: number | string | Decimal): -1 | 0 | 1 {
    const otherValue = other instanceof Decimal ? other._value : other;
    return this._value.comparedTo(otherValue) as -1 | 0 | 1;
  }

  /**
   * Check if this decimal equals another value.
   * @param other - Value to compare against
   * @returns True if values are equal
   */
  eq(other: number | string | Decimal): boolean {
    const otherValue = other instanceof Decimal ? other._value : other;
    return this._value.equals(otherValue);
  }

  /**
   * Check if this decimal is greater than another value.
   * @param other - Value to compare against
   * @returns True if this is greater
   */
  gt(other: number | string | Decimal): boolean {
    const otherValue = other instanceof Decimal ? other._value : other;
    return this._value.greaterThan(otherValue);
  }

  /**
   * Check if this decimal is greater than or equal to another value.
   * @param other - Value to compare against
   * @returns True if this is greater or equal
   */
  gte(other: number | string | Decimal): boolean {
    const otherValue = other instanceof Decimal ? other._value : other;
    return this._value.greaterThanOrEqualTo(otherValue);
  }

  /**
   * Check if this decimal is less than another value.
   * @param other - Value to compare against
   * @returns True if this is less
   */
  lt(other: number | string | Decimal): boolean {
    const otherValue = other instanceof Decimal ? other._value : other;
    return this._value.lessThan(otherValue);
  }

  /**
   * Check if this decimal is less than or equal to another value.
   * @param other - Value to compare against
   * @returns True if this is less or equal
   */
  lte(other: number | string | Decimal): boolean {
    const otherValue = other instanceof Decimal ? other._value : other;
    return this._value.lessThanOrEqualTo(otherValue);
  }

  /**
   * Check if this decimal is exactly zero.
   * @returns True if value is zero
   */
  isZero(): boolean {
    return this._value.isZero();
  }

  /**
   * Check if this decimal is positive (greater than zero).
   * @returns True if value is positive
   */
  isPositive(): boolean {
    return this._value.isPositive() && !this._value.isZero();
  }

  /**
   * Check if this decimal is negative (less than zero).
   * @returns True if value is negative
   */
  isNegative(): boolean {
    return this._value.isNegative();
  }

  /**
   * Check if this decimal is an integer (no decimal places).
   * @returns True if value is an integer
   */
  isInteger(): boolean {
    return this._value.isInteger();
  }

  /**
   * Get the number of decimal places (digits after the decimal point).
   * @returns Number of decimal places
   *
   * @example
   * ```typescript
   * new Decimal('123.45').decimalPlaces(); // 2
   * new Decimal('100').decimalPlaces();    // 0
   * new Decimal('1.500').decimalPlaces();  // 1 (trailing zeros removed)
   * ```
   */
  decimalPlaces(): number {
    return this._value.decimalPlaces();
  }

  /**
   * Get the precision (total number of significant digits).
   * @param includeZeros - If true, include trailing zeros in the count
   * @returns The precision
   *
   * @example
   * ```typescript
   * new Decimal('123.45').precision();     // 5
   * new Decimal('100').precision();        // 1
   * new Decimal('100').precision(true);    // 3
   * ```
   */
  precision(includeZeros: boolean = false): number {
    return this._value.precision(includeZeros);
  }

  /**
   * Convert this decimal to a JavaScript number.
   * Warning: May lose precision for very large or very precise numbers.
   * @returns The numeric value
   */
  toNumber(): number {
    return this._value.toNumber();
  }

  /**
   * Convert this decimal to its string representation.
   * @returns The string value
   */
  toString(): string {
    return this._value.toString();
  }

  /**
   * Format this decimal with a fixed number of decimal places.
   * @param decimals - Number of decimal places (default: 2)
   * @returns Formatted string
   */
  toFixed(decimals: number = 2): string {
    return this._value.toFixed(decimals);
  }

  /**
   * Convert to JSON (returns string representation for serialization).
   * @returns The string value for JSON serialization
   */
  toJSON(): string {
    return this._value.toString();
  }

  /**
   * Get the underlying decimal.js instance.
   * Useful for advanced operations not covered by this wrapper.
   * @returns The underlying DecimalJS instance
   */
  toDecimalJS(): DecimalJS {
    return this._value;
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
    if (values.length === 0) throw new Error('No values provided');
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
    if (values.length === 0) throw new Error('No values provided');
    return values.reduce<Decimal>((max, val) => {
      const d = new Decimal(val);
      return d.gt(max) ? d : max;
    }, new Decimal(values[0]!));
  }

  /**
   * Check if a value is a valid decimal representation.
   * @param value - The value to check
   * @returns True if the value can be converted to a Decimal
   */
  static isValid(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (value instanceof Decimal) return true;
    try {
      new DecimalJS(value as string | number);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a Decimal or return null if the value is invalid.
   * @param value - The value to convert
   * @returns A Decimal or null
   */
  static tryParse(value: unknown): Decimal | null {
    if (!Decimal.isValid(value)) return null;
    return new Decimal(value as number | string | Decimal);
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
    const { currency = 'USD', locale = 'en-US', decimals = 2 } = options;
    const num = new Decimal(value).toNumber();
    return new Intl.NumberFormat(locale, {
      style: 'currency',
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
        if (typeof value === 'number' || typeof value === 'string') {
          (result as Record<string, unknown>)[field] = DecimalUtils.toDecimalString(value);
        } else if (value instanceof Decimal) {
          (result as Record<string, unknown>)[field] = value.toString();
        }
      }
    }
    return result;
  },

  /**
   * Parse an object from database by converting decimal string fields to Decimal instances.
   * @param data - The object from database
   * @param decimalFields - Array of field names that should be converted to Decimal
   * @returns A new object with specified fields converted to Decimal instances
   */
  parseFromDatabase<T extends Record<string, unknown>>(
    data: T,
    decimalFields: string[]
  ): T {
    const result = { ...data };
    for (const field of decimalFields) {
      if (field in result && result[field] !== undefined && result[field] !== null) {
        const value = result[field];
        if (typeof value === 'string' || typeof value === 'number') {
          (result as Record<string, unknown>)[field] = new Decimal(value);
        }
      }
    }
    return result;
  },

  /**
   * Validate that a value matches the specified precision and scale.
   * @param value - The value to validate
   * @param precision - Total number of digits (integer + decimal)
   * @param scale - Number of decimal places
   * @returns An error message if invalid, or null if valid
   *
   * @example
   * ```typescript
   * DecimalUtils.validate('123.45', 5, 2);   // null (valid)
   * DecimalUtils.validate('123.456', 5, 2);  // "max 2 decimal places allowed"
   * DecimalUtils.validate('1234.56', 5, 2);  // "max 3 integer digits allowed"
   * ```
   */
  validate(
    value: number | string | Decimal,
    precision: number,
    scale: number
  ): string | null {
    const d = value instanceof Decimal ? value : new Decimal(value);
    const maxIntDigits = precision - scale;

    // Check scale (decimal places)
    if (d.decimalPlaces() > scale) {
      return `max ${scale} decimal places allowed`;
    }

    // Check integer digits
    const absValue = d.abs();
    if (!absValue.isZero()) {
      // Count integer digits: precision(true) - decimalPlaces
      // But for numbers like 100, precision(true) gives 3, which is correct
      // For 100.00, we need the integer part's digit count
      const integerPart = absValue.floor(0);
      const intDigits = integerPart.isZero() ? 0 : integerPart.precision(true);

      if (intDigits > maxIntDigits) {
        return `max ${maxIntDigits} integer digits allowed`;
      }
    }

    return null;
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
