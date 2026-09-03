import { getReportPeriodRange } from './date-vn.util';

/**
 * Test riêng cho `getReportPeriodRange()` - hàm tính khoảng ngày TRỌN VẸN
 * theo lịch (Thứ Hai->CN, ngày 1->cuối tháng...) cho "Báo cáo doanh số".
 *
 * ⚠️ Đây CHÍNH LÀ yêu cầu nghiệp vụ cốt lõi đã chốt: "Sẽ tính theo kiểu lấy
 * mốc 1 tuần trước (1 tuần trọn vẹn) hoặc 1 tháng trọn vẹn thay vì lấy 30
 * hoặc 31 ngày tính từ ngày hiện tại (Không dùng cái này)" - nên test này
 * PHẢI cực kỳ chính xác từng mili-giây biên (00:00:00.000 / 23:59:59.999),
 * không chỉ kiểm tra "đúng ngày" chung chung.
 */
describe('getReportPeriodRange', () => {
  describe('period=week (ISO - Thứ Hai là đầu tuần)', () => {
    it('anchor giữa tuần (Thứ Tư 19/08/2026) -> Thứ Hai 17/08 00:00:00.000 -> CN 23/08 23:59:59.999', () => {
      const anchor = new Date(2026, 7, 19); // Thứ Tư
      const { start, end } = getReportPeriodRange('week', anchor);

      expect(start).toEqual(new Date(2026, 7, 17, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 7, 23, 23, 59, 59, 999));
    });

    it('anchor đúng Thứ Hai -> start = chính ngày đó (không lùi thêm 1 tuần)', () => {
      const anchor = new Date(2026, 7, 17); // Thứ Hai
      const { start, end } = getReportPeriodRange('week', anchor);

      expect(start).toEqual(new Date(2026, 7, 17, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 7, 23, 23, 59, 59, 999));
    });

    it('anchor đúng Chủ Nhật (dow=0, ca đặc biệt trong code) -> vẫn lùi về Thứ Hai CÙNG tuần, không lùi sang tuần sau', () => {
      const anchor = new Date(2026, 7, 23); // Chủ Nhật
      const { start, end } = getReportPeriodRange('week', anchor);

      expect(start).toEqual(new Date(2026, 7, 17, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 7, 23, 23, 59, 59, 999));
    });

    it('tuần vắt qua 2 tháng khác nhau vẫn tính đúng', () => {
      const anchor = new Date(2026, 7, 31); // Thứ Hai 31/08/2026
      const { start, end } = getReportPeriodRange('week', anchor);

      expect(start).toEqual(new Date(2026, 7, 31, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 8, 6, 23, 59, 59, 999)); // Chủ Nhật 06/09
    });
  });

  describe('period=month', () => {
    it('anchor giữa tháng 8 (31 ngày) -> ngày 1 -> ngày 31 23:59:59.999', () => {
      const anchor = new Date(2026, 7, 15);
      const { start, end } = getReportPeriodRange('month', anchor);

      expect(start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
    });

    it('tháng 2 năm thường (28 ngày, 2026 không nhuận) -> dừng đúng ngày 28, không tràn sang tháng 3', () => {
      const anchor = new Date(2026, 1, 10);
      const { start, end } = getReportPeriodRange('month', anchor);

      expect(start).toEqual(new Date(2026, 1, 1, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 1, 28, 23, 59, 59, 999));
    });

    it('tháng 2 năm nhuận (2028) -> dừng đúng ngày 29', () => {
      const anchor = new Date(2028, 1, 10);
      const { start, end } = getReportPeriodRange('month', anchor);

      expect(end).toEqual(new Date(2028, 1, 29, 23, 59, 59, 999));
    });

    it('tháng 12 -> KHÔNG tràn sang năm sau (kiểm tra riêng vì dùng công thức new Date(y, m+1, 0))', () => {
      const anchor = new Date(2026, 11, 25);
      const { start, end } = getReportPeriodRange('month', anchor);

      expect(start).toEqual(new Date(2026, 11, 1, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
    });
  });

  describe('period=quarter', () => {
    it('anchor tháng 8 (Q3) -> 01/07 -> 30/09 23:59:59.999', () => {
      const anchor = new Date(2026, 7, 15);
      const { start, end } = getReportPeriodRange('quarter', anchor);

      expect(start).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 8, 30, 23, 59, 59, 999));
    });

    it('anchor tháng 1 (Q1) -> 01/01 -> 31/03', () => {
      const anchor = new Date(2026, 0, 5);
      const { start, end } = getReportPeriodRange('quarter', anchor);

      expect(start).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 2, 31, 23, 59, 59, 999));
    });

    it('anchor tháng 12 (Q4) -> 01/10 -> 31/12, KHÔNG tràn sang năm sau', () => {
      const anchor = new Date(2026, 11, 20);
      const { start, end } = getReportPeriodRange('quarter', anchor);

      expect(start).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
    });
  });

  describe('period=year', () => {
    it('bất kỳ tháng nào trong năm -> luôn 01/01 -> 31/12 CÙNG năm đó', () => {
      const anchor = new Date(2026, 5, 10);
      const { start, end } = getReportPeriodRange('year', anchor);

      expect(start).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
    });
  });

  describe('period=custom', () => {
    it('dùng ĐÚNG customFrom/customTo (bỏ qua anchor hoàn toàn), ép full-day boundary', () => {
      const { start, end } = getReportPeriodRange(
        'custom',
        new Date(2099, 0, 1), // anchor bất kỳ - PHẢI bị bỏ qua hoàn toàn khi period=custom
        '2026-08-05',
        '2026-08-12',
      );

      expect(start).toEqual(new Date(2026, 7, 5, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 7, 12, 23, 59, 59, 999));
    });

    it('thiếu customFrom -> throw', () => {
      expect(() => getReportPeriodRange('custom', new Date(), undefined, '2026-08-12')).toThrow();
    });

    it('thiếu customTo -> throw', () => {
      expect(() => getReportPeriodRange('custom', new Date(), '2026-08-05', undefined)).toThrow();
    });
  });
});
