import type { AuditLog } from '@/lib/types/audit.types';

/**
 * Metadata hiển thị cho trang "Nhật ký hệ thống" (audit_logs) - TÁCH khỏi
 * `audit-logs/page.tsx` để (1) trang không phình thêm ~150 dòng hằng số,
 * (2) test được độc lập, (3) có test "lưới an toàn" đối chiếu với action
 * thật ở Backend (xem `audit-meta.test.ts`) - thêm action mới ở BE mà quên
 * nhãn ở đây sẽ làm test đỏ ngay, thay vì lộ tên kỹ thuật ra UI như trước.
 *
 * KHÔNG gồm action của "Công việc định kỳ" (bảng riêng `periodic_task_audit_logs`,
 * xem trang /lich-su-cong-viec) - trừ 2 nhóm vẫn ghi vào `audit_logs` chung:
 * cấu hình Trạng thái công việc định kỳ và thao tác dọn log công việc của Admin.
 */

export type ActionGroupKey =
  | 'customer'
  | 'user'
  | 'permission'
  | 'org'
  | 'catalog'
  | 'link_group'
  | 'leave'
  | 'storage'
  | 'attendance'
  | 'audit';

export const ACTION_GROUP_LABELS: Record<ActionGroupKey, string> = {
  customer: 'Khách hàng & Data',
  user: 'Nhân viên & Tài khoản',
  permission: 'Phân quyền',
  org: 'Phòng ban, Vị trí, Quản lý phụ trách',
  catalog: 'Danh mục cấu hình (Trạng thái, Nguồn, Loại nghỉ phép)',
  link_group: 'Nhóm liên kết (Zalo/FB...)',
  leave: 'Nghỉ phép',
  storage: 'Lưu trữ & Tải lên',
  attendance: 'Chấm công',
  audit: 'Nhật ký hệ thống',
};

export const ACTION_GROUP_ORDER: ActionGroupKey[] = [
  'customer',
  'user',
  'permission',
  'org',
  'catalog',
  'link_group',
  'leave',
  'storage',
  'attendance',
  'audit',
];

export interface ActionMeta {
  label: string;
  color: string;
  group: ActionGroupKey;
}

const m = (label: string, color: string, group: ActionGroupKey): ActionMeta => ({ label, color, group });

