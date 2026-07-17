declare module 'gifenc' {
  export interface Gif {
    writeFrame(index: Uint8Array | number[], width: number, height: number, opts?: { palette?: number[][]; delay?: number; transparent?: boolean; dispose?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }
  interface GifencApi {
    GIFEncoder(opts?: { repeat?: number; auto?: boolean }): Gif;
    /** Returns the palette as number[][] (each entry [r,g,b] or [r,g,b,a]). */
    quantize(rgba: Uint8Array, maxColors: number, opts?: { format?: string; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaThreshold?: number; clearAlphaColor?: number[] }): number[][];
    /** Maps rgba pixels to palette indices. */
    applyPalette(rgba: Uint8Array, palette: number[][], format?: string): Uint8Array;
    nearestColor(rgb: number[], palette: number[][]): number[];
    nearestColorIndex(palette: number[][], rgb: number[]): number;
    nearestColorIndexWithDistance(palette: number[][], rgb: number[]): number;
    prequantize(rgba: Uint8Array, maxColors: number, format?: string): { palette: number[][]; indices: Uint8Array };
    snapColorsToPalette(rgba: Uint8Array, palette: number[][], format?: string): void;
  }
  const gifenc: GifencApi;
  export default gifenc;
}
