/**
 * PeriodType - CỐ ĐỊNH trong code (khác `PeriodicTaskStatus`, là catalog
 * Admin tự CRUD được). Đây là 4 giá trị cấu trúc dùng để validate quan hệ
 * cha-con ở `periodic_task_links` (Phase 2) - xem PLAN_PERIODIC_TASKS_MODULE.md
 * mục 2.2. KHÔNG biến thành bảng động vì:
 *  - Chỉ có đúng 4 giá trị, không có nhu cầu nghiệp vụ nào cần thêm/bớt.
 *  - `PERIOD_RANK` bên dưới PHẢI là 1 thứ tự CỐ ĐỊNH, không thể để Admin tự
 *    ý sắp xếp lại qua UI (sẽ phá vỡ logic chống chu trình ở Phase 2).
 */
export enum PeriodType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

/**
 * Thứ tự "độ lớn kỳ hạn" - số càng lớn thì kỳ hạn càng dài. Dùng ở Phase 2
 * (`PeriodicTaskLinksService`) để validate 1 liên kết cha-con: parent PHẢI có
 * rank > rank của child (cho phép skip-level, vd Daily(1) -> Monthly(3) hợp
 * lệ, nhưng Weekly(2) không được làm cha của Monthly(3)).
 */
export const PERIOD_RANK: Record<PeriodType, number> = {
  [PeriodType.DAILY]: 1,
  [PeriodType.WEEKLY]: 2,
  [PeriodType.MONTHLY]: 3,
  [PeriodType.YEARLY]: 4,
};
