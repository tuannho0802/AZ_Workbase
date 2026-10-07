import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { BROADCAST_SENT_DEMOS } from './broadcast-sent.demos';

const demo = (id: string) => BROADCAST_SENT_DEMOS.find((d) => d.id === id)!;
// antd có thể nhân bản tiêu đề cột (header ẩn) -> so sánh tương đối admin vs manager.
const senderLabelCount = (viewer: string) => {
    const { container, unmount } = render(<>{demo('broadcast-sent-table').render({ viewer })}</>);
    const n = screen.getAllByText('Người gửi').length;
    const rows = container.querySelectorAll('.ant-table-row').length;
    const del = container.querySelectorAll('.anticon-delete').length;
    const edit = container.querySelectorAll('.anticon-edit').length;
    unmount();
    return { n, rows, del, edit };
};

describe('mẫu Thông báo đã gửi: đăng ký + render', () => {
    it('3 mẫu có trong GUIDE_DEMOS', () => {
        expect(BROADCAST_SENT_DEMOS.map((d) => d.id)).toEqual(['broadcast-sent-table', 'broadcast-sent-drawer', 'broadcast-sent-actions']);
        for (const d of BROADCAST_SENT_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
    });

    it('admin: 3 dòng, 3 nút Xoá; manager: 2 dòng, 0 Xoá, vẫn có Sửa; chỉ admin có ô lọc Người gửi', () => {
        const a = senderLabelCount('admin');
        const m = senderLabelCount('manager');
        expect(a.rows).toBe(3);
        expect(a.del).toBe(3);
        expect(m.rows).toBe(2);
        expect(m.del).toBe(0);
        expect(m.edit).toBe(2);
        expect(a.n - m.n).toBe(1);
    });

    it('broadcast-sent-drawer: đủ 3 trạng thái người nhận + 3 tab', () => {
        render(<>{demo('broadcast-sent-drawer').render({})}</>);
        for (const t of ['Đã khoá', 'Chưa đọc', 'Đã đọc', 'Tất cả']) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    });
});
