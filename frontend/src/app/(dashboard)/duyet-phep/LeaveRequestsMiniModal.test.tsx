import { describe, expect, it } from 'vitest';
import { describeLeaveDrill, getLeaveQuickOptions } from './LeaveRequestsMiniModal';

const values = (o: ReturnType<typeof getLeaveQuickOptions>) => o.map((x) => x.value);

describe('getLeaveQuickOptions', () => {
    it('không preset -> đủ nút', () => {
        expect(values(getLeaveQuickOptions())).toEqual(['all', 'pending', 'approved', 'rejected', 'supplementary']);
    });

    it('đã bấm vào 1 trạng thái -> bỏ 3 nút trạng thái (luôn trùng/rỗng), còn Đơn bổ sung', () => {
        expect(values(getLeaveQuickOptions({ status: 'approved' }))).toEqual(['all', 'supplementary']);
    });

    it('đã bấm Đơn bổ sung -> bỏ nút Đơn bổ sung, còn nút trạng thái', () => {
        expect(values(getLeaveQuickOptions({ quick: 'supplementary' }))).toEqual(['all', 'pending', 'approved', 'rejected']);
    });
});

describe('describeLeaveDrill', () => {
    it('mô tả bucket ngày/tháng, thứ, trạng thái, đơn bổ sung', () => {
        expect(describeLeaveDrill({ bucket: '2026-09-07' })).toEqual(['Ngày 07/09']);
        expect(describeLeaveDrill({ bucket: '2026-09' }, 'month')).toEqual(['Tháng 09/2026']);
        expect(describeLeaveDrill({ weekday: 1, status: 'pending', quick: 'supplementary' })).toEqual(['Bắt đầu nghỉ Thứ 2', 'Chờ duyệt', 'Đơn bổ sung']);
    });

    it('không preset -> rỗng', () => {
        expect(describeLeaveDrill(undefined)).toEqual([]);
    });
});
