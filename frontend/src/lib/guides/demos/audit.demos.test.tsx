import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { AUDIT_DEMOS } from './audit.demos';

const demo = (id: string) => AUDIT_DEMOS.find((d) => d.id === id)!;

describe('mẫu Nhật ký hệ thống: đăng ký + render', () => {
    it('2 mẫu có trong GUIDE_DEMOS', () => {
        expect(AUDIT_DEMOS.map((d) => d.id)).toEqual(['audit-row', 'audit-filters']);
        for (const d of AUDIT_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
    });

    it('audit-row: nhãn hành động lấy từ audit-meta, đủ 5 cột', () => {
        const c = render(<>{demo('audit-row').render({ kind: 'role' })}</>);
        for (const t of ['Thời gian', 'Người thực hiện', 'Hành động', 'Đối tượng', 'Chi tiết']) expect(c.container.textContent).toContain(t);
        expect(c.container.textContent).toContain('Sửa quyền của Role');
        expect(c.container.textContent).toContain('Role / Phân quyền');
        c.unmount();
        const d = render(<>{demo('audit-row').render({ kind: 'cleanup' })}</>);
        expect(d.container.textContent).toContain('Admin dọn dẹp nhật ký');
    });

    it('audit-filters: tab chính có đủ ô lọc; tab đăng nhập chỉ có người + ngày', () => {
        const m = render(<>{demo('audit-filters').render({ tab: 'main' })}</>);
        expect(m.container.textContent).toContain('Loại hành động');
        expect(m.container.textContent).toContain('Đối tượng');
        expect(m.container.querySelector('input[placeholder="Tìm tên khách hàng..."]')).not.toBeNull();
        m.unmount();
        const l = render(<>{demo('audit-filters').render({ tab: 'login' })}</>);
        expect(l.container.textContent).toContain('Người đăng nhập...');
        expect(l.container.textContent).not.toContain('Loại hành động');
    });
});
