import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đổi `attendance_logs.record_time` từ TIMESTAMP sang DATETIME.
 *
 * Lý do: MySQL LUÔN tự quy đổi cột TIMESTAMP theo session `time_zone` lúc
 * ghi/đọc (session time_zone trên Aiven mặc định thường là UTC) - kể cả khi
 * tầng ứng dụng đã bỏ hết offset (+07:00/VN_OFFSET_MS - xem
 * decode-device-time.util.ts), MySQL vẫn có thể tự ý lệch giờ ở tầng DB,
 * ngược lại đúng mục tiêu "lưu nguyên văn giờ máy báo, không quy đổi".
 * DATETIME hoàn toàn "naive" - ghi chuỗi/Date gì ra đúng y nguyên chuỗi đó,
 * không bị session timezone can thiệp.
 *
 * An toàn: chỉ đổi kiểu cột, KHÔNG đổi dữ liệu hiện có theo cách phá huỷ -
 * nhưng CẦN LƯU Ý (xem cảnh báo cuối file) dữ liệu TIMESTAMP cũ đã lưu (nếu
 * có) sẽ được MySQL tự quy đổi 1 LẦN DUY NHẤT sang giá trị "wall-clock" theo
 * session timezone hiện tại lúc chạy ALTER TABLE - có thể lệch nếu trước đó
 * đã có dữ liệu ghi theo hướng offset cũ.
 */
export class ChangeRecordTimeToDatetime1777500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE attendance_logs
      MODIFY COLUMN record_time DATETIME NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE attendance_logs
      MODIFY COLUMN record_time TIMESTAMP NOT NULL;
    `);
  }
}
