import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { PERMISSION_DEMOS } from './permissions.demos';

const demo = (id: string) => PERMISSION_DEMOS.find((d) => d.id === id)!;
const buttons = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll('button')).filter((b) => b.textContent?.includes(text));

describe('mẫu Phân quyền: đăng ký + render', () => {
    it('3 mẫu có trong GUIDE_DEMOS', () => {
        expect(PERMISSION_DEMOS.map((d) => d.id)).toEqual(['permission-matrix', 'override-layers', 'ui-visibility-matrix']);
        for (const d of PERMISSION_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
    });

    it('permission-matrix: manage có nút Lưu thay đổi, ô tích mở; view có thanh Chỉ xem và ô tích bị khoá', () => {
        const m = render(<>{demo('permission-matrix').render({ viewer: 'manage' })}</>);
        expect(buttons(m.container, 'Lưu thay đổi')).toHaveLength(1);
        expect(m.container.textContent).not.toContain('Chỉ xem');
        expect(m.container.textContent).toContain('Ghi đè');
        expect(m.container.querySelectorAll('input[type="checkbox"]:disabled')).toHaveLength(0);
        m.unmount();

        const v = render(<>{demo('permission-matrix').render({ viewer: 'view' })}</>);
        expect(buttons(v.container, 'Lưu thay đổi')).toHaveLength(0);
        expect(v.container.textContent).toContain('Chỉ xem');
        expect(v.container.querySelectorAll('input[type="checkbox"]:disabled').length).toBeGreaterThan(0);
    });

    it('override-layers: kết quả đổi theo tầng (Vị trí đè Phòng ban đè Toàn cục)', () => {
        const g = render(<>{demo('override-layers').render({ layer: 'global' })}</>);
        expect(g.container.querySelectorAll('.ant-table-row')).toHaveLength(3);
        expect(g.container.textContent).not.toContain('Phòng ban quản lý Từ chối');
        g.unmount();

        const d = render(<>{demo('override-layers').render({ layer: 'department' })}</>);
        const dRows = Array.from(d.container.querySelectorAll('.ant-table-row'));
        expect(dRows[0].querySelector('td:last-child')?.textContent).toBe('Phòng ban quản lý');
        d.unmount();

        const p = render(<>{demo('override-layers').render({ layer: 'position' })}</>);
        const pRows = Array.from(p.container.querySelectorAll('.ant-table-row'));
        expect(pRows[1].querySelector('td:last-child')?.textContent).toBe('Từ chối');
    });

    it('ui-visibility-matrix: tầng sau đè tầng trước', () => {
        const c = render(<>{demo('ui-visibility-matrix').render({})}</>);
        const rows = Array.from(c.container.querySelectorAll('.ant-table-row'));
        expect(rows).toHaveLength(3);
        // Hàng 2: Toàn cục Hiện, Phòng ban Ẩn, Vị trí trống -> Ẩn
        expect(rows[1].querySelector('td:last-child')?.textContent).toBe('Ẩn');
        // Hàng 3: Vị trí Hiện đè Phòng ban Ẩn -> Hiện
        expect(rows[2].querySelector('td:last-child')?.textContent).toBe('Hiện');
    });
});
