/**
 * @parsrun/core - Decimal Utilities
 * Precise decimal calculations for financial and quantity operations
 * Edge-compatible - no external dependencies
 */

/**
 * Internal precision for calculations
 */
const PRECISION = 20;

/**
 * Decimal class for precise arithmetic
 * Uses string-based arithmetic to avoid floating point issues
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
   * Add two decimals
   */
  add(other: number | string | Decimal): Decimal {
    const a = parseFloat(this.value);
    const b = parseFloat(other instanceof Decimal ? other.value : String(other));
    return new Decimal(a + b);
  }

  /**
   * Subtract
   */
  sub(other: number | string | Decimal): Decimal {
    const a = parseFloat(this.value);
    const b = parseFloat(other instanceof Decimal ? other.value : String(other));
    return new Decimal(a - b);
  }

  /**
   * Multiply
   */
  mul(other: number | string | Decimal): Decimal {
    const a = parseFloat(this.value);
    const b = parseFloat(other instanceof Decimal ? other.value : String(other));
    return new Decimal(a * b);
  }

  /**
   * Divide
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
   * Modulo
   */
  mod(other: number | string | Decimal): Decimal {
    const a = parseFloat(this.value);
    const b = parseFloat(other instanceof Decimal ? other.value : String(other));
    return new Decimal(a % b);
  }

  /**
   * Power
   */
  pow(exp: number): Decimal {
    const a = parseFloat(this.value);
    return new Decimal(Math.pow(a, exp));
  }

  /**
   * Square root
   */
  sqrt(): Decimal {
    const a = parseFloat(this.value);
    if (a < 0) {
      throw new Error("Square root of negative number");
    }
    return new Decimal(Math.sqrt(a));
  }

  /**
   * Absolute value
   */
  abs(): Decimal {
    const a = parseFloat(this.value);
    return new Decimal(Math.abs(a));
  }

  /**
   * Negate
   */
  neg(): Decimal {
    const a = parseFloat(this.value);
    return new Decimal(-a);
  }

  /**
   * Round to decimal places
   */
  round(decimals: number = 0): Decimal {
    const a = parseFloat(this.value);
    const factor = Math.pow(10, decimals);
    return new Decimal(Math.round(a * factor) / factor);
  }

  /**
   * Floor to decimal places
   */
  floor(decimals: number = 0): Decimal {
    const a = parseFloat(this.value);
    const factor = Math.pow(10, decimals);
    return new Decimal(Math.floor(a * factor) / factor);
  }

  /**
   * Ceiling to decimal places
   */
  ceil(decimals: number = 0): Decimal {
    const a = parseFloat(this.value);
    const factor = Math.pow(10, decimals);
    return new Decimal(Math.ceil(a * factor) / factor);
  }

  /**
   * Compare: returns -1, 0, or 1
   */
  cmp(other: number | string | Decimal): -1 | 0 | 1 {
    const a = parseFloat(this.value);
    const b = parseFloat(other instanceof Decimal ? other.value : String(other));
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  /**
   * Equality check
   */
  eq(other: number | string | Decimal): boolean {
    return this.cmp(other) === 0;
  }

  /**
   * Greater than
   */
  gt(other: number | string | Decimal): boolean {
    return this.cmp(other) === 1;
  }

  /**
   * Greater than or equal
   */
  gte(other: number | string | Decimal): boolean {
    return this.cmp(other) >= 0;
  }

  /**
   * Less than
   */
  lt(other: number | string | Decimal): boolean {
    return this.cmp(other) === -1;
  }

  /**
   * Less than or equal
   */
  lte(other: number | string | Decimal): boolean {
    return this.cmp(other) <= 0;
  }

  /**
   * Check if zero
   */
  isZero(): boolean {
    return parseFloat(this.value) === 0;
  }

  /**
   * Check if positive
   */
  isPositive(): boolean {
    return parseFloat(this.value) > 0;
  }

  /**
   * Check if negative
   */
  isNegative(): boolean {
    return parseFloat(this.value) < 0;
  }

  /**
   * Convert to number
   */
  toNumber(): number {
    return parseFloat(this.value);
  }

  /**
   * Convert to string
   */
  toString(): string {
    return this.value;
  }

  /**
   * Format with fixed decimal places
   */
  toFixed(decimals: number = 2): string {
    return parseFloat(this.value).toFixed(decimals);
  }

  /**
   * Convert to JSON (string representation)
   */
  toJSON(): string {
    return this.value;
  }

  /**
   * Static: Create from value
   */
  static from(value: number | string | Decimal): Decimal {
    return new Decimal(value);
  }

  /**
   * Static: Sum array of values
   */
  static sum(values: (number | string | Decimal)[]): Decimal {
    return values.reduce<Decimal>(
      (acc, val) => acc.add(val),
      new Decimal(0)
    );
  }

  /**
   * Static: Average of array
   */
  static avg(values: (number | string | Decimal)[]): Decimal {
    if (values.length === 0) return new Decimal(0);
    return Decimal.sum(values).div(values.length);
  }

  /**
   * Static: Min of array
   */
  static min(...values: (number | string | Decimal)[]): Decimal {
    if (values.length === 0) throw new Error("No values provided");
    return values.reduce<Decimal>((min, val) => {
      const d = new Decimal(val);
      return d.lt(min) ? d : min;
    }, new Decimal(values[0]!));
  }

  /**
   * Static: Max of array
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
 * Decimal utilities for database operations
 */
export const DecimalUtils = {
  /**
   * Convert number to database decimal string
   */
  toDecimalString(value: number | string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    return new Decimal(value).toString();
  },

  /**
   * Convert database decimal string to number
   */
  fromDecimalString(value: string | null | undefined): number {
    if (!value) return 0;
    return new Decimal(value).toNumber();
  },

  /**
   * Perform precise decimal multiplication
   */
  multiply(a: number | string, b: number | string): string {
    return new Decimal(a).mul(b).toString();
  },

  /**
   * Perform precise decimal addition
   */
  add(a: number | string, b: number | string): string {
    return new Decimal(a).add(b).toString();
  },

  /**
   * Perform precise decimal subtraction
   */
  subtract(a: number | string, b: number | string): string {
    return new Decimal(a).sub(b).toString();
  },

  /**
   * Perform precise decimal division
   */
  divide(a: number | string, b: number | string): string {
    return new Decimal(a).div(b).toString();
  },

  /**
   * Format decimal for display
   */
  format(value: string | number, decimalPlaces: number = 2): string {
    return new Decimal(value).toFixed(decimalPlaces);
  },

  /**
   * Format as currency
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
   * Convert object with decimal fields for database insert/update
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
   * Convert object with decimal fields from database
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
 * Shorthand for creating Decimal
 */
export function decimal(value: number | string): Decimal {
  return new Decimal(value);
}
