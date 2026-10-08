import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { POSITION_DEMOS } from './positions.demos';

const demo = (id: string) => POSITION_DEMOS.find((d) => d.id === id)!;
const buttons = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll('button')).filter((b) => b.textContent?.includes(text));

describe('mẫu Vị trí: đăng ký + render', () => {
    it('4 mẫu có trong GUIDE_DEMOS', () => {
        expect(POSITION_DEMOS.map((d) => d.id)).toEqual(['position-table', 'position-form', 'position-delete', 'position-visibility']);
        for (const d of POSITION_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
    });

    it('position-table: admin đủ nút (Xoá bỏ qua dòng Hệ thống); assistant không có Hiển thị dữ liệu/Xoá; employee không có cột Thao tác', () => {
        const a = render(<>{demo('position-table').render({ viewer: 'admin' })}</>);
        expect(a.container.querySelectorAll('.ant-table-row')).toHaveLength(4);
        expect(buttons(a.container, 'Thêm vị trí')).toHaveLength(1);
        expect(buttons(a.container, 'Hiển thị dữ liệu')).toHaveLength(4);
        expect(buttons(a.container, 'Sửa')).toHaveLength(4);
        expect(buttons(a.container, 'Xoá')).toHaveLength(3);
        a.unmount();

        const s = render(<>{demo('position-table').render({ viewer: 'assistant' })}</>);
        expect(buttons(s.container, 'Thêm vị trí')).toHaveLength(1);
        expect(buttons(s.container, 'Sửa')).toHaveLength(4);
        expect(buttons(s.container, 'Hiển thị dữ liệu')).toHaveLength(0);
        expect(buttons(s.container, 'Xoá')).toHaveLength(0);
        s.unmount();

        const e = render(<>{demo('position-table').render({ viewer: 'employee' })}</>);
        expect(e.container.textContent).not.toContain('Thao tác');
        expect(buttons(e.container, 'Thêm vị trí')).toHaveLength(0);
        expect(buttons(e.container, 'Sửa')).toHaveLength(0);
        expect(e.container.textContent).toContain('Hệ thống');
    });

    it('position-form: create có Mã vị trí; edit không có', () => {
        const c = render(<>{demo('position-form').render({ mode: 'create' })}</>);
        expect(c.container.textContent).toContain('Thêm vị trí mới');
        expect(c.container.textContent).toContain('Mã vị trí');
        c.unmount();
        const e = render(<>{demo('position-form').render({ mode: 'edit' })}</>);
        expect(e.container.textContent).toContain('Sửa vị trí');
        expect(e.container.textContent).not.toContain('Mã vị trí');
        expect(e.container.textContent).toContain('Màu hiển thị (Tag)');
    });

    it('position-delete: has-users báo từ chối kèm số nhân viên; free báo đã xoá', () => {
        const h = render(<>{demo('position-delete').render({ variant: 'has-users' })}</>);
        expect(h.container.textContent).toContain('đang có 3 nhân viên');
        h.unmount();
        const f = render(<>{demo('position-delete').render({ variant: 'free' })}</>);
        expect(f.container.textContent).toContain('Đã xoá vị trí');
    });

    it('position-visibility: inherit không có Gỡ override; override có thanh thông báo + Gỡ override', () => {
        const i = render(<>{demo('position-visibility').render({ state: 'inherit' })}</>);
        expect(buttons(i.container, 'Gỡ override')).toHaveLength(0);
        expect(i.container.querySelectorAll('.ant-switch')).toHaveLength(7);
        expect(i.container.querySelectorAll('.ant-switch-checked')).toHaveLength(7);
        i.unmount();
        const o = render(<>{demo('position-visibility').render({ state: 'override' })}</>);
        expect(buttons(o.container, 'Gỡ override')).toHaveLength(1);
        expect(o.container.textContent).toContain('Vị trí này đang có cấu hình riêng');
        expect(o.container.querySelectorAll('.ant-switch-checked')).toHaveLength(4);
    });
});
