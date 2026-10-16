/**
 * 작업 파일(.json) 저장·불러오기
 *
 * 파일은 사용자가 고친 것일 수도, 다른 버전에서 만든 것일 수도 있으므로
 * 불러올 때 모든 값을 검사하고 허용 범위로 맞춥니다. 알 수 없는 항목은 버립니다.
 */
import { DEFAULT_FX, DEFAULT_JAMO, DEFAULT_PARAMS, LIMITS } from './defaults';
import { analyzeText } from './text';
import { FONTS } from '../data/fonts';
import { ArtError, MAX_ART_LAYERS, readArtFile } from './art';
import type { ArtLayer } from './art';
import type { Cap, Corner, Engine, FxParams, GlyphOverride, JamoParams, LinkMode, OShape, Params, PartAdjust } from './types';

export const APP_ID = 'hangul-form-lab';
export const PROJECT_VERSION = 1;
export const MAX_PROJECT_BYTES = 60 * 1024 * 1024;

type Lim = { min: number; max: number };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, def: number, lim?: Lim): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  return lim ? Math.min(lim.max, Math.max(lim.min, v)) : v;
}
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
function oneOf<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : def;
}
const int = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined;

function sanitizeJamo(raw: unknown): JamoParams {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_JAMO;
  return {
    strokeW: num(r.strokeW, d.strokeW, LIMITS.strokeW),
    cap: oneOf<Cap>(r.cap, ['round', 'butt', 'square'], d.cap),
    roundness: num(r.roundness, d.roundness, LIMITS.roundness),
    consonantScale: num(r.consonantScale, d.consonantScale, LIMITS.consonantScale),
    vowelScale: num(r.vowelScale, d.vowelScale, LIMITS.vowelScale),
    gap: num(r.gap, d.gap, LIMITS.gap),
    oShape: oneOf<OShape>(r.oShape, ['circle', 'square', 'diamond'], d.oShape),
    circleGap: num(r.circleGap, d.circleGap, LIMITS.circleGap),
    bounce: num(r.bounce, d.bounce, LIMITS.bounce),
    link: num(r.link, d.link, LIMITS.link),
    linkMode: oneOf<LinkMode>(r.linkMode, ['snap', 'bridge', 'curve'], d.linkMode),
  };
}

function sanitizeFx(raw: unknown): FxParams {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_FX;
  return {
    roughOn: bool(r.roughOn, d.roughOn),
    roughAmp: num(r.roughAmp, d.roughAmp, LIMITS.roughAmp),
    roughScale: num(r.roughScale, d.roughScale, LIMITS.roughScale),
    roughSeed: Math.round(num(r.roughSeed, d.roughSeed, LIMITS.roughSeed)),
    waveOn: bool(r.waveOn, d.waveOn),
    waveAmp: num(r.waveAmp, d.waveAmp, LIMITS.waveAmp),
    waveLen: num(r.waveLen, d.waveLen, LIMITS.waveLen),
    wavePhase: num(r.wavePhase, d.wavePhase, LIMITS.wavePhase),
    waveAxis: oneOf(r.waveAxis, ['y', 'x', 'both'] as const, d.waveAxis),
    bulgeOn: bool(r.bulgeOn, d.bulgeOn),
    bulgeAmount: num(r.bulgeAmount, d.bulgeAmount, LIMITS.bulgeAmount),
    bulgeScope: oneOf(r.bulgeScope, ['glyph', 'word'] as const, d.bulgeScope),
    stripeOn: bool(r.stripeOn, d.stripeOn),
    stripeAngle: num(r.stripeAngle, d.stripeAngle, LIMITS.stripeAngle),
    stripeCount: Math.round(num(r.stripeCount, d.stripeCount, LIMITS.stripeCount)),
    stripeGap: num(r.stripeGap, d.stripeGap, LIMITS.stripeGap),
    stripePhase: num(r.stripePhase, d.stripePhase, LIMITS.stripePhase),
  };
}

function sanitizeAdjust(raw: unknown): Partial<PartAdjust> | undefined {
  if (!isObj(raw)) return undefined;
  const out: Partial<PartAdjust> = {};
  if (typeof raw.scale === 'number') out.scale = num(raw.scale, 1, { min: 0.1, max: 4 });
  if (typeof raw.dx === 'number') out.dx = num(raw.dx, 0, { min: -150, max: 150 });
  if (typeof raw.dy === 'number') out.dy = num(raw.dy, 0, { min: -150, max: 150 });
  if (typeof raw.rot === 'number') out.rot = num(raw.rot, 0, { min: -360, max: 360 });
  return Object.keys(out).length ? out : undefined;
}

