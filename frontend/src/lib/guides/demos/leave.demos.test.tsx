import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import {
    DEMO_SCOPE_ROWS_FOR_TEST as ROWS,
    LEAVE_DEMOS,
    LEAVE_VIEWERS_FOR_TEST as VIEWERS,
    leaveAttendanceSymbols,
    leaveRowActions,
    leaveVisibleTabs,
} from './leave.demos';

const demo = (id: string) => LEAVE_DEMOS.find((d) => d.id === id)!;
const viewer = (id: string) => VIEWERS.find((v) => v.id === id)!;
const row = (id: number) => ROWS.find((r) => r.id === id)!;

describe('mẫu Nghỉ phép / Duyệt phép / Loại phép: đăng ký + render', () => {
    it('8 mẫu có trong GUIDE_DEMOS', () => {
        for (const d of LEAVE_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
        expect(LEAVE_DEMOS.map((d) => d.id)).toEqual([
            'leave-status-tags',
            'leave-form',
            'leave-my-requests',
            'leave-approve-table',
            'leave-actions-by-viewer',
            'leave-type-table',
            'leave-type-form',
            'leave-type-delete-fallback',
        ]);
    });

    it('leave-status-tags: đủ 4 trạng thái + Đơn bổ sung', () => {
        render(<>{demo('leave-status-tags').render({})}</>);
        for (const t of ['Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Đã hủy', 'Đơn bổ sung']) expect(screen.getByText(t)).toBeTruthy();
    });

    it('leave-my-requests: nút Hủy chỉ ở đơn Chờ duyệt (đúng 1 dòng mẫu)', () => {
        render(<>{demo('leave-my-requests').render({})}</>);
        expect(screen.getAllByRole('button', { name: /Hủy/ })).toHaveLength(1);
    });

    it('leave-approve-table: mỗi đơn chờ có đủ Duyệt / Từ chối / Sửa và có hộp thoại lý do từ chối', () => {
        render(<>{demo('leave-approve-table').render({})}</>);
        expect(screen.getAllByRole('button', { name: /Duyệt/ })).toHaveLength(3);
        expect(screen.getAllByRole('button', { name: /Sửa/ })).toHaveLength(3);
        expect(screen.getByRole('button', { name: /Xác nhận từ chối/ })).toBeTruthy();
    });

    it('leave-type-table: loại Hệ thống không có nút Xoá (chỉ loại tuỳ chỉnh)', () => {
        render(<>{demo('leave-type-table').render({})}</>);
        expect(screen.getAllByRole('button', { name: /Xoá/ })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: /Sửa/ })).toHaveLength(8);
        expect(screen.getAllByText('Hệ thống')).toHaveLength(7);
    });

    it('leave-type-delete-fallback: nút Xoá bị khoá tới khi chọn loại thay thế', () => {
        render(<>{demo('leave-type-delete-fallback').render({})}</>);
        expect((screen.getByRole('button', { name: 'Xoá' }) as HTMLButtonElement).disabled).toBe(true);
    });
});

describe('leave-actions-by-viewer: logic quyền (mirror isEligibleApprover / applyApproverScope)', () => {
    it('Admin: duyệt mọi đơn chờ, sửa mọi đơn chờ/đã duyệt, huỷ mọi đơn đã xử lý', () => {
        const a = viewer('admin');
        expect([1, 2, 3].every((id) => leaveRowActions(a, row(id)).approveReject)).toBe(true);
        expect(leaveRowActions(a, row(4))).toEqual({ approveReject: false, edit: true, trash: true, inHistory: true });
        expect(leaveRowActions(a, row(5))).toEqual({ approveReject: false, edit: false, trash: true, inHistory: true });
    });

    it('Manager (Kinh doanh 1): chỉ phòng mình + người được gán riêng; không có quyền Huỷ', () => {
        const m = viewer('manager');
        expect(leaveRowActions(m, row(1)).approveReject).toBe(true); // cùng phòng
        expect(leaveRowActions(m, row(2)).approveReject).toBe(false); // phòng khác
        expect(leaveRowActions(m, row(3)).approveReject).toBe(true); // ngoại lệ gán riêng
        expect(leaveRowActions(m, row(4)).trash).toBe(false); // mặc định không có delete
        expect(leaveRowActions(m, row(4)).edit).toBe(true);
        expect(leaveRowActions(m, row(5)).inHistory).toBe(false); // đơn phòng khác không có trong Lịch sử
    });

    it('Assistant mặc định: duyệt/sửa mọi đơn nhưng Lịch sử chỉ phòng mình quản lý', () => {
        const s = viewer('assistant');
        expect(leaveRowActions(s, row(1)).approveReject).toBe(true);
        expect(leaveRowActions(s, row(4)).edit).toBe(true);
        expect(leaveRowActions(s, row(4)).inHistory).toBe(false); // KD1 không thuộc phòng Assistant quản lý
        expect(leaveRowActions(s, row(5)).inHistory).toBe(true); // KD2 thuộc phòng Assistant quản lý
    });

    it('tab thấy được theo quyền', () => {
        expect(leaveVisibleTabs(viewer('admin'))).toEqual(['Chờ phê duyệt', 'Lịch sử phê duyệt', 'Thùng rác', 'Thống kê']);
    });

    it('render theo tham số viewer', () => {
        render(<>{demo('leave-actions-by-viewer').render({ viewer: 'manager' })}</>);
        expect(screen.getByText(/Manager \(quản lý Kinh doanh 1\)/)).toBeTruthy();
    });
});

describe('ký hiệu chấm công theo cờ Hưởng lương', () => {
    it('có lương -> P / X/2; không lương -> KL / 1/2K', () => {
        expect(leaveAttendanceSymbols(true)).toEqual({ fullDay: 'P', halfDay: 'X/2' });
        expect(leaveAttendanceSymbols(false)).toEqual({ fullDay: 'KL', halfDay: '1/2K' });
    });
});
