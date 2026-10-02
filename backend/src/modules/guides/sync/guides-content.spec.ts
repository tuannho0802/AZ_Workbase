import * as fs from 'fs';
import * as path from 'path';
import { extractDemoIds, parseGuideFile } from './guide-file.parser';

/** Gốc repo (backend/src/modules/guides/sync -> lên 5 cấp). */
const CONTENT_DIR = path.resolve(__dirname, '../../../../../guides-content');

describe('guides-content/ (nguồn của guides:sync)', () => {
  it('thư mục tồn tại', () => {
    expect(fs.existsSync(CONTENT_DIR)).toBe(true);
  });

  it('_template.md là bản mẫu hợp lệ (đổi tên thành ten-bai.md thì parse được, mặc định là nháp)', () => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, '_template.md'), 'utf8');
    const spec = parseGuideFile('ten-bai.md', raw);
    expect(spec).toMatchObject({ slug: 'ten-bai', published: false, roles: [], permissions: [] });
    expect(extractDemoIds(spec.content)).toEqual(['customer-table-by-viewer']);
  });

  const files = fs.existsSync(CONTENT_DIR)
    ? fs.readdirSync(CONTENT_DIR).filter((n) => n.endsWith('.md') && !n.startsWith('_') && n.toLowerCase() !== 'readme.md')
    : [];
  it('mọi bài thật: frontmatter + nội dung hợp lệ (cùng bộ kiểm tra với guides:sync)', () => {
    const errors: string[] = [];
    for (const name of files) {
      try {
        parseGuideFile(name, fs.readFileSync(path.join(CONTENT_DIR, name), 'utf8'));
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    expect(errors).toEqual([]);
  });

  it('slug không trùng nhau (mỗi file 1 slug nên chỉ có thể trùng nếu tên file trùng không phân biệt hoa/thường)', () => {
    const slugs = files.map((n) => n.toLowerCase());
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
