/**
 * Render THẬT từng bài trong `guides-content/` qua `GuideMarkdown` (cùng trình hiển thị trang /huong-dan):
 * bắt lỗi mà test contract (chỉ đọc chuỗi) không thấy - mẫu minh hoạ render ra khung cảnh báo, liên kết nội bộ trỏ sang bài không có.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GuideMarkdown } from './GuideMarkdown';
import { GUIDES_BASE_PATH, REQUIRED_GUIDE_SLUGS } from './guide-slugs';
import { readGuideContentFiles } from './testing/repo-files';

const files = readGuideContentFiles();

/** Bỏ frontmatter `---...---` ở đầu file (giống phần BE lưu vào `guides.content`). */
function bodyOf(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
}

/**
 * Chữ của 2 khung cảnh báo THẬT do `GuideDemoBlock` sinh ra khi id/tham số sai. Lọc theo chữ (không theo class
 * `.ant-alert-warning`) vì mẫu `permission-note` hợp lệ cũng là Alert màu vàng -> sẽ bị bắt nhầm.
 */
const DEMO_ERROR_TEXTS = ['Không có mẫu minh hoạ', 'Tham số không hợp lệ'];

describe('guides-content: render thật từng bài', () => {
  it('có ít nhất 1 bài', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.name, f.raw] as const))('%s: không có khung cảnh báo mẫu minh hoạ', (_name, raw) => {
    const { container } = render(<GuideMarkdown content={bodyOf(raw)} />);
    const warnings = Array.from(container.querySelectorAll('.ant-alert-warning'))
      .map((el) => el.textContent ?? '')
      .filter((t) => DEMO_ERROR_TEXTS.some((x) => t.includes(x)));
    expect(warnings).toEqual([]);
  });

  it.each(files.map((f) => [f.name, f.raw] as const))('%s: liên kết nội bộ /huong-dan/<slug> trỏ tới slug có trong hệ thống', (_name, raw) => {
    const { container } = render(<GuideMarkdown content={bodyOf(raw)} />);
    const bad: string[] = [];
    for (const a of Array.from(container.querySelectorAll('a'))) {
      const href = a.getAttribute('href') ?? '';
      if (!href.startsWith(`${GUIDES_BASE_PATH}/`)) continue;
      const slug = href.slice(GUIDES_BASE_PATH.length + 1);
      if (!REQUIRED_GUIDE_SLUGS.includes(slug)) bad.push(href);
    }
    expect(bad).toEqual([]);
  });
});
