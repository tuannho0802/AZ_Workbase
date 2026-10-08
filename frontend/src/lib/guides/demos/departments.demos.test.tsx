import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { DEPARTMENT_DEMOS } from './departments.demos';

const demo = (id: string) => DEPARTMENT_DEMOS.find((d) => d.id === id)!;
const buttons = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll('button')).filter((b) => b.textContent?.includes(text));

describe('mẫu Phòng ban: đăng ký + render', () => {
    it('4 mẫu có trong GUIDE_DEMOS', () => {
        expect(DEPARTMENT_DEMOS.map((d) => d.id)).toEqual(['department-table', 'department-form', 'department-delete', 'department-drawer']);
        for (const d of DEPARTMENT_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
    });

    it('department-table: admin có Thêm/Xem/Sửa/Xoá; assistant không có Xoá; employee không có nút nào và không có cột Thao tác', () => {
        const a = render(<>{demo('department-table').render({ viewer: 'admin' })}</>);
        expect(a.container.querySelectorAll('.ant-table-row')).toHaveLength(3);
        expect(buttons(a.container, 'Thêm phòng ban')).toHaveLength(1);
        expect(buttons(a.container, 'Xem')).toHaveLength(3);
        expect(buttons(a.container, 'Sửa')).toHaveLength(3);
        expect(buttons(a.container, 'Xoá')).toHaveLength(3);
        expect(a.container.textContent).toContain('Chưa gán');
        expect(a.container.textContent).toContain('Quản lý (Manager)');
        a.unmount();

        const s = render(<>{demo('department-table').render({ viewer: 'assistant' })}</>);
        expect(buttons(s.container, 'Thêm phòng ban')).toHaveLength(1);
        expect(buttons(s.container, 'Sửa')).toHaveLength(3);
        expect(buttons(s.container, 'Xoá')).toHaveLength(0);
        s.unmount();

        const e = render(<>{demo('department-table').render({ viewer: 'employee' })}</>);
        expect(e.container.textContent).not.toContain('Thao tác');
        expect(buttons(e.container, 'Thêm phòng ban')).toHaveLength(0);
        expect(buttons(e.container, 'Xem')).toHaveLength(0);
        expect(buttons(e.container, 'Sửa')).toHaveLength(0);
        expect(e.container.textContent).toContain('Đang hoạt động');
    });

    it('department-form: create chỉ có Tên/Mô tả/Màu; edit có thêm Quản lý + Trạng thái hoạt động', () => {
        const c = render(<>{demo('department-form').render({ mode: 'create' })}</>);
        expect(c.container.textContent).toContain('Thêm phòng ban mới');
        expect(c.container.textContent).toContain('Màu hiển thị (Tag)');
        expect(c.container.textContent).not.toContain('Quản lý phòng ban (Manager)');
        expect(c.container.textContent).not.toContain('Trạng thái hoạt động');
        c.unmount();
        const e = render(<>{demo('department-form').render({ mode: 'edit' })}</>);
        expect(e.container.textContent).toContain('Sửa phòng ban');
        expect(e.container.textContent).toContain('Quản lý phòng ban (Manager)');
        expect(e.container.textContent).toContain('Trạng thái hoạt động');
    });

    it('department-delete: with-users bắt buộc chọn phòng đích; empty chỉ xác nhận + lưu ý khách hàng', () => {
        const w = render(<>{demo('department-delete').render({ variant: 'with-users' })}</>);
        expect(w.container.textContent).toContain('Di dời nhân viên sang phòng ban');
        expect(w.container.textContent).toContain('Chọn phòng ban đích');
        w.unmount();
        const e = render(<>{demo('department-delete').render({ variant: 'empty' })}</>);
        expect(e.container.textContent).toContain('không còn nhân viên');
        expect(e.container.textContent).toContain('khách hàng liên kết phòng ban này');
        expect(e.container.textContent).not.toContain('Di dời nhân viên sang phòng ban');
    });

    it('department-drawer: có nhãn Manager đúng 1 người và dòng nói rõ gồm cả tài khoản bị khoá', () => {
        const { container } = render(<>{demo('department-drawer').render({})}</>);
        expect(container.textContent).toContain('Nhân viên phòng');
        expect(container.querySelectorAll('.ant-tag')).toHaveLength(1);
        expect(container.textContent).toContain('tài khoản đang bị khoá');
    });
});
