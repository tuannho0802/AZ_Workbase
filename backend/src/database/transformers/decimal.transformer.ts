import { ValueTransformer } from 'typeorm';

/**
 * ⚠️ BUG THẬT ĐÃ XẢY RA - ĐỌC KỸ TRƯỚC KHI XOÁ FILE NÀY:
 *
 * TypeORM + driver `mysql2` trả cột kiểu `decimal`/`numeric` về dưới dạng
 * **CHUỖI** (`string`), KHÔNG PHẢI `number`, dù entity khai báo TypeScript
 * type là `number`. Đây là hành vi MẶC ĐỊNH của mysql2 (JS `number` không
 * biểu diễn chính xác tuyệt đối mọi giá trị thập phân, nên driver chủ động
 * không tự ép kiểu) - TypeORM không tự sửa hộ, phải khai `transformer` thủ
 * công cho từng cột `decimal` (giống hệt lý do `BooleanTransformer` cạnh
 * file này tồn tại - MySQL cũng không có kiểu boolean thật).
 *
 * Hệ quả thực tế đã xảy ra: `User.annualLeaveBalance` (decimal) trả về FE là
 * chuỗi `"12.0"` thay vì số `12`. Khi FE gửi nguyên giá trị đó lên endpoint
 * `POST /attendance-export/monthly` (DTO validate `@IsNumber()` - chỉ chấp
 * nhận `typeof value === 'number'`, KHÔNG tự ép kiểu chuỗi), validation báo
 * lỗi 400 `"annualLeaveBalance must be a number"` - trông như FE gửi sai
 * payload, nhưng thật ra lỗi nằm ở tầng ORM/DB từ trước đó rất xa.
 *
 * CÁCH DÙNG: gắn vào MỌI cột `type: 'decimal'` trong project (hiện có 3:
 * `User.annualLeaveBalance`, `Deposit.amount`, `LeaveRequest.totalDays`) -
 * `to()` giữ nguyên khi ghi xuống DB (mysql2 tự nhận number khi INSERT/UPDATE,
 * không cần ép), `from()` ép chuỗi trả về từ DB thành number thật khi đọc.
 *
 *   @Column({ type: 'decimal', precision: 4, scale: 1, transformer: new DecimalTransformer() })
 *   annualLeaveBalance: number;
 */
export class DecimalTransformer implements ValueTransformer {
    to(value?: number | null): any {
        return value;
    }

    from(value?: string | number | null): number | null {
        if (value === null || value === undefined) return null;
        const num = typeof value === 'number' ? value : parseFloat(value);
        return Number.isNaN(num) ? null : num;
    }
}