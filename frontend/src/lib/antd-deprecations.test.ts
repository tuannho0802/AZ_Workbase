import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Quét src/ tìm prop `direction` trên <Space> (đã deprecated ở antd 6 -> dùng `orientation`). */
function collect(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collect(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('antd deprecations', () => {
  it('không còn <Space direction=...> (dùng orientation)', () => {
    const bad = collect(join(process.cwd(), 'src')).filter((f) => /<Space(\.Compact)?\b[^>]*\bdirection=/.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});
