declare module 'fontkit' {
  export interface Glyph {
    id: number;
    advanceWidth: number;
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
    path: { commands: { command: string; args: number[] }[] };
  }
  export interface Font {
    unitsPerEm: number;
    variationAxes?: Record<string, { min: number; default: number; max: number }>;
    hasGlyphForCodePoint(cp: number): boolean;
    glyphForCodePoint(cp: number): Glyph;
    getVariation(settings: Record<string, number>): Font;
  }
  export function create(data: Uint8Array): Font;
}