export const ACTION_META: Record<string, ActionMeta> = {
  // ── Khách hàng & Data ──────────────────────────────────────────────────
  CREATE_CUSTOMER: m('Tạo khách hàng', 'green', 'customer'),
  UPDATE_CUSTOMER: m('Sửa khách hàng', 'blue', 'customer'),
  DELETE_CUSTOMER: m('Xóa khách hàng (vào thùng rác)', 'red', 'customer'),
  RESTORE_CUSTOMER: m('Khôi phục khách hàng', 'cyan', 'customer'),
  HARD_DELETE_CUSTOMER: m('Xóa vĩnh viễn khách hàng', 'volcano', 'customer'),
  IMPORT_CUSTOMERS: m('Nhập khách hàng từ Excel', 'geekblue', 'customer'),
  ASSIGN_CUSTOMER: m('Chia data', 'purple', 'customer'),
  UPDATE_ASSIGNMENT: m('Sửa lượt gán data', 'purple', 'customer'),
  RECLAIM_ASSIGNMENT: m('Thu hồi lượt gán data', 'magenta', 'customer'),
  CREATE_DEPOSIT: m('Nạp tiền', 'gold', 'customer'),
  DELETE_DEPOSIT: m('Xóa phiếu nạp tiền', 'red', 'customer'),
  CREATE_NOTE: m('Tạo ghi chú', 'cyan', 'customer'),
  UPDATE_NOTE: m('Sửa ghi chú', 'blue', 'customer'),
  DELETE_NOTE: m('Xóa ghi chú', 'red', 'customer'),
  SET_CUSTOMER_GROUP_MEMBERSHIP: m('Cập nhật tham gia nhóm liên kết', 'cyan', 'customer'),

  // ── Nhân viên & Tài khoản ──────────────────────────────────────────────
  CREATE_USER: m('Tạo nhân viên', 'green', 'user'),
  UPDATE_USER: m('Sửa nhân viên', 'blue', 'user'),
  USER_LOGIN: m('Đăng nhập', 'default', 'user'),
  USER_SELF_REGISTER: m('Tự đăng ký tài khoản', 'lime', 'user'),
  APPROVE_USER: m('Duyệt tài khoản', 'green', 'user'),
  REJECT_USER: m('Từ chối tài khoản', 'red', 'user'),
  SOFT_DELETE_USER: m('Xóa tài khoản (vào thùng rác)', 'red', 'user'),
  RESTORE_USER: m('Khôi phục tài khoản', 'cyan', 'user'),
  HARD_DELETE_USER: m('Xóa vĩnh viễn tài khoản', 'volcano', 'user'),
  RESET_PASSWORD: m('Đặt lại mật khẩu', 'orange', 'user'),
  CHANGE_OWN_PASSWORD: m('Tự đổi mật khẩu', 'orange', 'user'),
  UPDATE_OWN_PROFILE: m('Tự cập nhật hồ sơ', 'blue', 'user'),
  UPDATE_OWN_EMAIL: m('Tự đổi email', 'blue', 'user'),
  // Action cũ (endpoint PATCH /users/:id/profile) - đã bị xoá khỏi code ở
  // commit 2de0f28 khi thay bằng "Nhóm liên kết" mới, nhưng dữ liệu audit_logs
  // lịch sử vẫn còn tham chiếu action này -> vẫn cần nhãn để không lộ tên kỹ
  // thuật ra UI khi xem log cũ.
  UPDATE_USER_PROFILE: m('Sửa Fanpage/Group quản lý (tính năng cũ)', 'blue', 'user'),

  // ── Phân quyền ─────────────────────────────────────────────────────────
  CREATE_ROLE: m('Tạo Role', 'green', 'permission'),
  UPDATE_ROLE: m('Sửa Role', 'blue', 'permission'),
  DELETE_ROLE: m('Xóa Role', 'red', 'permission'),
  UPDATE_ROLE_PERMISSIONS: m('Sửa quyền của Role', 'geekblue', 'permission'),
  SET_ROLE_DEPARTMENT_OVERRIDE: m('Đặt quyền riêng theo phòng ban', 'geekblue', 'permission'),
  DELETE_ROLE_DEPARTMENT_OVERRIDE: m('Xóa quyền riêng theo phòng ban', 'red', 'permission'),
  SET_ROLE_POSITION_OVERRIDE: m('Đặt quyền riêng theo vị trí', 'geekblue', 'permission'),
  DELETE_ROLE_POSITION_OVERRIDE: m('Xóa quyền riêng theo vị trí', 'red', 'permission'),
  SET_ROLE_UI_VISIBILITY: m('Đặt ẩn/hiện dữ liệu theo Role', 'purple', 'permission'),
  DELETE_ROLE_UI_VISIBILITY: m('Đặt lại ẩn/hiện dữ liệu (mặc định)', 'orange', 'permission'),

  // ── Phòng ban, Vị trí, Quản lý phụ trách ───────────────────────────────
  CREATE_DEPARTMENT: m('Tạo phòng ban', 'green', 'org'),
  UPDATE_DEPARTMENT: m('Sửa phòng ban', 'blue', 'org'),
  DELETE_DEPARTMENT: m('Xóa phòng ban', 'red', 'org'),
  CREATE_POSITION: m('Tạo vị trí', 'green', 'org'),
  UPDATE_POSITION: m('Sửa vị trí', 'blue', 'org'),
  DELETE_POSITION: m('Xóa vị trí', 'red', 'org'),
  CREATE_ASSIGNMENT_GROUP: m('Tạo Quản lý phụ trách', 'green', 'org'),
  UPDATE_ASSIGNMENT_GROUP: m('Sửa Quản lý phụ trách', 'blue', 'org'),
  DELETE_ASSIGNMENT_GROUP: m('Xóa Quản lý phụ trách', 'red', 'org'),

  // ── Danh mục cấu hình ──────────────────────────────────────────────────
  CREATE_CUSTOMER_STATUS: m('Tạo trạng thái khách hàng', 'green', 'catalog'),
  UPDATE_CUSTOMER_STATUS: m('Sửa trạng thái khách hàng', 'blue', 'catalog'),
  DELETE_CUSTOMER_STATUS: m('Xóa trạng thái khách hàng', 'red', 'catalog'),
  CREATE_LEAVE_TYPE: m('Tạo loại nghỉ phép', 'green', 'catalog'),
  UPDATE_LEAVE_TYPE: m('Sửa loại nghỉ phép', 'blue', 'catalog'),
  DELETE_LEAVE_TYPE: m('Xóa loại nghỉ phép', 'red', 'catalog'),
  CREATE_MEDIA_SOURCE: m('Tạo nguồn khách hàng', 'green', 'catalog'),
  UPDATE_MEDIA_SOURCE: m('Sửa nguồn khách hàng', 'blue', 'catalog'),
  DELETE_MEDIA_SOURCE: m('Xóa nguồn khách hàng', 'red', 'catalog'),
  LOCK_MEDIA_SOURCE: m('Khóa nguồn khách hàng', 'orange', 'catalog'),
  UNLOCK_MEDIA_SOURCE: m('Mở khóa nguồn khách hàng', 'lime', 'catalog'),
  CREATE_PERIODIC_TASK_STATUS: m('Tạo trạng thái công việc định kỳ', 'green', 'catalog'),
  UPDATE_PERIODIC_TASK_STATUS: m('Sửa trạng thái công việc định kỳ', 'blue', 'catalog'),
  DELETE_PERIODIC_TASK_STATUS: m('Xóa trạng thái công việc định kỳ', 'red', 'catalog'),

  // ── Nhóm liên kết ──────────────────────────────────────────────────────
  CREATE_LINK_CATEGORY: m('Tạo category nhóm liên kết', 'green', 'link_group'),
  UPDATE_LINK_CATEGORY: m('Sửa category nhóm liên kết', 'blue', 'link_group'),
  DELETE_LINK_CATEGORY: m('Xóa category nhóm liên kết', 'red', 'link_group'),
  LOCK_LINK_CATEGORY: m('Khóa category nhóm liên kết', 'orange', 'link_group'),
  UNLOCK_LINK_CATEGORY: m('Mở khóa category nhóm liên kết', 'lime', 'link_group'),
  CREATE_LINK_GROUP: m('Tạo nhóm liên kết', 'green', 'link_group'),
  UPDATE_LINK_GROUP: m('Sửa nhóm liên kết', 'blue', 'link_group'),
  DELETE_LINK_GROUP: m('Xóa nhóm liên kết', 'red', 'link_group'),
  ACTIVATE_LINK_GROUP: m('Hiện lại nhóm liên kết', 'lime', 'link_group'),
  DEACTIVATE_LINK_GROUP: m('Ẩn nhóm liên kết', 'orange', 'link_group'),
  ADD_LINK_GROUP_MANAGER: m('Thêm Quản lý phụ của nhóm', 'green', 'link_group'),
  REMOVE_LINK_GROUP_MANAGER: m('Gỡ Quản lý phụ của nhóm', 'orange', 'link_group'),
  ADD_LINK_GROUP_CONTENT_STAFF: m('Thêm Nhân viên Content của nhóm', 'green', 'link_group'),
  REMOVE_LINK_GROUP_CONTENT_STAFF: m('Gỡ Nhân viên Content của nhóm', 'orange', 'link_group'),

  // ── Nghỉ phép ──────────────────────────────────────────────────────────
  CREATE_LEAVE_REQUEST: m('Tạo đơn nghỉ phép', 'green', 'leave'),
  APPROVE_LEAVE_REQUEST: m('Duyệt đơn nghỉ phép', 'success', 'leave'),
  REJECT_LEAVE_REQUEST: m('Từ chối đơn nghỉ phép', 'red', 'leave'),
  CANCEL_LEAVE_REQUEST: m('Hủy đơn nghỉ phép', 'default', 'leave'),

  // ── Lưu trữ & Tải lên ──────────────────────────────────────────────────
  UPDATE_STORAGE_LIMIT: m('Đổi hạn mức dung lượng lưu trữ', 'blue', 'storage'),
  DELETE_STORAGE_MEDIA: m('Xóa file lưu trữ', 'red', 'storage'),
  DELETE_STORAGE_MEDIA_FAILED: m('Xóa file lưu trữ thất bại (đã gỡ tham chiếu)', 'volcano', 'storage'),
  BULK_DELETE_STORAGE_MEDIA: m('Xóa file lưu trữ hàng loạt', 'red', 'storage'),
  UPDATE_UPLOAD_LIMITS: m('Đổi giới hạn tải ảnh', 'blue', 'storage'),

  // ── Chấm công ──────────────────────────────────────────────────────────
  MAP_ZK_DEVICE_USER: m('Gán mã máy chấm công', 'green', 'attendance'),
  UNMAP_ZK_DEVICE_USER: m('Gỡ mã máy chấm công', 'orange', 'attendance'),
  REMATCH_ATTENDANCE_LOGS: m('Khớp lại log chấm công', 'geekblue', 'attendance'),
  SYNC_ATTENDANCE_LOGS: m('Đồng bộ log chấm công', 'geekblue', 'attendance'),
  CLEANUP_ATTENDANCE_LOGS: m('Dọn dẹp log chấm công cũ', 'volcano', 'attendance'),

  // ── Nhật ký hệ thống ───────────────────────────────────────────────────
  UPDATE_AUDIT_SETTINGS: m('Cập nhật cấu hình dọn dẹp nhật ký', 'default', 'audit'),
  ADMIN_CLEANUP_AUDIT_LOGS: m('Admin dọn dẹp nhật ký', 'volcano', 'audit'),
  ADMIN_BULK_DELETE_AUDIT_LOGS: m('Admin xóa nhật ký hàng loạt', 'volcano', 'audit'),
  ADMIN_CLEANUP_TASK_AUDIT_LOGS: m('Admin dọn dẹp nhật ký công việc định kỳ', 'volcano', 'audit'),
  ADMIN_BULK_DELETE_TASK_AUDIT_LOGS: m('Admin xóa nhật ký công việc định kỳ hàng loạt', 'volcano', 'audit'),
};

