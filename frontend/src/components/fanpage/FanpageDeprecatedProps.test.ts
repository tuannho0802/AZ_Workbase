import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Quét TĨNH mã nguồn Fanpage tìm prop antd 6 đã deprecated (mỗi cái bắn `Warning: [antd: X] ... is deprecated` ở dev).
 * Bổ sung cho `FanpageNoWarnings.test.tsx` (chạy thật, chỉ phủ vài component): test này phủ MỌI file Fanpage mà không cần mock hook.
 * Danh sách rút từ `warning.deprecated(...)` trong antd 6.3.5 + các prop v5 đã đổi tên. Thêm dòng mới khi nâng antd.
 */
const RULES: Array<{ name: string; re: RegExp; fix: string }> = [
    { name: 'maskClosable', re: /\bmaskClosable\b/, fix: 'mask={{ closable: false }}' },
    { name: 'destroyOnClose', re: /\bdestroyOnClose\b/, fix: 'destroyOnHidden' },
    { name: 'destroyInactiveTabPane', re: /\bdestroyInactiveTabPane\b/, fix: 'destroyOnHidden' },
    { name: 'Space direction', re: /<Space\b[^>]*\sdirection=/, fix: 'orientation=' },
    { name: 'Alert message', re: /<Alert\b[^>]*\smessage=/, fix: 'title=' },
    { name: 'Tabs.TabPane', re: /Tabs\.TabPane/, fix: 'Tabs items' },
    { name: 'Timeline.Item', re: /Timeline\.Item/, fix: 'Timeline items' },
    { name: 'Breadcrumb.Item', re: /Breadcrumb\.(Item|Separator)/, fix: 'Breadcrumb items' },
    { name: 'dropdownMatchSelectWidth', re: /\bdropdownMatchSelectWidth\b/, fix: 'popupMatchSelectWidth' },
    { name: 'Button.Group / Input.Group', re: /\b(Button|Input)\.Group\b/, fix: 'Space.Compact' },
    { name: 'bodyStyle|headerStyle|maskStyle|footerStyle', re: /\b(bodyStyle|headerStyle|maskStyle|footerStyle)\s*=/, fix: 'styles={{ body|header|mask|footer }}' },
    { name: 'Statistic valueStyle', re: /\bvalueStyle\b/, fix: 'styles={{ content }}' },
    { name: 'Drawer width/height', re: /<Drawer\b[^>]*\s(width|height)=/, fix: 'size=' },
    { name: 'popupClassName / dropdownStyle / dropdownClassName', re: /\b(dropdownStyle|dropdownClassName|popupClassName)\s*=/, fix: 'classNames.popup / styles.popup' },
    { name: 'onDropdownVisibleChange / onVisibleChange', re: /\b(onDropdownVisibleChange|onVisibleChange)\b/, fix: 'onOpenChange' },
    { name: 'Tooltip/Popover visible', re: /<(Tooltip|Popover|Popconfirm|Dropdown)\b[^>]*\svisible=/, fix: 'open=' },
    { name: 'Tooltip overlay*', re: /\b(overlayStyle|overlayClassName|overlayInnerStyle)\s*=/, fix: 'styles.root / classNames.root' },
    { name: 'Dropdown overlay', re: /<Dropdown\b[^>]*\soverlay=/, fix: 'menu=' },
    { name: 'iconPosition', re: /\biconPosition\s*=/, fix: 'iconPlacement' },
    { name: 'dotPosition', re: /\bdotPosition\s*=/, fix: 'dotPlacement' },
    { name: 'bordered', re: /<(Card|Tag|Input|Select|DatePicker|InputNumber)\b[^>]*\sbordered=/, fix: 'variant=' },
    { name: 'Progress strokeWidth', re: /<Progress\b[^>]*\sstrokeWidth=/, fix: 'size=' },
    { name: 'Spin tip', re: /<Spin\b[^>]*\stip=/, fix: 'description=' },
    // Chỉ xét file CÓ dùng <Timeline> (Tabs items vẫn hợp lệ với `children:`).
    { name: 'Timeline items.children', re: /^(?=[\s\S]*<Timeline\b)[\s\S]*\bchildren\s*:/, fix: 'items.content' },
];

const dirs = [join(__dirname), join(__dirname, '../../app/(dashboard)/fanpage')];
const files = dirs.flatMap((d) =>
    readdirSync(d)
        .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
        .map((f) => join(d, f)),
);

describe('Fanpage: không dùng prop antd 6 đã deprecated (quét tĩnh)', () => {
    it('có file để quét (tránh test rỗng vì sai đường dẫn)', () => {
        expect(files.length).toBeGreaterThan(20);
    });

    it.each(RULES)('$name', ({ re, fix }) => {
        const hits = files.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => f.replace(/^.*\/src\//, 'src/'));
        expect(hits, `Dùng prop deprecated - đổi sang ${fix}`).toEqual([]);
    });
});
