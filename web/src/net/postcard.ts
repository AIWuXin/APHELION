/**
 * Postcard reader/writer for the small subset the protocol uses.
 *
 * The wire format is documented by `crates/protocol` and pinned by the golden
 * fixture test in `web/tests/postcard.test.ts`, so this file never has to be
 * trusted on faith.
 *
 * Encoding rules used by the protocol:
 *  - `u8` / `i8`  : one byte (i8 two's complement)
 *  - `u16` / `u32`: LEB128 varint
 *  - `i16` / `i32`: zigzag then LEB128 varint
 *  - `bool`       : one byte, 0 or 1
 *  - `str`        : varint byte length then UTF-8
 *  - `Vec<T>`     : varint element count then elements
 *  - `Option<T>`  : one tag byte then the payload
 *  - struct       : fields in declaration order, no tags
 *  - enum         : varint variant index then the variant payload
 */

/** Bounds-checked reader over a byte view. */
export class Reader {
  private readonly view: DataView;
  private readonly bytes: Uint8Array;
  private pos = 0;

  public constructor(buffer: ArrayBufferView) {
    this.bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
  }

  /** Bytes consumed so far. */
  public get offset(): number {
    return this.pos;
  }

  /** Bytes remaining. */
  public get remaining(): number {
    return this.bytes.byteLength - this.pos;
  }

  private need(n: number): void {
    if (this.pos + n > this.bytes.byteLength) {
      throw new RangeError(`postcard: read past end at ${this.pos} (+${n})`);
    }
  }

  /** Unsigned LEB128. */
  public u32(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      this.need(1);
      const byte = this.bytes[this.pos] ?? 0;
      this.pos += 1;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new RangeError('postcard: varint too long');
    }
    return result;
  }

  /** Single byte, unsigned. */
  public u8(): number {
    this.need(1);
    const v = this.bytes[this.pos] ?? 0;
    this.pos += 1;
    return v;
  }

  /** Single byte, signed. */
  public i8(): number {
    const v = this.u8();
    return v > 127 ? v - 256 : v;
  }

  /** Zigzag-encoded signed varint. */
  public i32(): number {
    const v = this.u32();
    return (v >>> 1) ^ -(v & 1);
  }

  /** Boolean byte. */
  public bool(): boolean {
    return this.u8() !== 0;
  }

  /** UTF-8 string. */
  public str(): string {
    const len = this.u32();
    this.need(len);
    const slice = this.bytes.subarray(this.pos, this.pos + len);
    this.pos += len;
    return new TextDecoder().decode(slice);
  }

  /** Element count of the next vector. */
  public len(): number {
    return this.u32();
  }

  /** Read `count` items with a per-item decoder. */
  public vec<T>(count: number, item: () => T): T[] {
    const out: T[] = new Array<T>(count);
    for (let i = 0; i < count; i += 1) out[i] = item();
    return out;
  }

  /** Read an f32 (unused by the protocol, present for completeness). */
  public f32(): number {
    this.need(4);
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }
}

/** Growing writer for command batches. */
export class Writer {
  private buf = new Uint8Array(256);
  private len = 0;

  private ensure(extra: number): void {
    if (this.len + extra <= this.buf.byteLength) return;
    let cap = this.buf.byteLength * 2;
    while (cap < this.len + extra) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  /** Unsigned LEB128. */
  public u32(value: number): this {
    let v = value >>> 0;
    this.ensure(5);
    for (;;) {
      const byte = v & 0x7f;
      v >>>= 7;
      if (v === 0) {
        this.buf[this.len] = byte;
        this.len += 1;
        return this;
      }
      this.buf[this.len] = byte | 0x80;
      this.len += 1;
    }
  }

  /** Single unsigned byte. */
  public u8(value: number): this {
    this.ensure(1);
    this.buf[this.len] = value & 0xff;
    this.len += 1;
    return this;
  }

  /** Zigzag signed varint. */
  public i32(value: number): this {
    const zz = (value << 1) ^ (value >> 31);
    return this.u32(zz >>> 0);
  }

  /** Boolean byte. */
  public bool(value: boolean): this {
    return this.u8(value ? 1 : 0);
  }

  /** UTF-8 string. */
  public str(value: string): this {
    const bytes = new TextEncoder().encode(value);
    this.u32(bytes.byteLength);
    this.ensure(bytes.byteLength);
    this.buf.set(bytes, this.len);
    this.len += bytes.byteLength;
    return this;
  }

  /** A view of the written bytes. */
  public finish(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }
}
