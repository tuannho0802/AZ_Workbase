import { connectionSource } from '../../database.config';

/**
 * ⚠️ SCRIPT DỌN DẸP BẢO MẬT (một lần) - báo lỗi trực tiếp kèm ảnh chụp màn
 * hình: trang "Nhật ký hoạt động" hiện NGUYÊN VĂN mật khẩu dạng chữ thường
 * (vd dòng "currentPassword: Trống -> Admin@123") cho bất kỳ ai xem được
 * audit log của tài khoản đó.
 *
 * NGUỒN GỐC: các bản ghi audit_logs CŨ được tạo TRƯỚC khi
 * `UsersService.buildUserAuditSnapshot()`/`buildCustomerAuditSnapshot()`...
 * được áp dụng - thời điểm đó code log THẲNG `{ ...updateDto }`/cả entity,
 * nên cột JSON `old_data`/`new_data` của các dòng này đã lưu SẴN giá trị
 * plaintext của các field như `currentPassword`/`newPassword`/`password`.
 *
 * `AuditDiffViewer.tsx` (FE) đã được vá để KHÔNG BAO GIỜ hiển thị các key
 * nhạy cảm này nữa (xem `isSensitiveKey()`) - nhưng đó chỉ là lớp HIỂN THỊ.
 * Dữ liệu THÔ vẫn còn nằm nguyên trong DB, bất kỳ ai có quyền truy vấn DB
 * trực tiếp (hoặc 1 API/view khác trong tương lai vô tình không qua
 * AuditDiffViewer) vẫn đọc được mật khẩu thật. Script này xử lý tận gốc:
 * quét TOÀN BỘ `old_data`/`new_data` (đệ quy, vì field nhạy cảm có thể nằm
 * lồng trong 1 object con), thay giá trị bằng chuỗi cố định
 * `[ĐÃ ẨN - DỌN DẸP BẢO MẬT]`, rồi ghi đè lại đúng dòng đó.
 *
 * KHÔNG sửa gì khác ngoài các key nhạy cảm - toàn bộ phần còn lại của bản ghi
 * audit (ai làm gì, lúc nào, đối tượng nào) giữ nguyên, KHÔNG xoá cả dòng.
 *
 * CÁCH DÙNG (chạy từ thư mục backend/, đã có .env.development trỏ đúng DB):
 *   1. Xem trước (KHÔNG sửa gì, chỉ liệt kê dòng nào sẽ bị ảnh hưởng):
 *        npm run audit:redact-secrets
 *   2. Sau khi xem lại kỹ danh sách ở bước 1, áp dụng thật:
 *        npm run audit:redact-secrets -- --apply
 *
 * Theo đúng mục 7 quy ước dự án: KHÔNG script nào tự ý chạy lên DB production
 * của người dùng - luôn ở chế độ xem-trước (dry-run) làm mặc định, người
 * dùng tự quyết định thêm `--apply` sau khi đã xác nhận kết quả dry-run hợp lý.
 */

const REDACTED = '[ĐÃ ẨN - DỌN DẸP BẢO MẬT]';

// Cùng danh sách chuỗi con nhạy cảm với FE (`isSensitiveKey()` trong
// `AuditDiffViewer.tsx`) - giữ đồng bộ 2 nơi, đổi 1 chỗ nhớ đổi luôn chỗ kia.
const SENSITIVE_SUBSTRINGS = ['password', 'pwd', 'token', 'secret'];

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[_-]/g, '').toLowerCase();
  return SENSITIVE_SUBSTRINGS.some((s) => normalized.includes(s));
}

/**
 * Đệ quy trong object/mảng lồng nhau, thay giá trị của MỌI key nhạy cảm bằng
 * `REDACTED`. Trả về `true` nếu có ít nhất 1 chỗ bị sửa (để biết dòng nào cần
 * ghi lại xuống DB, tránh UPDATE thừa những dòng không liên quan).
 */
function redactInPlace(node: unknown): boolean {
  if (node === null || typeof node !== 'object') return false;

  let changed = false;

  if (Array.isArray(node)) {
    for (const item of node) {
      if (redactInPlace(item)) changed = true;
    }
    return changed;
  }

  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (isSensitiveKey(key)) {
      if (obj[key] !== REDACTED) {
        obj[key] = REDACTED;
        changed = true;
      }
      continue;
    }
    if (redactInPlace(obj[key])) changed = true;
  }
  return changed;
}

async function run() {
  const apply = process.argv.includes('--apply');

  if (!connectionSource.isInitialized) {
    await connectionSource.initialize();
  }

  const rows: Array<{ id: number; old_data: string | null; new_data: string | null }> =
    await connectionSource.query(
      `SELECT id, old_data, new_data FROM audit_logs WHERE old_data IS NOT NULL OR new_data IS NOT NULL`,
    );

  console.log(`🔍 Đang quét ${rows.length} dòng trong bảng audit_logs...`);

  let affectedCount = 0;

  for (const row of rows) {
    // Cột kiểu JSON: driver mysql2 của TypeORM thường TỰ parse sẵn thành
    // object/array (không phải string) khi query thô qua `.query()` - vẫn
    // phòng hờ trường hợp trả về string bằng cách tự parse nếu cần.
    let oldData: unknown = row.old_data;
    let newData: unknown = row.new_data;
    if (typeof oldData === 'string') {
      try { oldData = JSON.parse(oldData); } catch { /* giữ nguyên nếu không phải JSON hợp lệ */ }
    }
    if (typeof newData === 'string') {
      try { newData = JSON.parse(newData); } catch { /* giữ nguyên nếu không phải JSON hợp lệ */ }
    }

    const oldChanged = redactInPlace(oldData);
    const newChanged = redactInPlace(newData);

    if (!oldChanged && !newChanged) continue;

    affectedCount++;
    console.log(
      `${apply ? '✏️  Đang sửa' : '⚠️  SẼ sửa (dry-run)'} audit_logs.id=${row.id}` +
        `${oldChanged ? ' [old_data có field nhạy cảm]' : ''}` +
        `${newChanged ? ' [new_data có field nhạy cảm]' : ''}`,
    );

    if (apply) {
      await connectionSource.query(
        `UPDATE audit_logs SET old_data = ?, new_data = ? WHERE id = ?`,
        [oldData === null ? null : JSON.stringify(oldData), newData === null ? null : JSON.stringify(newData), row.id],
      );
    }
  }

  console.log('---------------------------------------------------------');
  if (affectedCount === 0) {
    console.log('✅ Không tìm thấy dòng nào chứa field nhạy cảm. Không cần dọn dẹp.');
  } else if (apply) {
    console.log(`✅ Đã dọn dẹp xong ${affectedCount} dòng trong audit_logs.`);
  } else {
    console.log(
      `⚠️  Tìm thấy ${affectedCount} dòng cần dọn dẹp (CHƯA sửa gì - đây là chế độ xem trước).`,
    );
    console.log('   Chạy lại kèm --apply để thực sự ghi xuống DB:');
    console.log('     npm run audit:redact-secrets -- --apply');
  }

  await connectionSource.destroy();
}

run().catch((err) => {
  console.error('❌ Script thất bại:', err);
  process.exit(1);
});