function sanitizeGlyphs(raw: unknown): Record<number, GlyphOverride> {
  const out: Record<number, GlyphOverride> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0 || idx >= 100 || !isObj(v)) continue;
    const g: GlyphOverride = {};
    for (const part of ['L', 'V', 'T'] as const) {
      const a = sanitizeAdjust(v[part]);
      if (a) g[part] = a;
    }
    if (typeof v.oShape === 'string') g.oShape = oneOf<OShape>(v.oShape, ['circle', 'square', 'diamond'], 'circle');
    if (typeof v.circleGap === 'number') g.circleGap = num(v.circleGap, 0, LIMITS.circleGap);
    if (typeof v.stroke === 'number') g.stroke = num(v.stroke, 1, { min: 0.1, max: 8 });
    if (typeof v.link === 'number') g.link = num(v.link, 0, LIMITS.link);
    for (const key of ['Lv', 'Vv', 'Tv'] as const) {
      const n = int(v[key], 0, 9);
      if (n !== undefined) g[key] = n;
    }
    if (Object.keys(g).length) out[idx] = g;
  }
  return out;
}

function sanitizeVariants(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = int(v, 0, 9);
    if (/^[ㄱ-ㆎ]$/.test(k) && n !== undefined && n > 0) out[k] = n;
  }
  return out;
}

const COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** 어떤 값이 들어와도 항상 유효한 Params를 돌려줍니다. */
export function sanitizeParams(raw: unknown): Params {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_PARAMS;
  return {
    engine: oneOf<Engine>(r.engine, ['font', 'jamo'], d.engine),
    jamo: sanitizeJamo(r.jamo),
    glyphs: sanitizeGlyphs(r.glyphs),
    fx: sanitizeFx(r.fx),
    variants: sanitizeVariants(r.variants),
    fontId: FONTS.some((f) => f.id === r.fontId) ? (r.fontId as string) : d.fontId,
    weight: num(r.weight, d.weight, LIMITS.weight),
    width: num(r.width, d.width, LIMITS.width),
    tracking: num(r.tracking, d.tracking, LIMITS.tracking),
    corner: oneOf<Corner>(r.corner, ['sharp', 'round', 'bevel'], d.corner),
    cornerAmount: num(r.cornerAmount, d.cornerAmount, LIMITS.cornerAmount),
    skewOn: bool(r.skewOn, d.skewOn),
    skew: num(r.skew, d.skew, LIMITS.skew),
    vScaleOn: bool(r.vScaleOn, d.vScaleOn),
    vScale: num(r.vScale, d.vScale, LIMITS.vScale),
    outlineOn: bool(r.outlineOn, d.outlineOn),
    outlineWidth: num(r.outlineWidth, d.outlineWidth, LIMITS.outlineWidth),
    overlapOn: bool(r.overlapOn, d.overlapOn),
    overlapAmount: num(r.overlapAmount, d.overlapAmount, LIMITS.overlapAmount),
    overlapOpacity: num(r.overlapOpacity, d.overlapOpacity, LIMITS.overlapOpacity),
    color: r.color === 'auto' || (typeof r.color === 'string' && COLOR.test(r.color)) ? (r.color as string) : d.color,
  };
}

// ───────────────────────── 작업 파일 ─────────────────────────

export interface ProjectArt {
  name: string;
  ox: number;
  oy: number;
  width: number;
  rot: number;
  opacity: number;
  flipX: boolean;
  front: boolean;
  /** data: URL (PNG/WebP/JPEG/SVG) */
  data: string;
}

export interface ProjectFile {
  app: typeof APP_ID;
  version: number;
  savedAt: string;
  text: string;
  params: Params;
  baseline: Params | null;
  baselineLabel: string;
  bg: 'light' | 'dark';
  art: ProjectArt[];
}

export interface ProjectState {
  text: string;
  params: Params;
  baseline: Params | null;
  baselineLabel: string;
  bg: 'light' | 'dark';
  art: ArtLayer[];
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('그림을 파일에 담지 못했습니다.'));
    r.readAsDataURL(blob);
  });
}

