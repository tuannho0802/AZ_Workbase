import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { NOTIFICATION_DEMOS } from './notifications.demos';

const demo = (id: string) => NOTIFICATION_DEMOS.find((d) => d.id === id)!;

describe('mẫu Thông báo: đăng ký + render', () => {
    it('3 mẫu có trong GUIDE_DEMOS', () => {
        expect(NOTIFICATION_DEMOS.map((d) => d.id)).toEqual(['notification-list', 'notification-kinds', 'notification-hide-flow']);
        for (const d of NOTIFICATION_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
    });

    it('notification-list view=all: nhãn bộ lọc đúng chữ trang thật, 4 dòng, nút Đọc tất cả, nút Ẩn', () => {
        render(<>{demo('notification-list').render({ view: 'all' })}</>);
        for (const t of ['Tất cả', 'Khách hàng', 'Công việc', 'Thông báo', 'Đã ẩn', 'Chỉ chưa đọc', 'Đọc tất cả']) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
        expect(screen.getAllByTestId('notification-row')).toHaveLength(4);
        expect(screen.getAllByLabelText('Ẩn thông báo')).toHaveLength(4);
        expect(screen.getByText('Không khả dụng')).toBeTruthy();
    });

    it('notification-list view=hidden: có Khôi phục + Xoá vĩnh viễn, không có Đọc tất cả', () => {
        render(<>{demo('notification-list').render({ view: 'hidden' })}</>);
        expect(screen.getAllByTestId('notification-row')).toHaveLength(2);
        expect(screen.getAllByLabelText('Khôi phục thông báo')).toHaveLength(2);
        expect(screen.getAllByLabelText('Xoá vĩnh viễn')).toHaveLength(2);
        expect(screen.queryByText('Đọc tất cả')).toBeNull();
    });

    it('notification-kinds / notification-hide-flow render đủ nội dung chính', () => {
        render(<>{demo('notification-kinds').render({})}</>);
        for (const t of ['Khách hàng', 'Công việc', 'Thông báo']) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
        render(<>{demo('notification-hide-flow').render({})}</>);
        for (const t of ['Hộp thư', 'Đã ẩn', 'Khôi phục', 'Xoá vĩnh viễn']) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    });
});
