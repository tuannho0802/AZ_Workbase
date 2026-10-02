/**
 * LƯỚI AN TOÀN (PLAN_GUIDES_CONTENT §2.4): mỗi mục menu phải có bài hướng dẫn `guides-content/<slug>.md`.
 * Thêm trang mới mà quên viết guide -> test đỏ (cùng tinh thần `audit-meta.test.ts`).
 *
 * Trong lúc P1-P4 đang viết dần, các slug chưa viết nằm ở `PENDING_GUIDE_SLUGS` (cơ chế bánh cóc: viết xong phải xoá khỏi danh sách).
 */
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '../nav-config';
import {
  GETTING_STARTED_GUIDE_SLUG,
  GUIDE_SLUG_BY_NAV_KEY,
  PENDING_GUIDE_SLUGS,
  REQUIRED_GUIDE_SLUGS,
} from './guide-slugs';
import { readGuideContentFiles } from './testing/repo-files';

const files = readGuideContentFiles();
const fileSlugs = new Set(files.map((f) => f.slug));

describe('nav-guide-coverage: bản đồ trang -> slug', () => {
  it('mọi mục NAV_ITEMS có slug ánh xạ (thêm trang mới -> thêm vào GUIDE_SLUG_BY_NAV_KEY)', () => {
    const missing = NAV_ITEMS.map((i) => i.key).filter((k) => !GUIDE_SLUG_BY_NAV_KEY[k]);
    expect(missing).toEqual([]);
  });

  it('không có slug ánh xạ cho key không còn trong NAV_ITEMS (dọn khi xoá trang)', () => {
    const navKeys = new Set(NAV_ITEMS.map((i) => i.key));
    expect(Object.keys(GUIDE_SLUG_BY_NAV_KEY).filter((k) => !navKeys.has(k))).toEqual([]);
  });

  it('slug hợp lệ (cùng quy tắc BE) và không trùng nhau', () => {
    const slugs = Object.values(GUIDE_SLUG_BY_NAV_KEY);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of [...slugs, GETTING_STARTED_GUIDE_SLUG]) expect(s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('tập slug bắt buộc = 30 trang + bài tổng', () => {
    expect(REQUIRED_GUIDE_SLUGS).toHaveLength(NAV_ITEMS.length + 1);
  });
});

describe('nav-guide-coverage: file guides-content/<slug>.md', () => {
  it('slug bắt buộc nào chưa có file thì PHẢI nằm trong PENDING_GUIDE_SLUGS', () => {
    const uncovered = REQUIRED_GUIDE_SLUGS.filter((s) => !fileSlugs.has(s) && !PENDING_GUIDE_SLUGS.includes(s));
    expect(uncovered).toEqual([]);
  });

  it('BÁNH CÓC: slug đã có file thì PHẢI xoá khỏi PENDING_GUIDE_SLUGS (danh sách chỉ được co lại)', () => {
    expect(PENDING_GUIDE_SLUGS.filter((s) => fileSlugs.has(s))).toEqual([]);
  });

  it('PENDING_GUIDE_SLUGS chỉ chứa slug bắt buộc (không có mục thừa/đánh máy sai)', () => {
    expect(PENDING_GUIDE_SLUGS.filter((s) => !REQUIRED_GUIDE_SLUGS.includes(s))).toEqual([]);
  });

  it('file trong guides-content/ có slug trong frontmatter trùng tên file', () => {
    for (const f of files) {
      expect(new RegExp(`^slug:\\s*["']?${f.slug}["']?\\s*(#.*)?$`, 'm').test(f.raw.replace(/\r/g, ''))).toBe(true);
    }
  });
});
