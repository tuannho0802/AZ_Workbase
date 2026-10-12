import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { ATTENDANCE_DEMOS } from './attendance.demos';

const demo = (id: string) => ATTENDANCE_DEMOS.find((d) => d.id === id)!;
const buttons = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll('button')).filter((b) => b.textContent?.includes(text));

describe('mẫu Máy chấm công: đăng ký + render', () => {
    it('2 mẫu có trong GUIDE_DEMOS', () => {
        expect(ATTENDANCE_DEMOS.map((d) => d.id)).toEqual(['attendance-table', 'zk-mapping']);
        for (const d of ATTENDANCE_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
    });

    it('attendance-table summary: đủ 5 trạng thái + dòng chưa map; logs: có Nguồn và Chưa khớp', () => {
        const s = render(<>{demo('attendance-table').render({ tab: 'summary' })}</>);
        for (const t of ['Đúng giờ', 'Đi muộn', 'Về sớm', 'Đi muộn & về sớm', 'Thiếu chấm ra', 'chưa map', 'Tổng giờ làm']) expect(s.container.textContent).toContain(t);
        s.unmount();
        const l = render(<>{demo('attendance-table').render({ tab: 'logs' })}</>);
        for (const t of ['Máy tự đẩy', 'Đồng bộ thủ công', 'Chưa khớp: UID 45', 'Mã máy']) expect(l.container.textContent).toContain(t);
    });

    it('zk-mapping: manage có Đồng bộ ngay/Gán/Đổi/Gỡ; view không có cột Thao tác', () => {
        const m = render(<>{demo('zk-mapping').render({ viewer: 'manage' })}</>);
        expect(buttons(m.container, 'Đồng bộ ngay')).toHaveLength(1);
        expect(buttons(m.container, 'Gán nhân viên')).toHaveLength(1);
        expect(buttons(m.container, 'Đổi mapping')).toHaveLength(2);
        expect(buttons(m.container, 'Gỡ')).toHaveLength(2);
        m.unmount();
        const v = render(<>{demo('zk-mapping').render({ viewer: 'view' })}</>);
        expect(v.container.textContent).not.toContain('Thao tác');
        expect(buttons(v.container, 'Đồng bộ ngay')).toHaveLength(0);
    });
});