/**
 * WOFF(1.0) → sfnt(TTF) 변환.
 * fontkit의 가변 글꼴 인스턴스(getVariation)는 WOFF 컨테이너를 다시 해석하지 못하므로,
 * 로드 시점에 한 번 풀어서 sfnt로 넘깁니다. 파일은 전송 용량을 줄이려고 WOFF로 보관합니다.
 */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function woffToSfnt(woff: Uint8Array): Promise<Uint8Array> {
  const v = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (v.getUint32(0) !== 0x774f4646) return woff; // 'wOFF'가 아니면 이미 sfnt
  const flavor = v.getUint32(4);
  const numTables = v.getUint16(12);

  const entries = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    entries.push({
      tag: v.getUint32(o),
      offset: v.getUint32(o + 4),
      compLength: v.getUint32(o + 8),
      origLength: v.getUint32(o + 12),
      checksum: v.getUint32(o + 16),
    });
  }

  const tables = await Promise.all(
    entries.map(async (e) => {
      const raw = woff.subarray(e.offset, e.offset + e.compLength);
      return e.compLength < e.origLength ? inflate(raw) : raw;
    }),
  );

  const headerSize = 12 + numTables * 16;
  let total = headerSize;
  for (const t of tables) total += (t.length + 3) & ~3;
  const out = new Uint8Array(total);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, flavor);
  ov.setUint16(4, numTables);
  let pow = 1;
  let log = 0;
  while (pow * 2 <= numTables) {
    pow *= 2;
    log++;
  }
  ov.setUint16(6, pow * 16);
  ov.setUint16(8, log);
  ov.setUint16(10, numTables * 16 - pow * 16);

  let cursor = headerSize;
  entries.forEach((e, i) => {
    const o = 12 + i * 16;
    ov.setUint32(o, e.tag);
    ov.setUint32(o + 4, e.checksum);
    ov.setUint32(o + 8, cursor);
    ov.setUint32(o + 12, tables[i].length);
    out.set(tables[i], cursor);
    cursor += (tables[i].length + 3) & ~3;
  });
  return out;
}
