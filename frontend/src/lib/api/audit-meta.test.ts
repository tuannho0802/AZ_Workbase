import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ACTION_META, ENTITY_TYPE_LABELS, ACTION_GROUP_ORDER, ACTION_GROUP_LABELS } from './audit-meta';

/**
 * "Lưới an toàn" - đọc TRỰC TIẾP code Backend thật (không hardcode danh sách
 * action ở đây) để bắt lỗi thiếu nhãn ngay khi có ai thêm `action` mới ở BE
 * mà quên cập nhật `ACTION_META`/`ENTITY_TYPE_LABELS` ở đây.
 *
 * Chỉ quét các lệnh ghi vào bảng `audit_logs` DÙNG CHUNG (qua
 * `AuditService.logAction`/`logActionAsync`) - KHÔNG bao gồm action riêng
 * của `periodic_task_audit_logs` (bảng khác, action toàn chữ thường như
 * 'created'/'status_changed', xem `periodic-task-audit.service.ts`), khớp
 * đúng yêu cầu "track full hành động - trừ phần task ra".
 */

const BACKEND_SRC = path.resolve(__dirname, '../../../../backend/src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

// Vị trí tham số 2 (action, UPPER_SNAKE) và tham số 3 (entityType, lower_snake)
// của `logAction(callerId, action, entityType, ...)` - chấp nhận literal đơn
// hoặc ternary 1 tầng (`cond ? 'A' : 'B'`, đúng cách code hiện tại viết cho
// LOCK/UNLOCK, ACTIVATE/DEACTIVATE...). Không dùng "cửa sổ ký tự" thô để
// tránh dính nhầm chuỗi không liên quan (vd field `type: 'content_staff'`
// trong payload data ở tham số sau).
const STRING_OR_TERNARY = (charClass: string) =>
  `(?:'(${charClass})'|[\\w.]+\\s*\\?\\s*'(${charClass})'\\s*:\\s*'(${charClass})')`;

const CALL_RE = new RegExp(
  `\\.logAction(?:Async)?\\(\\s*[^,]+,\\s*` +
    STRING_OR_TERNARY('[A-Z][A-Z_]*') +
    `\\s*,\\s*` +
    STRING_OR_TERNARY('[a-z][a-z_]*'),
  'g',
);

function scanBackend(): { actions: Set<string>; entityTypes: Set<string> } {
  const actions = new Set<string>();
  const entityTypes = new Set<string>();
  const files = walk(BACKEND_SRC);

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('AuditService') && !text.includes('auditService')) continue;
    // Định nghĩa gốc của AuditService (audit.service.ts) cũng CHỨA các lệnh
    // `logAction(...)` thật cho ADMIN_CLEANUP_AUDIT_LOGS/ADMIN_BULK_DELETE_AUDIT_LOGS
    // -> vẫn quét, không loại trừ file này.
    for (const m of text.matchAll(CALL_RE)) {
      // Nhóm 1-3 = action (literal hoặc 2 nhánh ternary), 4-6 = entityType.
      [m[1], m[2], m[3]].filter(Boolean).forEach((a) => actions.add(a as string));
      [m[4], m[5], m[6]].filter(Boolean).forEach((e) => entityTypes.add(e as string));
    }
  }
  return { actions, entityTypes };
}

describe('audit-meta vs Backend thật', () => {
  const backendDirExists = fs.existsSync(BACKEND_SRC);

  it.skipIf(!backendDirExists)('mọi action ghi vào audit_logs dùng chung phải có nhãn trong ACTION_META', () => {
    const { actions } = scanBackend();
    const missing = [...actions].filter((a) => !ACTION_META[a]).sort();
    expect(missing, `Các action BE chưa có nhãn ở ACTION_META (audit-meta.ts): ${missing.join(', ')}`).toEqual([]);
  });

  it.skipIf(!backendDirExists)('mọi entityType ghi vào audit_logs dùng chung phải có nhãn trong ENTITY_TYPE_LABELS', () => {
    const { entityTypes } = scanBackend();
    const missing = [...entityTypes].filter((e) => !ENTITY_TYPE_LABELS[e]).sort();
    expect(
      missing,
      `Các entityType BE chưa có nhãn ở ENTITY_TYPE_LABELS (audit-meta.ts): ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('mọi action trong ACTION_META phải thuộc đúng 1 group đã khai báo ở ACTION_GROUP_ORDER', () => {
    const invalid = Object.entries(ACTION_META)
      .filter(([, meta]) => !ACTION_GROUP_ORDER.includes(meta.group))
      .map(([action]) => action);
    expect(invalid).toEqual([]);
  });

  it('ACTION_GROUP_ORDER và ACTION_GROUP_LABELS phải khớp key với nhau', () => {
    expect([...ACTION_GROUP_ORDER].sort()).toEqual(Object.keys(ACTION_GROUP_LABELS).sort());
  });
});
