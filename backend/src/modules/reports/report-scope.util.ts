import { Brackets, SelectQueryBuilder } from 'typeorm';

/**
 * Siết thêm cho scope='own' (không phải Admin) ở CHIỀU MARKETING: chỉ tính khách mà chính mình là
 * Marketing phụ trách HOẶC người tạo data. DÙNG CHUNG cho `ReportsMarketingService` (số trên KPI/bảng)
 * và `ReportsCustomerListService` (danh sách drill-down) để thẻ và danh sách LUÔN khớp phạm vi.
 */
export function applyMarketingOwnOnly(qb: SelectQueryBuilder<any>, viewerId: number): void {
  qb.andWhere(
    new Brackets((b) => {
      b.where('customer.marketingUserId = :selfId', { selfId: viewerId }).orWhere('customer.createdById = :selfId', {
        selfId: viewerId,
      });
    }),
  );
}