// ─── Fallback cho action CHƯA có nhãn (BE thêm mới, FE chưa kịp cập nhật) ───
// Tránh lộ nguyên `SOME_NEW_ACTION` ra UI - đoán nhãn theo động từ đầu tiên.
const VERB_FALLBACK: Array<[prefix: string, label: string, color: string]> = [
  ['CREATE_', 'Tạo', 'green'],
  ['UPDATE_', 'Sửa', 'blue'],
  ['DELETE_', 'Xóa', 'red'],
  ['HARD_DELETE_', 'Xóa vĩnh viễn', 'volcano'],
  ['ADD_', 'Thêm', 'green'],
  ['REMOVE_', 'Gỡ', 'orange'],
  ['SET_', 'Đặt', 'geekblue'],
  ['LOCK_', 'Khóa', 'orange'],
  ['UNLOCK_', 'Mở khóa', 'lime'],
  ['APPROVE_', 'Duyệt', 'green'],
  ['REJECT_', 'Từ chối', 'red'],
  ['SYNC_', 'Đồng bộ', 'geekblue'],
  ['IMPORT_', 'Nhập', 'geekblue'],
];

export function getActionMeta(action: string): { label: string; color: string; known: boolean } {
  const meta = ACTION_META[action];
  if (meta) return { label: meta.label, color: meta.color, known: true };

  const upper = action.toUpperCase();
  for (const [prefix, verb, color] of VERB_FALLBACK) {
    if (upper.startsWith(prefix)) {
      const rest = upper.slice(prefix.length).toLowerCase().replace(/_/g, ' ');
      return { label: `${verb} ${rest}`.trim(), color, known: false };
    }
  }
  return { label: action, color: 'default', known: false };
}

