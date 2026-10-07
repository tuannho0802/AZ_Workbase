import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { USERS_DEMOS } from './users.demos';

const demo = (id: string) => USERS_DEMOS.find((d) => d.id === id)!;

describe('mẫu Nhân viên: đăng ký + render', () => {
    it('3 mẫu có trong GUIDE_DEMOS', () => {
        expect(USERS_DEMOS.map((d) => d.id)).toEqual(['users-table', 'user-actions-by-viewer', 'user-form']);
        for (const d of USERS_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
    });

    it('users-table: admin 5 dòng + nút Xoá + tab Đã xoá; manager chỉ phòng mình quản lý, không Xoá/Đã xoá', () => {
        const a = render(<>{demo('users-table').render({ viewer: 'admin' })}</>);
        expect(a.container.querySelectorAll('.ant-table-row')).toHaveLength(5);
        expect(a.container.textContent).toContain('Đã xoá');
        expect(a.container.textContent).toContain('Làm mới');
        // Không có Xoá ở chính admin (id 1) và Root Admin -> 4 dòng còn lại có Xoá
        const delA = Array.from(a.container.querySelectorAll('button')).filter((b) => b.textContent?.includes('Xoá'));
        expect(delA).toHaveLength(4);
        a.unmount();
        const m = render(<>{demo('users-table').render({ viewer: 'manager' })}</>);
        // Kinh doanh 1: Lê Hương (chính mình), Nguyễn An, Trần Bình
        expect(m.container.querySelectorAll('.ant-table-row')).toHaveLength(3);
        expect(m.container.textContent).not.toContain('Đã xoá');
        const delM = Array.from(m.container.querySelectorAll('button')).filter((b) => b.textContent?.includes('Xoá'));
        expect(delM).toHaveLength(0);
        expect(m.container.textContent).toContain('Reset Pass');
        m.unmount();
    });

    it('user-actions-by-viewer: có dòng Root Admin và dòng Xoá chỉ Admin có', () => {
        const { container } = render(<>{demo('user-actions-by-viewer').render({})}</>);
        const text = container.textContent ?? '';
        expect(text).toContain('Bật / tắt Root Admin');
        expect(text).toContain('Xoá / Khôi phục / Xoá vĩnh viễn');
        expect(container.querySelectorAll('.ant-table-row')).toHaveLength(8);
    });

    it('user-form: create có Mật khẩu, edit khoá Email và không có Mật khẩu; Trạng thái luôn có; Root Admin chỉ ở viewer=root', () => {
        const c = render(<>{demo('user-form').render({ mode: 'create', viewer: 'admin' })}</>);
        expect(c.container.textContent).toContain('Thêm nhân viên mới');
        expect(c.container.textContent).toContain('Mật khẩu');
        expect(c.container.textContent).toContain('Trạng thái');
        expect(c.container.textContent).not.toContain('Root Admin');
        c.unmount();
        const e = render(<>{demo('user-form').render({ mode: 'edit', viewer: 'manager' })}</>);
        expect(e.container.textContent).toContain('Sửa thông tin nhân viên');
        expect(e.container.textContent).not.toContain('Mật khẩu');
        expect((e.container.querySelector('input[disabled]') as HTMLInputElement | null)?.value).toBe('an@example.com');
        expect(e.container.textContent).toContain('Danh sách KHÔNG có Admin');
        expect(e.container.textContent).toContain('Bắt buộc chọn phòng ban mình quản lý');
        e.unmount();
        const r = render(<>{demo('user-form').render({ mode: 'edit', viewer: 'root' })}</>);
        expect(r.container.textContent).toContain('Root Admin');
        expect(r.container.textContent).toContain('Danh sách có cả Admin');
    });
});
