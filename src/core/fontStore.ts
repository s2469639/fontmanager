import * as fontkit from 'fontkit';
import type { Cmd, FontDef, GlyphShape } from './types';
import { UNIT } from './types';
import { getFont } from '../data/fonts';
import { woffToSfnt } from './woff';

type Font = fontkit.Font;

/** 브라우저에서는 fetch, 테스트에서는 파일 읽기로 교체할 수 있습니다. */
export type FontFetcher = (file: string) => Promise<Uint8Array>;

let fetcher: FontFetcher = async (file) => {
  const res = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`);
  if (!res.ok) throw new Error(`글꼴을 불러오지 못했습니다: ${file}`);
  return new Uint8Array(await res.arrayBuffer());
};

export function setFontFetcher(f: FontFetcher) {
  fetcher = f;
}

const loading = new Map<string, Promise<Font>>();
const loaded = new Map<string, Font>();

export function loadFont(id: string): Promise<Font> {
  let p = loading.get(id);
  if (!p) {
    const def = getFont(id);
    p = fetcher(def.file).then(async (data) => {
      const font = fontkit.create(await woffToSfnt(data));
      loaded.set(id, font);
      return font;
    });
    p.catch(() => loading.delete(id));
    loading.set(id, p);
  }
  return p;
}

export function isFontLoaded(id: string): boolean {
  return loaded.has(id);
}

export function axisValue(def: FontDef, weight01: number): number | null {
  if (def.weight.kind !== 'axis') return null;
  const { min, max } = def.weight;
  return Math.round(min + Math.min(1, Math.max(0, weight01)) * (max - min));
}

const instances = new Map<string, Font>();

function instanceFor(id: string, wght: number | null): Font | null {
  const base = loaded.get(id);
  if (!base) return null;
  if (wght === null) return base;
  const key = `${id}:${wght}`;
  let inst = instances.get(key);
  if (!inst) {
    inst = base.getVariation({ wght });
    instances.set(key, inst);
  }
  return inst;
}

const glyphCache = new Map<string, GlyphShape | null>();

/** 글꼴이 해당 글자를 직접 가지고 있는지 */
export function fontHasChar(id: string, ch: string): boolean {
  const f = loaded.get(id);
  return !!f && f.hasGlyphForCodePoint(ch.codePointAt(0)!);
}

/**
 * 한 글자의 윤곽선을 em=1000 단위로 가져옵니다. 글꼴이 아직 로드되지 않았거나
 * 글자가 없으면 null.
 */
export function getGlyph(id: string, wght: number | null, ch: string): GlyphShape | null {
  const key = `${id}:${wght ?? '-'}:${ch}`;
  if (glyphCache.has(key)) return glyphCache.get(key)!;
  const font = instanceFor(id, wght);
  if (!font) return null;
  const cp = ch.codePointAt(0)!;
  if (!font.hasGlyphForCodePoint(cp)) {
    glyphCache.set(key, null);
    return null;
  }
  const glyph = font.glyphForCodePoint(cp);
  const k = UNIT / font.unitsPerEm;
  const cmds: Cmd[] = [];
  for (const { command, args } of glyph.path.commands) {
    switch (command) {
      case 'moveTo':
        cmds.push(['M', args[0] * k, args[1] * k]);
        break;
      case 'lineTo':
        cmds.push(['L', args[0] * k, args[1] * k]);
        break;
      case 'quadraticCurveTo':
        cmds.push(['Q', args[0] * k, args[1] * k, args[2] * k, args[3] * k]);
        break;
      case 'bezierCurveTo':
        cmds.push(['C', args[0] * k, args[1] * k, args[2] * k, args[3] * k, args[4] * k, args[5] * k]);
        break;
      case 'closePath':
        cmds.push(['Z']);
        break;
    }
  }
  const shape: GlyphShape = { char: ch, cmds, advance: glyph.advanceWidth * k, fromFallback: false };
  glyphCache.set(key, shape);
  return shape;
}

/** 세로 획(ㅣ)의 두께. 굵기 축 값에 따른 실제 획 두께를 재는 데 씁니다. */
function stemWidth(id: string, wght: number): number | null {
  const g = getGlyph(id, wght, 'ㅣ');
  if (!g) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const c of g.cmds) {
    for (let i = 1; i < c.length; i += 2) {
      const x = c[i] as number;
      if (x < min) min = x;
      if (x > max) max = x;
    }
  }
  return max > min ? max - min : null;
}

const stemTables = new Map<string, { wght: number; stem: number }[] | null>();

function stemTable(def: FontDef): { wght: number; stem: number }[] | null {
  if (def.weight.kind !== 'axis') return null;
  if (stemTables.has(def.id)) return stemTables.get(def.id)!;
  const { min, max } = def.weight;
  const rows: { wght: number; stem: number }[] = [];
  for (let i = 0; i <= 8; i++) {
    const w = Math.round(min + ((max - min) * i) / 8);
    const stem = stemWidth(def.id, w);
    if (stem === null) {
      stemTables.set(def.id, null);
      return null;
    }
    rows.push({ wght: w, stem });
  }
  stemTables.set(def.id, rows);
  return rows;
}

/**
 * 모서리를 선으로 둥글리면 획이 `extra`(em/1000)만큼 굵어집니다.
 * 가변 글꼴은 굵기 축 값을 그만큼 낮춰 시각적 굵기가 유지되게 합니다.
 */
export function compensateWght(def: FontDef, wght: number, extra: number): number {
  const table = stemTable(def);
  if (!table || extra <= 0) return wght;
  const stemAt = (w: number) => {
    for (let i = 1; i < table.length; i++) {
      if (w <= table[i].wght) {
        const a = table[i - 1];
        const b = table[i];
        return a.stem + ((b.stem - a.stem) * (w - a.wght)) / (b.wght - a.wght);
      }
    }
    return table[table.length - 1].stem;
  };
  const target = stemAt(wght) - extra;
  if (target <= table[0].stem) return table[0].wght;
  for (let i = 1; i < table.length; i++) {
    if (target <= table[i].stem) {
      const a = table[i - 1];
      const b = table[i];
      const t = (target - a.stem) / Math.max(1e-6, b.stem - a.stem);
      return Math.round(a.wght + t * (b.wght - a.wght));
    }
  }
  return wght;
}