// ─── Đối tượng (entityType) ─────────────────────────────────────────────────
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  customer: 'Khách hàng',
  customer_note: 'Ghi chú khách hàng',
  customer_assignment: 'Lượt gán data',
  deposit: 'Phiếu nạp tiền',
  user: 'Nhân viên',
  auth: 'Hệ thống',
  role: 'Role / Phân quyền',
  department: 'Phòng ban',
  position: 'Vị trí',
  assignment_group: 'Quản lý phụ trách',
  customer_status: 'Trạng thái khách hàng',
  leave_type: 'Loại nghỉ phép',
  leave_request: 'Đơn nghỉ phép',
  media_source: 'Nguồn khách hàng',
  link_category: 'Category nhóm liên kết',
  link_group: 'Nhóm liên kết',
  storage_media: 'File lưu trữ',
  attendance_log: 'Log chấm công',
  periodic_task_status: 'Trạng thái công việc định kỳ',
  periodic_task_audit_log: 'Nhật ký công việc định kỳ',
  setting: 'Cấu hình',
  audit_log: 'Nhật ký',
};

export const getEntityTypeLabel = (entityType: string): string => ENTITY_TYPE_LABELS[entityType] || entityType;

// ─── Tóm tắt "Đối tượng" của 1 dòng log (hiển thị ở bảng/card/drawer) ─────
export const STORAGE_BUCKET_LABELS: Record<string, string> = {
  avatars: 'Avatar nhân viên',
  'leave-attachments': 'Ảnh đính kèm nghỉ phép',
  'media-library': 'Thư viện media',
};

export interface EntitySummary {
  typeLabel: string;
  /** Tên dễ đọc của đối tượng (nếu suy ra được từ dữ liệu log). */
  name: string | null;
  /** Dòng phụ (ngữ cảnh thêm) - vd tên nhóm, phạm vi ghi đè. */
  subtitle: string | null;
  /** `#123` - null khi entityId = 0 (đối tượng không có ID số: cấu hình, file, log chấm công...). */
  idLabel: string | null;
}

