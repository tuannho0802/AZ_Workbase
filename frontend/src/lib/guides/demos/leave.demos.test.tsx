import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { LEAVE_DEMOS } from './leave.demos';

describe('mẫu Nghỉ phép: đăng ký + render', () => {
    it('3 mẫu có trong GUIDE_DEMOS', () => {
        for (const d of LEAVE_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
        expect(LEAVE_DEMOS.map((d) => d.id)).toEqual(['leave-status-tags', 'leave-form', 'leave-my-requests']);
    });

    it('leave-status-tags: đủ 4 trạng thái + Đơn bổ sung', () => {
        render(<>{LEAVE_DEMOS[0].render({})}</>);
        for (const t of ['Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Đã hủy', 'Đơn bổ sung']) expect(screen.getByText(t)).toBeTruthy();
    });

    it('leave-my-requests: nút Hủy chỉ ở đơn Chờ duyệt (đúng 1 dòng mẫu)', () => {
        render(<>{LEAVE_DEMOS[2].render({})}</>);
        expect(screen.getAllByRole('button', { name: /Hủy/ })).toHaveLength(1);
    });
});
