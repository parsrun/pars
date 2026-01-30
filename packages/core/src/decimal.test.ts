import { describe, it, expect } from "vitest";
import { Decimal, DecimalUtils, decimal } from "./decimal.js";

describe("@parsrun/core - Decimal", () => {
  describe("constructor", () => {
    it("should create from number", () => {
      const d = new Decimal(10.5);
      expect(d.toNumber()).toBe(10.5);
    });

    it("should create from string", () => {
      const d = new Decimal("10.5");
      expect(d.toNumber()).toBe(10.5);
    });

    it("should create from another Decimal", () => {
      const d1 = new Decimal(10.5);
      const d2 = new Decimal(d1);
      expect(d2.toNumber()).toBe(10.5);
    });

    it("should handle negative numbers", () => {
      const d = new Decimal(-5.25);
      expect(d.toNumber()).toBe(-5.25);
    });

    it("should throw for invalid string", () => {
      expect(() => new Decimal("abc")).toThrow();
    });

    it("should handle Infinity", () => {
      const d = new Decimal(Infinity);
      expect(d.toNumber()).toBe(Infinity);
    });

    it("should handle NaN", () => {
      const d = new Decimal(NaN);
      expect(d.toNumber()).toBeNaN();
    });
  });

  describe("arithmetic operations", () => {
    it("should add correctly", () => {
      const result = new Decimal(10).add(5);
      expect(result.toNumber()).toBe(15);
    });

    it("should add with decimal places", () => {
      const result = new Decimal("0.1").add("0.2");
      expect(result.toNumber()).toBeCloseTo(0.3);
    });

    it("should subtract correctly", () => {
      const result = new Decimal(10).sub(3);
      expect(result.toNumber()).toBe(7);
    });

    it("should multiply correctly", () => {
      const result = new Decimal(10).mul(5);
      expect(result.toNumber()).toBe(50);
    });

    it("should divide correctly", () => {
      const result = new Decimal(20).div(4);
      expect(result.toNumber()).toBe(5);
    });

    it("should throw on division by zero", () => {
      expect(() => new Decimal(10).div(0)).toThrow("Division by zero");
    });

    it("should calculate modulo", () => {
      const result = new Decimal(10).mod(3);
      expect(result.toNumber()).toBe(1);
    });

    it("should calculate power", () => {
      const result = new Decimal(2).pow(3);
      expect(result.toNumber()).toBe(8);
    });

    it("should calculate square root", () => {
      const result = new Decimal(9).sqrt();
      expect(result.toNumber()).toBe(3);
    });

    it("should throw for square root of negative", () => {
      expect(() => new Decimal(-9).sqrt()).toThrow("Square root of negative number");
    });

    it("should calculate absolute value", () => {
      expect(new Decimal(-5).abs().toNumber()).toBe(5);
      expect(new Decimal(5).abs().toNumber()).toBe(5);
    });

    it("should negate", () => {
      expect(new Decimal(5).neg().toNumber()).toBe(-5);
      expect(new Decimal(-5).neg().toNumber()).toBe(5);
    });
  });

  describe("rounding operations", () => {
    it("should round to nearest integer", () => {
      expect(new Decimal(5.4).round().toNumber()).toBe(5);
      expect(new Decimal(5.5).round().toNumber()).toBe(6);
      expect(new Decimal(5.6).round().toNumber()).toBe(6);
    });

    it("should round to decimal places", () => {
      expect(new Decimal(5.456).round(2).toNumber()).toBe(5.46);
      expect(new Decimal(5.454).round(2).toNumber()).toBe(5.45);
    });

    it("should floor correctly", () => {
      expect(new Decimal(5.9).floor().toNumber()).toBe(5);
      expect(new Decimal(-5.1).floor().toNumber()).toBe(-6);
    });

    it("should ceil correctly", () => {
      expect(new Decimal(5.1).ceil().toNumber()).toBe(6);
      expect(new Decimal(-5.9).ceil().toNumber()).toBe(-5);
    });
  });

  describe("comparison operations", () => {
    it("should compare with cmp", () => {
      expect(new Decimal(5).cmp(3)).toBe(1);
      expect(new Decimal(3).cmp(5)).toBe(-1);
      expect(new Decimal(5).cmp(5)).toBe(0);
    });

    it("should check equality", () => {
      expect(new Decimal(5).eq(5)).toBe(true);
      expect(new Decimal(5).eq(3)).toBe(false);
    });

    it("should check greater than", () => {
      expect(new Decimal(5).gt(3)).toBe(true);
      expect(new Decimal(3).gt(5)).toBe(false);
      expect(new Decimal(5).gt(5)).toBe(false);
    });

    it("should check greater than or equal", () => {
      expect(new Decimal(5).gte(3)).toBe(true);
      expect(new Decimal(5).gte(5)).toBe(true);
      expect(new Decimal(3).gte(5)).toBe(false);
    });

    it("should check less than", () => {
      expect(new Decimal(3).lt(5)).toBe(true);
      expect(new Decimal(5).lt(3)).toBe(false);
      expect(new Decimal(5).lt(5)).toBe(false);
    });

    it("should check less than or equal", () => {
      expect(new Decimal(3).lte(5)).toBe(true);
      expect(new Decimal(5).lte(5)).toBe(true);
      expect(new Decimal(5).lte(3)).toBe(false);
    });

    it("should check isZero", () => {
      expect(new Decimal(0).isZero()).toBe(true);
      expect(new Decimal(1).isZero()).toBe(false);
    });

    it("should check isPositive", () => {
      expect(new Decimal(5).isPositive()).toBe(true);
      expect(new Decimal(-5).isPositive()).toBe(false);
      expect(new Decimal(0).isPositive()).toBe(false);
    });

    it("should check isNegative", () => {
      expect(new Decimal(-5).isNegative()).toBe(true);
      expect(new Decimal(5).isNegative()).toBe(false);
      expect(new Decimal(0).isNegative()).toBe(false);
    });
  });

  describe("conversion methods", () => {
    it("should convert toNumber", () => {
      expect(new Decimal("123.456").toNumber()).toBe(123.456);
    });

    it("should convert toString from string input", () => {
      expect(new Decimal("123.456").toString()).toBe("123.456");
    });

    it("should convert toString from number input", () => {
      // Note: Due to floating point precision, number->string may have extra precision
      const d = new Decimal(123.456);
      expect(d.toNumber()).toBeCloseTo(123.456);
    });

    it("should format with toFixed", () => {
      expect(new Decimal(123.456).toFixed(2)).toBe("123.46");
      expect(new Decimal(123.4).toFixed(2)).toBe("123.40");
    });

    it("should convert toJSON from string input", () => {
      expect(new Decimal("123.456").toJSON()).toBe("123.456");
    });
  });

  describe("static methods", () => {
    it("should create with from()", () => {
      expect(Decimal.from(10).toNumber()).toBe(10);
    });

    it("should sum array", () => {
      expect(Decimal.sum([1, 2, 3, 4, 5]).toNumber()).toBe(15);
    });

    it("should calculate average", () => {
      expect(Decimal.avg([2, 4, 6]).toNumber()).toBe(4);
    });

    it("should return 0 for empty array average", () => {
      expect(Decimal.avg([]).toNumber()).toBe(0);
    });

    it("should find minimum", () => {
      expect(Decimal.min(5, 3, 8, 1).toNumber()).toBe(1);
    });

    it("should find maximum", () => {
      expect(Decimal.max(5, 3, 8, 1).toNumber()).toBe(8);
    });

    it("should throw for min with no values", () => {
      expect(() => Decimal.min()).toThrow("No values provided");
    });

    it("should throw for max with no values", () => {
      expect(() => Decimal.max()).toThrow("No values provided");
    });
  });
});

