import { describe, expect, it } from 'vitest';
import { describeHistoryEvent } from './FanpageHistoryTab';

describe('describeHistoryEvent', () => {
    it('owners: liệt kê tên trước → sau', () => {
        expect(
            describeHistoryEvent({ type: 'owners', before: [{ id: 1, name: 'An' }], after: [{ id: 2, name: 'Bình' }, { id: 1, name: 'An' }] }),
        ).toBe('Đổi người phụ trách: An → Bình, An');
        expect(describeHistoryEvent({ type: 'owners', before: [], after: [{ id: 2, name: 'Bình' }] })).toBe('Đổi người phụ trách: Chưa có → Bình');
    });
    it('health: tên + ghi chú', () => {
        expect(
            describeHistoryEvent({
                type: 'health',
                before: { healthStatusName: 'Bình thường', healthNote: null },
                after: { healthStatusName: 'Checkpoint', healthNote: 'chờ xác minh' },
            }),
        ).toBe('Đổi tình trạng: Bình thường → Checkpoint (chờ xác minh)');
    });
    it('tracking / archive / created', () => {
        expect(describeHistoryEvent({ type: 'tracking', before: { isActive: true }, after: { isActive: false } })).toContain('Tắt theo dõi');
        expect(describeHistoryEvent({ type: 'tracking', before: { isActive: false }, after: { isActive: true } })).toBe('Bật theo dõi');
        expect(describeHistoryEvent({ type: 'archive', before: { archived: false }, after: { archived: true } })).toBe('Lưu trữ Page');
        expect(describeHistoryEvent({ type: 'archive', before: { archived: true }, after: { archived: false } })).toBe('Bỏ lưu trữ Page');
        expect(describeHistoryEvent({ type: 'created', before: null, after: { owners: [{ id: 1, name: 'An' }], health: null } })).toBe(
            'Tạo Page · Người phụ trách: An',
        );
    });
});