/** 현재 작업을 파일 내용으로 만듭니다. includeArt가 false면 그림은 빼고 저장합니다. */
export async function serializeProject(state: ProjectState, includeArt: boolean): Promise<string> {
  const art: ProjectArt[] = [];
  if (includeArt) {
    for (const l of state.art) {
      const blob = await (await fetch(l.src)).blob();
      art.push({
        name: l.name,
        ox: l.ox,
        oy: l.oy,
        width: l.width,
        rot: l.rot,
        opacity: l.opacity,
        flipX: l.flipX,
        front: l.front,
        data: await blobToDataUrl(blob),
      });
    }
  }
  const file: ProjectFile = {
    app: APP_ID,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    text: state.text,
    params: state.params,
    baseline: state.baseline,
    baselineLabel: state.baselineLabel,
    bg: state.bg,
    art,
  };
  return JSON.stringify(file);
}

export class ProjectError extends Error {}

export interface ParsedProject {
  text: string;
  params: Params;
  baseline: Params | null;
  baselineLabel: string;
  bg: 'light' | 'dark';
  art: ProjectArt[];
}

const DATA_URL = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

/** 파일 내용을 검사해 안전한 값으로 바꿉니다. 형식이 맞지 않으면 ProjectError. */
export function parseProject(content: string): ParsedProject {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new ProjectError('작업 파일이 아니에요. (JSON을 읽을 수 없어요)');
  }
  if (!isObj(raw) || raw.app !== APP_ID) throw new ProjectError('HANGUL FORM LAB에서 저장한 작업 파일이 아니에요.');
  if (typeof raw.version !== 'number' || raw.version > PROJECT_VERSION) {
    throw new ProjectError('더 새로운 버전에서 저장한 파일이라 열 수 없어요.');
  }
  const text = analyzeText(typeof raw.text === 'string' ? raw.text : '').clean;
  if (!text) throw new ProjectError('파일에 이름(글자)이 없어요.');
  const params = sanitizeParams(raw.params);
  const baseline = raw.baseline ? sanitizeParams(raw.baseline) : null;
  const art: ProjectArt[] = [];
  if (Array.isArray(raw.art)) {
    for (const a of raw.art.slice(0, MAX_ART_LAYERS)) {
      if (!isObj(a) || typeof a.data !== 'string' || !DATA_URL.test(a.data)) continue;
      art.push({
        name: typeof a.name === 'string' ? a.name.replace(/[\u0000-\u001f]/g, '').slice(0, 80) || '그림' : '그림',
        ox: num(a.ox, 0, { min: -50000, max: 50000 }),
        oy: num(a.oy, 0, { min: -50000, max: 50000 }),
        width: num(a.width, 1000, { min: 20, max: 60000 }),
        rot: num(a.rot, 0, { min: -360, max: 360 }),
        opacity: num(a.opacity, 1, { min: 0.05, max: 1 }),
        flipX: bool(a.flipX, false),
        front: bool(a.front, false),
        data: a.data,
      });
    }
  }
  return {
    text,
    params,
    baseline,
    baselineLabel: typeof raw.baselineLabel === 'string' ? raw.baselineLabel.slice(0, 60) : '',
    bg: raw.bg === 'dark' ? 'dark' : 'light',
    art,
  };
}

/** 파일에 담긴 그림을 다시 화면용 레이어로 만듭니다. 읽지 못한 그림은 건너뛰고 개수를 알려 줍니다. */
export async function restoreArt(items: ProjectArt[]): Promise<{ layers: ArtLayer[]; skipped: number }> {
  const layers: ArtLayer[] = [];
  let skipped = 0;
  for (const it of items) {
    try {
      const blob = await (await fetch(it.data)).blob();
      const info = await readArtFile(new File([blob], it.name, { type: blob.type }));
      layers.push({
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        name: info.name,
        src: info.src,
        natW: info.natW,
        natH: info.natH,
        ox: it.ox,
        oy: it.oy,
        width: it.width,
        rot: it.rot,
        opacity: it.opacity,
        flipX: it.flipX,
        front: it.front,
      });
    } catch (e) {
      if (!(e instanceof ArtError)) console.warn(e);
      skipped++;
    }
  }
  return { layers, skipped };
}