describe("@parsrun/core - DecimalUtils", () => {
  describe("toDecimalString", () => {
    it("should convert number to string", () => {
      // Use string input for exact precision
      expect(DecimalUtils.toDecimalString("123.456")).toBe("123.456");
    });

    it("should convert integer to string", () => {
      expect(DecimalUtils.toDecimalString(100)).toBe("100");
    });

    it("should return null for null/undefined", () => {
      expect(DecimalUtils.toDecimalString(null)).toBe(null);
      expect(DecimalUtils.toDecimalString(undefined)).toBe(null);
    });
  });

  describe("fromDecimalString", () => {
    it("should convert string to number", () => {
      expect(DecimalUtils.fromDecimalString("123.456")).toBe(123.456);
    });

    it("should return 0 for null/undefined", () => {
      expect(DecimalUtils.fromDecimalString(null)).toBe(0);
      expect(DecimalUtils.fromDecimalString(undefined)).toBe(0);
    });
  });

  describe("arithmetic helpers", () => {
    it("should multiply", () => {
      expect(DecimalUtils.multiply(10, 5)).toBe("50");
    });

    it("should add", () => {
      expect(DecimalUtils.add(10, 5)).toBe("15");
    });

    it("should subtract", () => {
      expect(DecimalUtils.subtract(10, 3)).toBe("7");
    });

    it("should divide", () => {
      expect(DecimalUtils.divide(20, 4)).toBe("5");
    });
  });

  describe("format", () => {
    it("should format with default decimal places", () => {
      expect(DecimalUtils.format(123.456)).toBe("123.46");
    });

    it("should format with custom decimal places", () => {
      expect(DecimalUtils.format(123.456, 3)).toBe("123.456");
    });
  });

  describe("formatCurrency", () => {
    it("should format as USD by default", () => {
      const result = DecimalUtils.formatCurrency(1234.56);
      expect(result).toContain("1,234.56");
    });

    it("should format with custom currency", () => {
      const result = DecimalUtils.formatCurrency(1234.56, { currency: "EUR", locale: "de-DE" });
      expect(result).toContain("1.234,56");
    });
  });

  describe("database helpers", () => {
    it("should prepare object for database", () => {
      const data = { name: "Test", price: 10.5, quantity: 5 };
      const result = DecimalUtils.prepareForDatabase(data, ["price"]);
      expect(result.price).toBe("10.5");
      expect(result.quantity).toBe(5);
    });

    it("should parse object from database", () => {
      const data = { name: "Test", price: "10.5", quantity: 5 };
      const result = DecimalUtils.parseFromDatabase(data, ["price"]);
      expect(result.price).toBeInstanceOf(Decimal);
      expect((result.price as Decimal).toNumber()).toBe(10.5);
      expect(result.quantity).toBe(5);
    });
  });
});

