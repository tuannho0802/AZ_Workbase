import { extractDemoIds, GuideFileError, normalizeContent, parseGuideFile } from './guide-file.parser';

const doc = (front: string, body = 'Nội dung\n') => `---\n${front}\n---\n${body}`;

describe('parseGuideFile', () => {
  it('đọc đủ các trường, có chú thích # và danh sách [] / [a, b]', () => {
    const spec = parseGuideFile(
      'khach-hang.md',
      doc(
        [
          'title: Khách hàng',
          'slug: khach-hang',
          'sortOrder: 10',
          'published: true',
          'roles: []          # rỗng = mọi role',
          'positions: [content, editor]',
          'departments: ["Kinh doanh 1", \'Marketing\']',
          'permissions: [customers.view]',
        ].join('\n'),
        '\n\n# Tiêu đề\r\nDòng 2\r\n\r\n',
      ),
    );
    expect(spec).toEqual({
      title: 'Khách hàng',
      slug: 'khach-hang',
      sortOrder: 10,
      published: true,
      roles: [],
      positions: ['content', 'editor'],
      departments: ['Kinh doanh 1', 'Marketing'],
      excludeRoles: [],
      excludePositions: [],
      excludeDepartments: [],
      permissions: ['customers.view'],
      content: '# Tiêu đề\nDòng 2',
    });
  });

  it('mặc định: nháp (published=false), sortOrder 0, mọi chiều rỗng', () => {
    const s = parseGuideFile('a.md', doc('title: A\nslug: a'));
    expect(s).toMatchObject({ published: false, sortOrder: 0, roles: [], positions: [], departments: [], permissions: [] });
  });

  it('danh sách dạng block "- item"', () => {
    const s = parseGuideFile('a.md', doc('title: A\nslug: a\nroles:\n  - admin\n  - manager\npermissions:\n  - customers.view'));
    expect(s.roles).toEqual(['admin', 'manager']);
    expect(s.permissions).toEqual(['customers.view']);
  });

  it('chịu BOM + CRLF ở cả frontmatter', () => {
    const raw = '\uFEFF---\r\ntitle: A\r\nslug: a\r\n---\r\nXin chào\r\n';
    expect(parseGuideFile('a.md', raw).content).toBe('Xin chào');
  });

  it('tiêu đề có dấu nháy / chứa # trong nháy không bị cắt', () => {
    expect(parseGuideFile('a.md', doc('title: "Mục #1: Bắt đầu"\nslug: a')).title).toBe('Mục #1: Bắt đầu');
  });

  const bad: Array<[string, string, RegExp]> = [
    ['thiếu frontmatter', 'Xin chào', /thiếu frontmatter/],
    ['frontmatter không đóng', '---\ntitle: A\nslug: a\nNội dung', /không có dòng --- đóng/],
    ['thiếu title', doc('slug: a'), /thiếu "title"/],
    ['thiếu slug', doc('title: A'), /thiếu "slug"/],
    ['slug sai định dạng', doc('title: A\nslug: Khach_Hang'), /không hợp lệ/],
    ['slug khác tên file', doc('title: A\nslug: b'), /phải trùng tên file/],
    ['slug dành riêng', doc('title: A\nslug: manage'), /phải trùng tên file|dành riêng/],
    ['khoá lạ', doc('title: A\nslug: a\nrole: [admin]'), /khoá frontmatter lạ/],
    ['khoá trùng', doc('title: A\nslug: a\ntitle: B'), /khai báo 2 lần/],
    ['published sai', doc('title: A\nslug: a\npublished: yes'), /true hoặc false/],
    ['sortOrder âm', doc('title: A\nslug: a\nsortOrder: -1'), /số nguyên không âm/],
    ['list không có ngoặc', doc('title: A\nslug: a\nroles: admin'), /dạng \[a, b\]/],
    ['permission sai dạng', doc('title: A\nslug: a\npermissions: [CustomersView]'), /không hợp lệ/],
    ['nội dung rỗng', doc('title: A\nslug: a', '\n  \n'), /không được để trống/],
  ];
  it.each(bad)('từ chối: %s', (_name, raw, re) => {
    expect(() => parseGuideFile(_name === 'slug dành riêng' ? 'manage.md' : 'a.md', raw)).toThrow(re);
  });

  it('lỗi mang tên file', () => {
    try {
      parseGuideFile('x.md', 'không có gì');
      fail('phải ném lỗi');
    } catch (e) {
      expect(e).toBeInstanceOf(GuideFileError);
      expect((e as Error).message.startsWith('x.md: ')).toBe(true);
    }
  });
});

describe('parseGuideFile - loại trừ (excludeRoles/Positions/Departments)', () => {
  const base = ['title: Khách hàng', 'slug: khach-hang'];
  it('mặc định: 3 danh sách loại trừ rỗng', () => {
    const spec = parseGuideFile('khach-hang.md', doc(base.join('\n')));
    expect(spec).toMatchObject({ excludeRoles: [], excludePositions: [], excludeDepartments: [] });
  });
  it('đọc dạng [a, b] và dạng block "- item"', () => {
    const spec = parseGuideFile(
      'khach-hang.md',
      doc([...base, 'excludePositions: [media]', 'excludeDepartments:', '  - "Kinh doanh 1"', 'excludeRoles: [employee, manager]'].join('\n')),
    );
    expect(spec.excludePositions).toEqual(['media']);
    expect(spec.excludeDepartments).toEqual(['Kinh doanh 1']);
    expect(spec.excludeRoles).toEqual(['employee', 'manager']);
  });
  it('cùng 1 giá trị vừa ở include vừa ở exclude (cùng chiều) -> lỗi mang tên file', () => {
    expect(() => parseGuideFile('khach-hang.md', doc([...base, 'positions: [media, sales]', 'excludePositions: [media]'].join('\n')))).toThrow(
      /khach-hang\.md.*media.*vừa được xem vừa bị loại trừ/,
    );
  });
  it('cùng giá trị ở 2 chiều KHÁC nhau thì hợp lệ', () => {
    expect(() => parseGuideFile('khach-hang.md', doc([...base, 'roles: [media]', 'excludePositions: [media]'].join('\n')))).not.toThrow();
  });
});

describe('normalizeContent', () => {
  it('CRLF -> LF và bỏ khoảng trắng cuối', () => {
    expect(normalizeContent('a\r\nb  \r\n\r\n')).toBe('a\nb');
  });
});

describe('extractDemoIds', () => {
  it('lấy id mẫu (token đầu) của mọi khối az-demo, bỏ qua khối code khác', () => {
    const md = ['Mở đầu', '```az-demo', 'status-tags', '```', '', '```ts', 'const a = 1', '```', '```az-demo', 'customer-table-by-viewer persona=manager', '```'].join('\n');
    expect(extractDemoIds(md)).toEqual(['status-tags', 'customer-table-by-viewer']);
  });
});
