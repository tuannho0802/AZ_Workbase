import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bổ sung các index còn thiếu, phát hiện khi rà soát hiệu năng vòng 3.
 * Toàn bộ đều là CREATE INDEX (bổ sung), không đổi schema/dữ liệu hiện có,
 * an toàn để chạy trên production mà không cần downtime hay backfill.
 */
export class AddPerformanceIndexes1776500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1) customer_assignments: bulkAssign() query đồng thời
    //    customer_id IN (...) AND assigned_to_id IN (...) AND status = 'active'
    //    Trước đây chỉ có 3 index đơn cột (customer_id, assigned_to_id, status)
    //    -> MySQL phải chọn 1 trong 3 rồi lọc phần còn lại bằng "Using where"
    //    (hoặc index merge, thường kém hiệu quả hơn 1 composite index).
    //    Composite (customer_id, assigned_to_id, status) giúp query lookup
    //    "đã tồn tại assignment active chưa" trong bulkAssign dùng đúng 1 index.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE INDEX idx_ca_customer_assigned_status
      ON customer_assignments(customer_id, assigned_to_id, status);
    `);

    // ------------------------------------------------------------------
    // 2) leave_requests: bảng chưa có index nào ngoài FK tự động
    //    (requester_id, approver_id). Các query hay dùng:
    //    - findPending/findHistory: WHERE status = ... (JOIN requester.role)
    //    - create(): WHERE requester_id = ? AND status NOT IN (...) AND
    //      start_date BETWEEN ? AND ?
    //    Composite (status, requester_id) phục vụ tốt cả 2 nhóm query trên;
    //    (requester_id, start_date) phục vụ riêng check trùng lịch nghỉ.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE INDEX idx_leave_status_requester
      ON leave_requests(status, requester_id);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_leave_requester_startdate
      ON leave_requests(requester_id, start_date);
    `);

    // ------------------------------------------------------------------
    // 3) customers: getStatsByStatus() lọc theo (deleted_at, status) rồi
    //    ORDER BY created_at DESC + LIMIT 1000. Index cũ idx_customers_deleted_status
    //    chỉ có (deleted_at, status) nên MySQL vẫn phải filesort theo created_at.
    //    Đổi sang composite 3 cột để index tự trả về đúng thứ tự cần, tránh
    //    filesort trên tập dữ liệu đã lọc.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE INDEX idx_customers_deleted_status_created
      ON customers(deleted_at, status, created_at DESC);
    `);
    // Giữ lại idx_customers_deleted_status cũ vì vẫn có chỗ dùng (deleted_at, status)
    // không kèm sort theo created_at (VD: đếm số lượng) — composite mới không thay
    // thế hoàn toàn nên không xoá để tránh rủi ro, chỉ bổ sung.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_customers_deleted_status_created ON customers`);
    await queryRunner.query(`DROP INDEX idx_leave_requester_startdate ON leave_requests`);
    await queryRunner.query(`DROP INDEX idx_leave_status_requester ON leave_requests`);
    await queryRunner.query(`DROP INDEX idx_ca_customer_assigned_status ON customer_assignments`);
  }
}
