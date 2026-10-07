import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { BROADCAST_DEMOS } from './broadcast.demos';

const demo = (id: string) => BROADCAST_DEMOS.find((d) => d.id === id)!;

describe('mẫu Gửi thông báo: đăng ký + render', () => {
    it('2 mẫu có trong GUIDE_DEMOS', () => {
        expect(BROADCAST_DEMOS.map((d) => d.id)).toEqual(['broadcast-compose', 'broadcast-audience-rules']);
        for (const d of BROADCAST_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
    });

    it('viewer=admin có nút "Toàn bộ nhân viên"; viewer=manager thì không', () => {
        const { unmount } = render(<>{demo('broadcast-compose').render({ viewer: 'admin' })}</>);
        expect(screen.getByText('Toàn bộ nhân viên')).toBeTruthy();
        unmount();
        render(<>{demo('broadcast-compose').render({ viewer: 'manager' })}</>);
        expect(screen.queryByText('Toàn bộ nhân viên')).toBeNull();
        expect(screen.getByText('Theo phòng ban')).toBeTruthy();
    });

    it('state=draft: nút Gửi tắt; state=previewed: nút "Gửi tới 12 người" bật + có khung kết quả xem trước', () => {
        const { unmount } = render(<>{demo('broadcast-compose').render({ state: 'draft' })}</>);
        expect((screen.getByRole('button', { name: 'Gửi' }) as HTMLButtonElement).disabled).toBe(true);
        unmount();
        render(<>{demo('broadcast-compose').render({ state: 'previewed' })}</>);
        expect((screen.getByRole('button', { name: 'Gửi tới 12 người' }) as HTMLButtonElement).disabled).toBe(false);
        expect(screen.getByText(/Sẽ gửi tới 12 người/)).toBeTruthy();
    });

    it('broadcast-audience-rules: đủ 3 kiểu người nhận', () => {
        render(<>{demo('broadcast-audience-rules').render({})}</>);
        for (const t of ['Chọn người nhận', 'Theo phòng ban', 'Toàn bộ nhân viên']) expect(screen.getByText(t)).toBeTruthy();
    });
});