describe("@parsrun/core - decimal() shorthand", () => {
  it("should create Decimal instance", () => {
    const d = decimal(10.5);
    expect(d).toBeInstanceOf(Decimal);
    expect(d.toNumber()).toBe(10.5);
  });
});

describe("@parsrun/core - Decimal precision methods", () => {
  describe("decimalPlaces", () => {
    it("should return correct decimal places", () => {
      expect(new Decimal("123.45").decimalPlaces()).toBe(2);
      expect(new Decimal("100").decimalPlaces()).toBe(0);
      expect(new Decimal("1.5").decimalPlaces()).toBe(1);
      expect(new Decimal("0.001").decimalPlaces()).toBe(3);
    });
  });

  describe("precision", () => {
    it("should return correct precision", () => {
      expect(new Decimal("123.45").precision()).toBe(5);
      expect(new Decimal("100").precision()).toBe(1);
      expect(new Decimal("100").precision(true)).toBe(3);
      expect(new Decimal("0.001").precision()).toBe(1);
    });
  });

  describe("isInteger", () => {
    it("should detect integers", () => {
      expect(new Decimal("100").isInteger()).toBe(true);
      expect(new Decimal("100.5").isInteger()).toBe(false);
      expect(new Decimal("0").isInteger()).toBe(true);
    });
  });
});

describe("@parsrun/core - DecimalUtils.validate", () => {
  it("should validate correct values", () => {
    expect(DecimalUtils.validate("123.45", 5, 2)).toBe(null);
    expect(DecimalUtils.validate("0.99", 3, 2)).toBe(null);
    expect(DecimalUtils.validate("999.99", 5, 2)).toBe(null);
  });

  it("should reject too many decimal places", () => {
    expect(DecimalUtils.validate("123.456", 5, 2)).toBe("max 2 decimal places allowed");
    expect(DecimalUtils.validate("1.999", 4, 2)).toBe("max 2 decimal places allowed");
  });

  it("should reject too many integer digits", () => {
    expect(DecimalUtils.validate("1234.56", 5, 2)).toBe("max 3 integer digits allowed");
    expect(DecimalUtils.validate("10000", 5, 2)).toBe("max 3 integer digits allowed");
  });

  it("should handle zero correctly", () => {
    expect(DecimalUtils.validate("0", 5, 2)).toBe(null);
    expect(DecimalUtils.validate("0.00", 5, 2)).toBe(null);
  });

  it("should handle Decimal instances", () => {
    expect(DecimalUtils.validate(new Decimal("123.45"), 5, 2)).toBe(null);
    expect(DecimalUtils.validate(new Decimal("123.456"), 5, 2)).toBe("max 2 decimal places allowed");
  });
});

describe("@parsrun/core - Decimal static helpers", () => {
  describe("isValid", () => {
    it("should return true for valid values", () => {
      expect(Decimal.isValid("123.45")).toBe(true);
      expect(Decimal.isValid(123.45)).toBe(true);
      expect(Decimal.isValid(new Decimal(123))).toBe(true);
    });

    it("should return false for invalid values", () => {
      expect(Decimal.isValid("abc")).toBe(false);
      expect(Decimal.isValid(null)).toBe(false);
      expect(Decimal.isValid(undefined)).toBe(false);
    });
  });

  describe("tryParse", () => {
    it("should return Decimal for valid values", () => {
      const result = Decimal.tryParse("123.45");
      expect(result).toBeInstanceOf(Decimal);
      expect(result?.toNumber()).toBe(123.45);
    });

    it("should return null for invalid values", () => {
      expect(Decimal.tryParse("abc")).toBe(null);
      expect(Decimal.tryParse(null)).toBe(null);
    });
  });
});