const NAME_KEYS = ['name', 'groupName', 'title', 'roleCode', 'code', 'fileName', 'email'] as const;

const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

const pickString = (data: unknown, keys: readonly string[]): string | null => {
  if (!isRecord(data)) return null;
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  for (const nested of ['targetUser', 'requester']) {
    const n = data[nested];
    if (isRecord(n) && typeof n.name === 'string' && n.name.trim()) return n.name.trim();
  }
  return null;
};

/** Tên ngắn của file: phần sau dấu `/` cuối cùng của object key. */
const baseName = (key: string): string => key.split('/').pop() || key;

/** Đối tượng "không có ID số" - tên cố định theo action. */
const FIXED_SUBJECT_BY_ACTION: Record<string, string> = {
  UPDATE_STORAGE_LIMIT: 'Hạn mức dung lượng lưu trữ',
  UPDATE_UPLOAD_LIMITS: 'Giới hạn dung lượng/số lượng ảnh tải lên',
  UPDATE_AUDIT_SETTINGS: 'Cấu hình dọn dẹp nhật ký',
  ADMIN_CLEANUP_AUDIT_LOGS: 'Nhật ký hệ thống',
  ADMIN_BULK_DELETE_AUDIT_LOGS: 'Nhật ký hệ thống',
  ADMIN_CLEANUP_TASK_AUDIT_LOGS: 'Nhật ký công việc định kỳ',
  ADMIN_BULK_DELETE_TASK_AUDIT_LOGS: 'Nhật ký công việc định kỳ',
  REMATCH_ATTENDANCE_LOGS: 'Log chấm công chưa khớp nhân viên',
  SYNC_ATTENDANCE_LOGS: 'Máy chấm công',
  CLEANUP_ATTENDANCE_LOGS: 'Log chấm công cũ',
};

export function getEntitySummary(
  log: Pick<AuditLog, 'action' | 'entityType' | 'entityId' | 'oldData' | 'newData'>,
): EntitySummary {
  const { action, entityType, entityId, oldData, newData } = log;
  const typeLabel = getEntityTypeLabel(entityType);
  const idLabel = entityId > 0 ? `#${entityId}` : null;
  const data = isRecord(newData) ? newData : isRecord(oldData) ? oldData : null;
  // Delete 1 chiều: chỉ có oldData. Update: ưu tiên newData, thiếu thì lấy oldData.
  const nameFromData = pickString(newData, NAME_KEYS) ?? pickString(oldData, NAME_KEYS);

  if (action === 'IMPORT_CUSTOMERS') {
    const file = pickString(data, ['fileName']);
    const count = data && typeof data.successCount === 'number' ? ` (${data.successCount} khách)` : '';
    return { typeLabel, name: `Import Excel${file ? `: ${file}` : ''}${count}`, subtitle: null, idLabel };
  }

  if (entityType === 'storage_media') {
    const bucket = pickString(data, ['bucket']);
    const bucketLabel = bucket ? STORAGE_BUCKET_LABELS[bucket] || bucket : null;
    if (action === 'BULK_DELETE_STORAGE_MEDIA') {
      const requested = data && typeof data.requested === 'number' ? `${data.requested} file` : null;
      return { typeLabel, name: [bucketLabel, requested].filter(Boolean).join(' · ') || null, subtitle: null, idLabel };
    }
    const key = pickString(data, ['key']);
    return { typeLabel, name: key ? baseName(key) : null, subtitle: bucketLabel, idLabel };
  }

  if (action === 'SET_CUSTOMER_GROUP_MEMBERSHIP') {
    const groupName = pickString(data, ['groupName']);
    return { typeLabel, name: null, subtitle: groupName ? `Nhóm: ${groupName}` : null, idLabel };
  }

  if (action === 'SET_ROLE_UI_VISIBILITY' || action === 'DELETE_ROLE_UI_VISIBILITY') {
    const role = pickString(data, ['roleCode']);
    const scope =
      data && data.departmentId != null
        ? `Ghi đè theo phòng ban #${data.departmentId}`
        : data && data.positionId != null
          ? `Ghi đè theo vị trí #${data.positionId}`
          : 'Toàn cục';
    return { typeLabel, name: role, subtitle: scope, idLabel };
  }

  const fixed = FIXED_SUBJECT_BY_ACTION[action];
  if (fixed) return { typeLabel, name: fixed, subtitle: null, idLabel };

  return { typeLabel, name: nameFromData, subtitle: null, idLabel };
}

/** Định dạng dung lượng byte -> KB/MB cho payload import/storage. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return String(bytes);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}