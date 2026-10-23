interface Entry<T> { value: T; pixels: number }

/** A small insertion-ordered LRU with a hard total pixel budget and no DOM dependency. */
export class PixelLru<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private pixels = 0;

  public constructor(private readonly budget: number) {}

  public get size(): number { return this.entries.size; }
  public get pixelCount(): number { return this.pixels; }

  public get(key: string): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  public put(key: string, value: T, pixels: number): void {
    const previous = this.entries.get(key);
    if (previous) this.pixels -= previous.pixels;
    this.entries.delete(key);
    if (!Number.isFinite(pixels) || pixels <= 0 || pixels > this.budget) return;
    this.entries.set(key, { value, pixels });
    this.pixels += pixels;
    while (this.pixels > this.budget) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      const entry = this.entries.get(oldest.value);
      if (entry) this.pixels -= entry.pixels;
      this.entries.delete(oldest.value);
    }
  }
}
