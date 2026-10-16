export const MAX_CHARS = 12;

export interface TextAnalysis {
  /** 정규화된 최종 텍스트 */
  clean: string;
  /** 지원하지 않아 제거된 글자 */
  removed: string[];
  tooLong: boolean;
}

const HANGUL_SYLLABLE = /[가-힣]/;
const COMPAT_JAMO = /[ㄱ-ㆎ]/;
const ALLOWED_OTHER = /[A-Za-z0-9 .,!?&·\-+'’]/;

export function isAllowedChar(ch: string): boolean {
  return HANGUL_SYLLABLE.test(ch) || COMPAT_JAMO.test(ch) || ALLOWED_OTHER.test(ch);
}

/**
 * 입력값을 편집 가능한 텍스트로 정리합니다.
 * - NFC 정규화(macOS의 분해형 한글 입력 대응)
 * - 허용되지 않는 글자 제거, 공백 정리, 길이 제한
 */
export function analyzeText(input: string): TextAnalysis {
  const nfc = input.normalize('NFC').replace(/\s+/g, ' ');
  const removed: string[] = [];
  let kept = '';
  for (const ch of nfc) {
    if (isAllowedChar(ch)) kept += ch;
    else if (!removed.includes(ch)) removed.push(ch);
  }
  kept = kept.replace(/^ +/, '').replace(/ {2,}/g, ' ');
  const chars = Array.from(kept);
  const tooLong = chars.length > MAX_CHARS;
  const clean = chars.slice(0, MAX_CHARS).join('').replace(/ +$/, '');
  return { clean, removed, tooLong };
}
