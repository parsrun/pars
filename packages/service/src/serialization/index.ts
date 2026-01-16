/**
 * @parsrun/service - Serialization
 * JSON and MessagePack serializers
 */

// ============================================================================
// SERIALIZER INTERFACE
// ============================================================================

/**
 * Serializer interface for encoding/decoding data
 */
export interface Serializer {
  /** Encode data to string or buffer */
  encode(data: unknown): string | ArrayBuffer;
  /** Decode string or buffer to data */
  decode(raw: string | ArrayBuffer): unknown;
  /** Content type for HTTP headers */
  contentType: string;
}

// ============================================================================
// JSON SERIALIZER
// ============================================================================

/**
 * JSON serializer (default)
 */
export const jsonSerializer: Serializer = {
  encode(data: unknown): string {
    return JSON.stringify(data);
  },

  decode(raw: string | ArrayBuffer): unknown {
    if (raw instanceof ArrayBuffer) {
      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(raw));
    }
    return JSON.parse(raw);
  },

  contentType: "application/json",
};

// ============================================================================
// MESSAGEPACK SERIALIZER (Lightweight implementation)
// ============================================================================

/**
 * Lightweight MessagePack encoder
 * Supports: null, boolean, number, string, array, object
 */
function msgpackEncode(value: unknown): Uint8Array {
  const parts: Uint8Array[] = [];

  function encode(val: unknown): void {
    if (val === null || val === undefined) {
      parts.push(new Uint8Array([0xc0])); // nil
      return;
    }

    if (typeof val === "boolean") {
      parts.push(new Uint8Array([val ? 0xc3 : 0xc2]));
      return;
    }

    if (typeof val === "number") {
      if (Number.isInteger(val)) {
        if (val >= 0 && val <= 127) {
          // positive fixint
          parts.push(new Uint8Array([val]));
        } else if (val < 0 && val >= -32) {
          // negative fixint
          parts.push(new Uint8Array([val & 0xff]));
        } else if (val >= 0 && val <= 0xff) {
          // uint8
          parts.push(new Uint8Array([0xcc, val]));
        } else if (val >= 0 && val <= 0xffff) {
          // uint16
          parts.push(new Uint8Array([0xcd, (val >> 8) & 0xff, val & 0xff]));
        } else if (val >= 0 && val <= 0xffffffff) {
          // uint32
          parts.push(
            new Uint8Array([
              0xce,
              (val >> 24) & 0xff,
              (val >> 16) & 0xff,
              (val >> 8) & 0xff,
              val & 0xff,
            ])
          );
        } else if (val >= -128 && val <= 127) {
          // int8
          parts.push(new Uint8Array([0xd0, val & 0xff]));
        } else if (val >= -32768 && val <= 32767) {
          // int16
          parts.push(new Uint8Array([0xd1, (val >> 8) & 0xff, val & 0xff]));
        } else if (val >= -2147483648 && val <= 2147483647) {
          // int32
          parts.push(
            new Uint8Array([
              0xd2,
              (val >> 24) & 0xff,
              (val >> 16) & 0xff,
              (val >> 8) & 0xff,
              val & 0xff,
            ])
          );
        } else {
          // Fall back to float64 for large integers
          const buffer = new ArrayBuffer(9);
          const view = new DataView(buffer);
          view.setUint8(0, 0xcb);
          view.setFloat64(1, val, false);
          parts.push(new Uint8Array(buffer));
        }
      } else {
        // float64
        const buffer = new ArrayBuffer(9);
        const view = new DataView(buffer);
        view.setUint8(0, 0xcb);
        view.setFloat64(1, val, false);
        parts.push(new Uint8Array(buffer));
      }
      return;
    }

    if (typeof val === "string") {
      const encoded = new TextEncoder().encode(val);
      const len = encoded.length;

      if (len <= 31) {
        // fixstr
        parts.push(new Uint8Array([0xa0 | len]));
      } else if (len <= 0xff) {
        // str8
        parts.push(new Uint8Array([0xd9, len]));
      } else if (len <= 0xffff) {
        // str16
        parts.push(new Uint8Array([0xda, (len >> 8) & 0xff, len & 0xff]));
      } else {
        // str32
        parts.push(
          new Uint8Array([
            0xdb,
            (len >> 24) & 0xff,
            (len >> 16) & 0xff,
            (len >> 8) & 0xff,
            len & 0xff,
          ])
        );
      }
      parts.push(encoded);
      return;
    }

    if (Array.isArray(val)) {
      const len = val.length;

      if (len <= 15) {
        // fixarray
        parts.push(new Uint8Array([0x90 | len]));
      } else if (len <= 0xffff) {
        // array16
        parts.push(new Uint8Array([0xdc, (len >> 8) & 0xff, len & 0xff]));
      } else {
        // array32
        parts.push(
          new Uint8Array([
            0xdd,
            (len >> 24) & 0xff,
            (len >> 16) & 0xff,
            (len >> 8) & 0xff,
            len & 0xff,
          ])
        );
      }

      for (const item of val) {
        encode(item);
      }
      return;
    }

    if (typeof val === "object") {
      const keys = Object.keys(val as object);
      const len = keys.length;

      if (len <= 15) {
        // fixmap
        parts.push(new Uint8Array([0x80 | len]));
      } else if (len <= 0xffff) {
        // map16
        parts.push(new Uint8Array([0xde, (len >> 8) & 0xff, len & 0xff]));
      } else {
        // map32
        parts.push(
          new Uint8Array([
            0xdf,
            (len >> 24) & 0xff,
            (len >> 16) & 0xff,
            (len >> 8) & 0xff,
            len & 0xff,
          ])
        );
      }

      for (const key of keys) {
        encode(key);
        encode((val as Record<string, unknown>)[key]);
      }
      return;
    }

    // Unsupported type - encode as null
    parts.push(new Uint8Array([0xc0]));
  }

  encode(value);

  // Merge all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

/**
 * Lightweight MessagePack decoder
 */
function msgpackDecode(buffer: Uint8Array): unknown {
  let offset = 0;

  function decode(): unknown {
    if (offset >= buffer.length) {
      throw new Error("Unexpected end of buffer");
    }

    const byte = buffer[offset++]!;

    // Positive fixint (0x00 - 0x7f)
    if (byte <= 0x7f) {
      return byte;
    }

    // Negative fixint (0xe0 - 0xff)
    if (byte >= 0xe0) {
      return byte - 256;
    }

    // Fixmap (0x80 - 0x8f)
    if (byte >= 0x80 && byte <= 0x8f) {
      const len = byte - 0x80;
      const result: Record<string, unknown> = {};
      for (let i = 0; i < len; i++) {
        const key = decode() as string;
        result[key] = decode();
      }
      return result;
    }

    // Fixarray (0x90 - 0x9f)
    if (byte >= 0x90 && byte <= 0x9f) {
      const len = byte - 0x90;
      const result: unknown[] = [];
      for (let i = 0; i < len; i++) {
        result.push(decode());
      }
      return result;
    }

    // Fixstr (0xa0 - 0xbf)
    if (byte >= 0xa0 && byte <= 0xbf) {
      const len = byte - 0xa0;
      const str = new TextDecoder().decode(buffer.subarray(offset, offset + len));
      offset += len;
      return str;
    }

    switch (byte) {
      case 0xc0: // nil
        return null;
      case 0xc2: // false
        return false;
      case 0xc3: // true
        return true;

      case 0xcc: // uint8
        return buffer[offset++];
      case 0xcd: // uint16
        return (buffer[offset++]! << 8) | buffer[offset++]!;
      case 0xce: // uint32
        return (
          ((buffer[offset++]! << 24) >>> 0) +
          (buffer[offset++]! << 16) +
          (buffer[offset++]! << 8) +
          buffer[offset++]!
        );

      case 0xd0: // int8
        {
          const val = buffer[offset++]!;
          return val > 127 ? val - 256 : val;
        }
      case 0xd1: // int16
        {
          const val = (buffer[offset++]! << 8) | buffer[offset++]!;
          return val > 32767 ? val - 65536 : val;
        }
      case 0xd2: // int32
        {
          const val =
            (buffer[offset++]! << 24) |
            (buffer[offset++]! << 16) |
            (buffer[offset++]! << 8) |
            buffer[offset++]!;
          return val;
        }

      case 0xcb: // float64
        {
          const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
          offset += 8;
          return view.getFloat64(0, false);
        }

      case 0xd9: // str8
        {
          const len = buffer[offset++]!;
          const str = new TextDecoder().decode(buffer.subarray(offset, offset + len));
          offset += len;
          return str;
        }
      case 0xda: // str16
        {
          const len = (buffer[offset++]! << 8) | buffer[offset++]!;
          const str = new TextDecoder().decode(buffer.subarray(offset, offset + len));
          offset += len;
          return str;
        }
      case 0xdb: // str32
        {
          const len =
            (buffer[offset++]! << 24) |
            (buffer[offset++]! << 16) |
            (buffer[offset++]! << 8) |
            buffer[offset++]!;
          const str = new TextDecoder().decode(buffer.subarray(offset, offset + len));
          offset += len;
          return str;
        }

      case 0xdc: // array16
        {
          const len = (buffer[offset++]! << 8) | buffer[offset++]!;
          const result: unknown[] = [];
          for (let i = 0; i < len; i++) {
            result.push(decode());
          }
          return result;
        }
      case 0xdd: // array32
        {
          const len =
            (buffer[offset++]! << 24) |
            (buffer[offset++]! << 16) |
            (buffer[offset++]! << 8) |
            buffer[offset++]!;
          const result: unknown[] = [];
          for (let i = 0; i < len; i++) {
            result.push(decode());
          }
          return result;
        }

      case 0xde: // map16
        {
          const len = (buffer[offset++]! << 8) | buffer[offset++]!;
          const result: Record<string, unknown> = {};
          for (let i = 0; i < len; i++) {
            const key = decode() as string;
            result[key] = decode();
          }
          return result;
        }
      case 0xdf: // map32
        {
          const len =
            (buffer[offset++]! << 24) |
            (buffer[offset++]! << 16) |
            (buffer[offset++]! << 8) |
            buffer[offset++]!;
          const result: Record<string, unknown> = {};
          for (let i = 0; i < len; i++) {
            const key = decode() as string;
            result[key] = decode();
          }
          return result;
        }

      default:
        throw new Error(`Unknown MessagePack type: 0x${byte.toString(16)}`);
    }
  }

  return decode();
}

/**
 * MessagePack serializer
 */
export const msgpackSerializer: Serializer = {
  encode(data: unknown): ArrayBuffer {
    const encoded = msgpackEncode(data);
    // Create a new ArrayBuffer with the exact bytes from the Uint8Array
    const buffer = new ArrayBuffer(encoded.byteLength);
    new Uint8Array(buffer).set(encoded);
    return buffer;
  },

  decode(raw: string | ArrayBuffer): unknown {
    if (typeof raw === "string") {
      // If string is passed, assume it's base64 encoded
      const binary = atob(raw);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return msgpackDecode(bytes);
    }
    return msgpackDecode(new Uint8Array(raw));
  },

  contentType: "application/msgpack",
};

// ============================================================================
// SERIALIZER FACTORY
// ============================================================================

/**
 * Get serializer by format name
 */
export function getSerializer(format: "json" | "msgpack"): Serializer {
  switch (format) {
    case "json":
      return jsonSerializer;
    case "msgpack":
      return msgpackSerializer;
    default:
      return jsonSerializer;
  }
}

/**
 * Create a custom serializer
 */
export function createSerializer(options: {
  encode: (data: unknown) => string | ArrayBuffer;
  decode: (raw: string | ArrayBuffer) => unknown;
  contentType: string;
}): Serializer {
  return options;
}
