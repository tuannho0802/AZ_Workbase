'use client';

import React from 'react';
import { Table, Tag, Typography, Space, Empty, Alert } from 'antd';
import { ArrowRightOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { StatusTag } from '@/components/customers/StatusTag';
import { useRoleColors } from '@/lib/hooks/useRoleColorMap';

/**
 * ⚠️ FIX BUG THẬT (báo lỗi trực tiếp: audit log hiện "Ngày nhập:
 * 2026-09-11T00:00:00.000Z" thay vì ngày đọc được) - các field kiểu Date/
 * ISO string này KHÔNG có object quan hệ (`{id,name}`) để rơi vào nhánh
 * generic phía dưới, cũng không phải string thường (rơi thẳng xuống
 * `String(val)` ở cuối `formatValue()`, in ra y hệt ISO string thô của
 * `JSON.stringify` khi BE trả `Date` object). Liệt kê tường minh các field
 * ngày tháng dùng chung giữa Customer/Deposit (Công việc định kỳ dùng
 * `periodStartDate`/`periodEndDate` dạng string 'YYYY-MM-DD' thuần, không
 * cần parse lại - dayjs vẫn parse đúng nên gộp chung danh sách cho gọn).
 */
const DATE_FIELD_KEYS = new Set([
  'closedDate',
  'inputDate',
  'assignedDate',
  'depositDate',
  'periodStartDate',
  'periodEndDate',
]);

const { Text } = Typography;

/**
 * ⚠️ FIX BUG THẬT (rà soát audit log toàn hệ thống - dòng "Sửa lượt gán
 * data"/"Thu hồi lượt gán data" hiện raw "active"/"reclaimed" tiếng Anh
 * không màu): field `status` bị DÙNG CHUNG tên key cho 2 miền dữ liệu khác
 * nhau - `Customer.status` (mã trạng thái khách hàng, cấu hình qua
 * /quan-ly-status-khach, tra bằng `StatusTag`) và `CustomerAssignment.status`
 * (enum cố định `active/transferred/reclaimed` ở customer-assignment.entity.ts,
 * KHÔNG liên quan gì tới bảng customer_statuses). `formatValue()` trước đây
 * cứ thấy key `status` là gọi thẳng `StatusTag`, tra không thấy khớp (2 bảng
 * mã khác nhau) nên hiện Tag xám kèm nguyên văn tiếng Anh.
 *
 * Mirror ĐÚNG bảng màu/nhãn đã dùng ở `CustomerAssignmentsTab.STATUS_TAG` để
 * đồng nhất giao diện giữa tab "Lượt gán" và trang "Nhật ký hoạt động".
 * Phân biệt 2 miền dữ liệu bằng `action` (luôn có sẵn ở audit log gán data:
 * `UPDATE_ASSIGNMENT`/`RECLAIM_ASSIGNMENT`), KHÔNG đoán theo giá trị (dữ liệu
 * khách hàng tương lai thừa sức trùng chữ 'active').
 */
const ASSIGNMENT_STATUS_META: Record<string, { color: string; label: string }> = {
  active: { color: 'green', label: 'Đang hoạt động' },
  transferred: { color: 'blue', label: 'Đã chuyển giao' },
  reclaimed: { color: 'default', label: 'Đã thu hồi' },
};
const ASSIGNMENT_ACTIONS = ['UPDATE_ASSIGNMENT', 'RECLAIM_ASSIGNMENT'];

/**
 * ⚠️ FIX BUG THẬT + BẢO MẬT (báo lỗi trực tiếp kèm ảnh chụp màn hình: dòng
 * audit "currentPassword: Trống -> Admin@123" hiện NGUYÊN VĂN mật khẩu dạng
 * chữ thường ra UI cho bất kỳ ai xem được Nhật ký hoạt động).
 *
 * Trước đây `FIELD_LABELS` còn gán nhãn "Mật khẩu" cho key `password` - tức
 * là NẾU field này lọt vào `oldData`/`newData` (dù do code cũ trước khi các
 * `buildXxxAuditSnapshot()` được áp dụng, hay do 1 code path tương lai lỡ
 * quên lọc), UI sẽ chủ động hiển thị ĐẸP ĐẼ, RÕ RÀNG giá trị đó ra ngoài -
 * phản tác dụng hoàn toàn so với mục tiêu "an toàn".
 *
 * Chặn ở ĐÂY (lớp hiển thị cuối cùng, không phụ thuộc BE có sạch hay không -
 * defense in depth): danh sách các key nhạy cảm tuyệt đối KHÔNG được hiển thị
 * giá trị, bất kể nằm trong bản ghi audit CŨ hay MỚI. Khớp không phân biệt
 * hoa/thường và loại bỏ dấu gạch dưới để bắt được biến thể như
 * `current_password`/`newPassword`/`NEW_PASSWORD`.
 *
 * Cố ý dùng "chứa chuỗi con" (KHÔNG dùng regex neo `^...$` cứng nhắc): 1 lần
 * thử trước đó dùng `^(current|new|old|confirm)?_?(password)$` đã BỎ SÓT
 * `confirmNewPassword` (ghép 2 tiền tố "confirm" + "new" cùng lúc, không
 * khớp neo đầu-cuối) - "chứa chuỗi con `password`" đơn giản hơn NHIỀU và bắt
 * được MỌI biến thể đặt tên field có chữ "password", đổi lại có thể chặn
 * nhầm 1 vài field vô hại tên trùng (chưa gặp trong dự án) - CHẤP NHẬN ĐƯỢC,
 * vì rủi ro lộ mật khẩu nghiêm trọng hơn nhiều so với rủi ro ẩn nhầm 1 field
 * không nhạy cảm.
 */
const SENSITIVE_SUBSTRINGS = ['password', 'pwd', 'token', 'secret'];

const isSensitiveKey = (key: string): boolean => {
  const normalized = key.replace(/[_-]/g, '').toLowerCase();
  return SENSITIVE_SUBSTRINGS.some((s) => normalized.includes(s));
};

interface AuditDiffViewerProps {
  oldData: any;
  newData: any;
  action: string;
  /**
   * Phase 7 (`AZ-Workbase Skills/PLAN_PERIODIC_TASKS_MODULE.md` mục 2.6):
   * bổ sung nhãn tiếng Việt cho field của module khác (vd "Công việc định
   * kỳ") mà KHÔNG cần sửa `FIELD_LABELS` gốc (vốn chỉ dành cho Customer/User/
   * Deposit) - merge đè lên `FIELD_LABELS`, field trùng key sẽ ưu tiên giá
   * trị truyền vào đây. Optional, mặc định không đổi hành vi cũ.
   */
  extraFieldLabels?: Record<string, string>;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Họ và tên',
  phone: 'Số điện thoại',
  email: 'Email',
  status: 'Trạng thái',
  source: 'Nguồn',
  note: 'Ghi chú',
  broker: 'Môi giới',
  campaign: 'Chiến dịch',
  salesUserId: 'Nhân viên sales',
  sales_user_id: 'Nhân viên sales',
  salesUser: 'Nhân viên sales',
  marketingUserId: 'Nhân viên marketing',
  marketingUser: 'Nhân viên marketing',
  departmentId: 'Phòng ban',
  department_id: 'Phòng ban',
  department: 'Phòng ban',
  amount: 'Số tiền nạp',
  type: 'Loại tiền',
  brokerId: 'ID Môi giới',
  role: 'Quyền hạn',
  isActive: 'Trạng thái hoạt động',
  closedDate: 'Ngày chốt',
  inputDate: 'Ngày nhập',
  assignedDate: 'Ngày phân bổ',
  depositDate: 'Ngày nạp',
  // ⚠️ FIX BUG THẬT (đợt rà soát toàn bộ audit log - `CustomersService.
  // buildAssignmentAuditSnapshot()`, cùng lớp bug `positionId`): trước đây
  // "Sửa lượt gán data" (`UPDATE_ASSIGNMENT`) log raw `assignedToId`/
  // `previousAssigneeId`, chưa từng có nhãn - rơi vào fallback hiển thị
  // thẳng tên cột kỹ thuật.
  assignedTo: 'Sales nhận data',
  assignedToId: 'Sales nhận data',
  previousAssignee: 'Sales trước đó',
  previousAssigneeId: 'Sales trước đó',
  // Field riêng của module "Công việc định kỳ" (Phase 7) - `secondaryAssignee`/
  // `parentTask` không đưa qua `extraFieldLabels` (TaskAuditLogsModal) vì
  // cũng hiển thị lại ở trang `/audit-logs` chung (không phải chỉ riêng
  // modal của Task) - khai thẳng ở đây để cả 2 nơi đều có nhãn đúng.
  secondaryAssignee: 'Phụ trách phụ',
  // ⚠️ FIX BUG THẬT (ảnh chụp màn hình: "assignedTolds: Trống -> 1 mục") -
  // nhãn cho các bản ghi audit CŨ (trước khi `CustomersService.bulkAssign()`
  // đổi sang log field `assignedTo` dạng `{id,name}[]`) vẫn còn dùng khoá số
  // nhiều `assignedToIds` (mảng ID thô). Không thể phục hồi TÊN cho dữ liệu
  // cũ này (BE lúc ghi log đã không lưu tên), nhưng ít nhất gắn đúng nhãn cột
  // và hiển thị rõ đây là ID (xem nhánh mảng số thô trong `formatValue()`).
  assignedToIds: 'Sales nhận data',
  customer: 'Khách hàng',
  customers: 'Danh sách khách hàng',
  parentTask: 'Công việc cha',
  // ⚠️ FIX BUG THẬT (báo lỗi trực tiếp: audit log tài khoản hiện raw
  // "positionId: Trống -> 3" - field chưa từng có nhãn, rơi vào fallback
  // hiển thị thẳng tên cột kỹ thuật). Đi kèm fix ở
  // `UsersService.buildUserAuditSnapshot()` (BE giờ trả `{id,name}` sạch cho
  // các field quan hệ thay vì FK thô) - nhãn dưới đây phủ CẢ 2 dạng key
  // (có/không hậu tố `Id`) để cả dòng audit CŨ (chỉ có ID thô) lẫn dòng MỚI
  // (đã có object `{id,name}`, tự vào nhánh generic "object có `name`" phía
  // dưới) đều hiển thị đúng nhãn cột.
  employeeCode: 'Mã nhân viên',
  positionId: 'Vị trí',
  position: 'Vị trí',
  leaveApproverId: 'Người duyệt nghỉ phép (ngoại lệ)',
  leaveApprover: 'Người duyệt nghỉ phép (ngoại lệ)',
  isRootAdmin: 'Root Admin',
  approvalStatus: 'Trạng thái duyệt',
  zkDeviceUserId: 'Mã máy chấm công',
  reason: 'Lý do từ chối',
  // ⚠️ FIX BUG THẬT (ảnh chụp màn hình: dòng audit CŨ hiện raw "updatedBy"/
  // "createdBy" làm nhãn cột "Trường thông tin" - trước giờ 2 key này chỉ bị
  // loại khỏi SNAPSHOT MỚI (xem JSDoc `buildAuditSnapshot` phía BE), nhưng
  // các bản ghi audit CŨ ghi trước khi fix đó tồn tại vẫn còn nguyên 2 key
  // này trong `oldData`/`newData` - `ignoreKeys` dưới không loại chúng (chỉ
  // loại `updatedById`/`createdById`), nên vẫn hiển thị, chỉ thiếu nhãn.
  updatedBy: 'Người sửa cuối',
  createdBy: 'Người tạo',
  // ⚠️ FIX BUG THẬT (rà soát audit log toàn hệ thống - báo lỗi trực tiếp
  // "targetUser: ... " hiện raw tên cột kỹ thuật): 4 hành động
  // RESET_PASSWORD/CHANGE_OWN_PASSWORD/SOFT_DELETE_USER/RESTORE_USER ở
  // `users.service.ts` đều log field `targetUser` (object `{id,name}`, đã
  // đúng CHUẨN từ trước) nhưng key này chưa từng được thêm vào đây - giá trị
  // hiển thị đúng (nhánh object có `.name`), chỉ riêng NHÃN CỘT bị thiếu.
  targetUser: 'Tài khoản liên quan',
  // Checklist item (Công việc định kỳ, PeriodicTaskChecklistItemsService) -
  // `itemId` (số) dùng cho CHECKLIST_ITEM_UPDATED/REMOVED, `itemIds` (mảng
  // số, thứ tự sau khi kéo-thả) dùng cho CHECKLIST_ITEMS_REORDERED - trước
  // đây rơi vào fallback hiển thị thẳng tên cột kỹ thuật.
  itemId: 'Mục checklist',
  itemIds: 'Thứ tự các mục checklist',
  // Department (DepartmentsService) - field riêng của DELETE_DEPARTMENT
  // (mirror lớp fix `positionId`/`assignedToIds` ở trên: trước đây spread
  // thẳng raw entity + object tự chế, không field nào có nhãn) và
  // UPDATE_DEPARTMENT (field `managers`, MỚI thêm audit log - trước đây
  // module Phòng ban hoàn toàn không log CREATE/UPDATE).
  color: 'Màu',
  managers: 'Người quản lý phòng ban',
  movedUsersCount: 'Số nhân viên đã di dời',
  movedUsersTo: 'Di dời nhân viên sang phòng ban',
  affectedCustomersCount: 'Số khách hàng bị ảnh hưởng (không di dời)',
  // RESTORE_CUSTOMER (`{ restored: true }`) - trước đây không có nhãn lẫn
  // cách hiển thị giá trị boolean riêng, rơi vào `String(val)` → "true" trần
  // trụi (xem thêm nhánh `key === 'restored'` ở `formatValue()`).
  restored: 'Khôi phục khách hàng',
};

/**
 * ⚠️ FIX BUG THẬT (Department dùng chung key `name`/`description` với
 * Customer/User - `FIELD_LABELS.name` ở trên gán "Họ và tên", đúng ngữ cảnh
 * Customer/User nhưng SAI hoàn toàn cho Phòng ban). Áp nhãn ĐÈ lên
 * `FIELD_LABELS` khi action đang xử lý thuộc về Department - tra theo
 * substring của `action` (`CREATE_DEPARTMENT`/`UPDATE_DEPARTMENT`/
 * `DELETE_DEPARTMENT` đều chứa "DEPARTMENT") thay vì thêm 1 prop mới vào
 * component (tránh phải sửa MỌI nơi đang gọi `<AuditDiffViewer>`).
 */
const CONTEXTUAL_FIELD_LABELS: Array<{ actionIncludes: string; labels: Record<string, string> }> = [
  {
    actionIncludes: 'DEPARTMENT',
    labels: { name: 'Tên phòng ban', description: 'Mô tả phòng ban' },
  },
];

/**
 * ⚠️ FIX BUG THẬT (ảnh chụp màn hình: MỘT dòng audit "Cập nhật" hiện
 * "Trạng thái" HAI LẦN - 1 dòng "Chưa hoàn thành → Trạng thái", 1 dòng "→ 2"
 * trơn). Nguyên nhân: đây là bản ghi audit CŨ ghi THẲNG raw entity (trước khi
 * `buildAuditSnapshot()`/`buildXxxAuditSnapshot()` chuẩn hoá), nên
 * `oldData`/`newData` chứa CẢ 2 key cho cùng 1 field quan hệ: FK số thô
 * (`statusId`) VÀ object quan hệ đã resolve (`status`) - 2 key khác nhau
 * nhưng cùng trỏ nhãn "Trạng thái" (`FIELD_LABELS`/
 * `PERIODIC_TASK_FIELD_LABELS`), nên render thành 2 dòng riêng biệt cho
 * NGƯỜI DÙNG mà thực ra chỉ là 1 field bị log 2 lần.
 *
 * Dùng CHUNG 1 danh sách cho CẢ 2 việc: (1) dedupe ở `getRelevantKeys()` -
 * bỏ FK thô nếu object resolve của ĐÚNG field đó cũng có mặt; (2) đánh dấu
 * "đây là ID quan hệ" ở `formatValue()` khi CHỈ có FK thô trơn (không có
 * object đi kèm - dữ liệu cũ thật sự chỉ lưu ID, hiển thị "ID: X" thay vì số
 * trần trụi vô nghĩa, ví dụ ảnh chụp "Vị trí: Trống → 5"). Tránh 2 danh sách
 * lệch nhau theo thời gian.
 *
 * Chỉ liệt kê các cặp ĐÃ XÁC NHẬN thật sự là "FK thô + object resolve của
 * chính field đó" (khớp các field quan hệ có mặt ở `FIELD_LABELS`/
 * `PERIODIC_TASK_FIELD_LABELS` phía trên) - CỐ Ý không suy luận tự động theo
 * kiểu "mọi key kết thúc bằng Id" vì có field trùng tên vô hại (`brokerId`
 * là ID môi giới rời rạc, KHÔNG liên quan gì đến field `broker` - chuỗi tên
 * broker của Deposit, ghép nhầm sẽ mất dữ liệu hiển thị đúng của 1 trong 2
 * field không liên quan).
 */
const ID_OBJECT_KEY_PAIRS: Array<[string, string]> = [
  ['statusId', 'status'],
  ['salesUserId', 'salesUser'],
  ['marketingUserId', 'marketingUser'],
  ['departmentId', 'department'],
  ['assignedToId', 'assignedTo'],
  ['previousAssigneeId', 'previousAssignee'],
  ['primaryAssigneeId', 'primaryAssignee'],
  ['positionId', 'position'],
  ['leaveApproverId', 'leaveApprover'],
];
const RELATION_ID_KEYS = new Set(ID_OBJECT_KEY_PAIRS.map(([idKey]) => idKey));

export const AuditDiffViewer: React.FC<AuditDiffViewerProps> = ({
  oldData,
  newData,
  action,
  extraFieldLabels,
}) => {
  // Case-insensitive: audit chung dùng action UPPER_SNAKE ('CREATE_CUSTOMER'),
  // Phase 7 (Công việc định kỳ) dùng lower_snake ('created') - so khớp không
  // phân biệt hoa/thường để cả 2 hệ action đều nhận đúng nhãn cột icon.
  const actionUpper = action.toUpperCase();

  // ⚠️ FIX BUG THẬT (báo lỗi trực tiếp: audit của `CHECKLIST_ITEM_REMOVED`/
  // `SECONDARY_ASSIGNEE_REMOVED`/`PARENT_UNLINKED`/`CUSTOMER_UNLINKED` vẽ
  // sai kiểu "Trống → giá trị" như đang UPDATE, dù đây là hành động 1 CHIỀU
  // (chỉ có `oldData`, không có `newData` - xem `logActionAsync()` ở
  // `PeriodicTaskAuditService`/các Service gọi nó). Nguyên nhân gốc: tên 4
  // action này không chứa chữ "DELETE" nên `isDelete` cũ (chỉ so tên) luôn
  // nhận `false`.
  //
  // Sửa bằng 2 lớp, không chỉ 1:
  //   (1) Name-based: mở rộng danh sách từ khoá cho isDelete/isCreate, khớp
  //       ĐÚNG các action 1 chiều hiện có trong hệ thống (REMOVED/UNLINKED =
  //       xoá 1 chiều; ADDED/LINKED (trừ UNLINKED) = thêm 1 chiều, mirror
  //       "ADDED" ở `CHECKLIST_ITEM_ADDED`/`CUSTOMER_LINKED`/`PARENT_LINKED`/
  //       `SECONDARY_ASSIGNEE_ADDED` - các action NÀY cũng bị lỗi y hệt theo
  //       chiều ngược lại, không nằm trong action đã báo nhưng cùng gốc rễ).
  //   (2) Shape-based (lưới an toàn cho action tương lai KHÔNG khớp bất kỳ từ
  //       khoá nào ở trên - vd lỡ đặt tên `X_DETACHED`/`X_CLEARED`): nếu
  //       `oldData` có dữ liệu mà `newData` rỗng/không có → chắc chắn là
  //       hành động xoá 1 chiều, không quan trọng tên action là gì; ngược lại
  //       cho hành động thêm 1 chiều. Đặt SAU name-based để name-based ưu
  //       tiên khi rõ ràng, shape-based chỉ bắt phần còn sót.
  const hasOldData = !!oldData && typeof oldData === 'object' && Object.keys(oldData).length > 0;
  const hasNewData = !!newData && typeof newData === 'object' && Object.keys(newData).length > 0;

  const isDelete =
    actionUpper.includes('DELETE') ||
    actionUpper.includes('REMOVED') ||
    actionUpper.includes('UNLINKED') ||
    (hasOldData && !hasNewData);

  const isCreate =
    !isDelete &&
    (actionUpper.includes('CREATE') ||
      actionUpper.includes('ADDED') ||
      (actionUpper.includes('LINKED') && !actionUpper.includes('UNLINKED')) ||
      (hasNewData && !hasOldData));

  const isUpdate = !isCreate && !isDelete && (actionUpper.includes('UPDATE') || (oldData && newData));
  const isAssignmentAction = ASSIGNMENT_ACTIONS.some((a) => actionUpper.includes(a));
  const contextLabels = CONTEXTUAL_FIELD_LABELS.find((c) => actionUpper.includes(c.actionIncludes))?.labels;
  const fieldLabels = { ...FIELD_LABELS, ...(contextLabels || {}), ...(extraFieldLabels || {}) };

  // ⚠️ FIX BUG THẬT (rà soát audit log toàn hệ thống - CREATE_USER/
  // UPDATE_USER/APPROVE_USER hiện raw slug "admin"/"employee" không dịch,
  // không màu, trong khi MỌI nơi khác hiển thị Role trong app - dropdown
  // chọn Sales, badge ở CustomerInfoTab... - đều dùng `useRoleColorMap()` để
  // tra đúng màu + tên đã cấu hình ở /phan-quyen). Dùng `useRoleColors()`
  // trực tiếp (không cần `roles.view`, an toàn cho MỌI role đang xem trang
  // audit log) để tự dựng map code -> {name, color}.
  const { roleColors } = useRoleColors();
  const roleInfoMap = React.useMemo(
    () => new Map(roleColors.map((r) => [r.code, { name: r.name, color: r.color }])),
    [roleColors],
  );

  // Helper to format values
  const formatValue = (val: any, key: string) => {
    // ⚠️ BẢO MẬT (xem JSDoc `isSensitiveKey()` phía trên) - chặn NGAY từ đầu,
    // trước bất kỳ nhánh format nào khác, để không có đường nào lọt qua dù
    // giá trị là string/number/object gì đi nữa.
    if (isSensitiveKey(key)) {
      return <Text type="secondary" italic>Đã ẩn (thông tin nhạy cảm)</Text>;
    }

    if (val === null || val === undefined || val === '') return <Text type="secondary" italic>Trống</Text>;

    if (DATE_FIELD_KEYS.has(key) && (typeof val === 'string' || val instanceof Date)) {
      const parsed = dayjs(val);
      return <Text>{parsed.isValid() ? parsed.format('DD/MM/YYYY') : String(val)}</Text>;
    }

    if (key === 'status' && isAssignmentAction && typeof val === 'string') {
      // ⚠️ FIX BUG THẬT (xem JSDoc `ASSIGNMENT_STATUS_META` phía trên) - PHẢI
      // đứng TRƯỚC nhánh `key === 'status'` chung (dành cho Customer/Công
      // việc định kỳ) để chặn đúng lúc `val` còn là string enum thô, tránh
      // rơi xuống `StatusTag` (tra sai bảng customer_statuses).
      const meta = ASSIGNMENT_STATUS_META[val];
      return meta ? <Tag color={meta.color}>{meta.label}</Tag> : <Text>{val}</Text>;
    }

    if (key === 'status') {
      // ⚠️ FIX BUG THẬT (báo lỗi "Objects are not valid as a React child"
      // khi mở diff của Công việc định kỳ): field `status` có 2 DẠNG khác
      // nhau tuỳ module, generic diff viewer này không biết trước:
      //   - Customer: `status` là STRING code, đồng bộ /quan-ly-status-khach
      //     (migration CreateCustomerStatuses1781400000000) → dùng StatusTag
      //     (tự fetch màu/tên từ `/customer-statuses`).
      //   - Công việc định kỳ: `status` là OBJECT nguyên vẹn từ quan hệ
      //     `PeriodicTaskStatus` (id/code/name/color/...), KHÔNG phải string
      //     - trước đây code cũ luôn coi `val` là string rồi truyền thẳng
      //     vào `StatusTag({ code })`, StatusTag không tìm thấy trong map
      //     (key tra cứu là string, `val` lại là cả object) nên fallback
      //     render RAW OBJECT ra JSX → React crash. Tự nhận diện dạng object
      //     và đọc thẳng `.name`/`.color` có sẵn (không cần gọi API status
      //     nào khác - object đã đủ thông tin để hiển thị).
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        // ⚠️ FIX BUG THẬT (ảnh chụp màn hình: dòng "Trạng thái" hiện
        // "Chưa hoàn thành → Trạng thái" - literal fallback cũ trùng chữ với
        // NHÃN cột "Trường thông tin" ở bên trái, khiến người xem tưởng nhầm
        // là lỗi hiển thị/label bị lặp lại làm giá trị. Khi object status
        // thật sự thiếu cả `name` và `code` (dữ liệu cũ/không đầy đủ), dùng
        // đúng pattern "Dữ liệu cũ - ID" đã thống nhất ở nhánh object chung
        // phía dưới (`named.id`) thay vì 1 câu tự bịa riêng cho field này.
        const statusObj = val as { id?: number | string; name?: string; code?: string; color?: string };
        if (statusObj.name || statusObj.code) {
          return <Tag color={statusObj.color}>{statusObj.name ?? statusObj.code}</Tag>;
        }
        if (statusObj.id !== undefined) {
          return <Text type="secondary">Dữ liệu cũ - ID: {statusObj.id} (không có tên do log tại thời điểm đó)</Text>;
        }
        return <Text type="secondary">Không xác định (dữ liệu audit cũ, không đọc được)</Text>;
      }
      return <StatusTag code={val} />;
    }

    if (key === 'isActive') {
      return val ? <Tag color="success">Hoạt động</Tag> : <Tag color="error">Khóa</Tag>;
    }

    if (key === 'role' && typeof val === 'string') {
      // ⚠️ FIX BUG THẬT (xem JSDoc `roleInfoMap` phía trên) - trước đây
      // không có nhánh riêng, rơi thẳng xuống `String(val)` cuối hàm, hiện
      // nguyên slug tiếng Anh "admin"/"employee" không dịch, không màu.
      const info = roleInfoMap.get(val);
      return <Tag color={info?.color}>{info?.name ?? val.toUpperCase()}</Tag>;
    }

    if (key === 'color' && typeof val === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(val)) {
      return (
        <Space size={4}>
          <span
            style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: val, border: '1px solid #d9d9d9' }}
          />
          <Text>{val}</Text>
        </Space>
      );
    }

    if (key === 'restored') {
      // ⚠️ FIX BUG THẬT (RESTORE_CUSTOMER log `{ restored: true }`) - trước
      // đây không có nhánh riêng, `true` rơi xuống `String(val)` hiện chữ
      // "true" trần trụi không có nghĩa với người dùng cuối.
      return val ? <Tag color="success">Đã khôi phục</Tag> : <Tag color="default">Không</Tag>;
    }

    if (key === 'isRootAdmin') {
      return val ? <Tag color="gold">Có</Tag> : <Tag>Không</Tag>;
    }

    if (key === 'approvalStatus' && typeof val === 'string') {
      const approvalConfig: Record<string, { color: string; text: string }> = {
        pending: { color: 'warning', text: 'Chờ duyệt' },
        approved: { color: 'success', text: 'Đã duyệt' },
        rejected: { color: 'error', text: 'Từ chối' },
      };
      const cfg = approvalConfig[val] || { color: 'default', text: val };
      return <Tag color={cfg.color}>{cfg.text}</Tag>;
    }

    if (key === 'amount') {
      return <Text strong style={{ color: '#52c41a' }}>+${Number(val).toLocaleString()}</Text>;
    }

    if (key === 'deposits' && Array.isArray(val)) {
      return <Text type="secondary">{val.length} giao dịch nạp tiền</Text>;
    }

    // ⚠️ CẢI TIẾN (báo lỗi thật: "Dữ liệu phức hợp" cho MỌI field object, kể
    // cả khi BE đã dựng snapshot SẠCH dạng `{ id, name }`/`{ id, code, name,
    // color }` - mirror `PeriodicTasksService.buildAuditSnapshot()` và
    // `CustomersService.buildCustomerAuditSnapshot()`, cả 2 đều trả object có
    // sẵn `name` cho field quan hệ (status/primaryAssignee/department/
    // salesUser/marketingUser...) - trước đây generic diff viewer này không
    // biết đọc field nào ngoài `status`/`isActive`/`amount`/`deposits` (hard-
    // code cứng theo tên field), nên MỌI object khác đều rơi vào nhánh cuối
    // "Dữ liệu phức hợp", vô nghĩa với end-user. Xử lý TỔNG QUÁT: bất kỳ
    // object nào có field `name` (string) đều coi là "1 thực thể có tên" -
    // hiển thị `name`, kèm `Tag color` nếu có sẵn `color` (đồng bộ cách
    // `status` object đã hiển thị ở nhánh riêng phía trên).
    if (Array.isArray(val)) {
      if (val.length === 0) return <Text type="secondary" italic>Trống</Text>;
      if (val.every((item) => item && typeof item === 'object' && typeof item.name === 'string')) {
        return (
          <Space size={4} wrap>
            {val.map((item, idx) =>
              item.color ? (
                <Tag key={item.id ?? idx} color={item.color}>{item.name}</Tag>
              ) : (
                <Tag key={item.id ?? idx}>{item.name}</Tag>
              ),
            )}
          </Space>
        );
      }
      // ⚠️ FIX BUG THẬT (ảnh chụp màn hình: "Trống -> 1 mục" - dữ liệu audit
      // CŨ chỉ log mảng ID số thô, không có tên kèm theo). "N mục" không trả
      // lời được câu hỏi "cụ thể ID nào" mà người dùng cần khi tra soát. Vì
      // KHÔNG có tên để tra cứu (dữ liệu tại thời điểm ghi log đã không lưu),
      // hiển thị THẲNG các ID thay vì che giấu sau con số đếm - trung thực
      // hơn dù chưa lý tưởng bằng tên đầy đủ.
      if (val.every((item) => typeof item === 'number' || typeof item === 'string')) {
        return <Text>ID: {val.join(', ')}</Text>;
      }
      return <Text type="secondary">{val.length} mục (dữ liệu cũ, không đọc được chi tiết)</Text>;
    }

    if (typeof val === 'object' && val !== null) {
      const named = val as { id?: unknown; name?: unknown; color?: string; code?: string };
      if (typeof named.name === 'string') {
        return named.color ? <Tag color={named.color}>{named.name}</Tag> : <Text>{named.name}</Text>;
      }
      if (typeof named.code === 'string') {
        return <Text>{named.code}</Text>;
      }
      // ⚠️ FIX BUG THẬT (ảnh chụp màn hình: "updatedBy: Admin -> Dữ liệu phức
      // hợp" - nhãn cũ không nói lên điều gì, người dùng không hiểu và không
      // cần "dữ liệu phức hợp" nghĩa là gì). Đây LUÔN là dữ liệu audit CŨ ghi
      // trước khi các `buildXxxAuditSnapshot()` (Customer/User/PeriodicTask)
      // chuẩn hoá field quan hệ về dạng `{id,name}` - tại thời điểm ghi log,
      // BE đã không lưu tên nên FE không có cách nào phục hồi lại tên đó.
      // Trung thực nhất là: còn ID thì hiển thị thẳng ID (`#12`) thay vì mơ
      // hồ hoá bằng 1 câu chung chung; hết cách thì mới báo "không xác định".
      if (typeof named.id === 'number' || typeof named.id === 'string') {
        return <Text type="secondary">Dữ liệu cũ - ID: {named.id} (không có tên do log tại thời điểm đó)</Text>;
      }
      return <Text type="secondary">Không xác định (dữ liệu audit cũ, không đọc được)</Text>;
    }

    // ⚠️ FIX BUG THẬT (báo lỗi trực tiếp kèm ảnh chụp màn hình: dòng "Vị trí:
    // Trống → 5" - người xem không biết "5" nghĩa là gì, phải tự đoán hay
    // vào tra thủ công). Đây là dữ liệu audit CŨ ghi thẳng FK số thô
    // (`positionId`) mà KHÔNG kèm object quan hệ đã resolve (`position`) -
    // cùng lớp nguyên nhân với nhánh "Dữ liệu cũ - ID" phía trên (dữ liệu ghi
    // trước khi `buildXxxAuditSnapshot()` chuẩn hoá), chỉ khác là rơi xuống
    // TỚI ĐÂY vì giá trị là number/string thô ngay từ đầu, không phải object
    // `{id}`. Cùng nguyên tắc: không phục hồi được TÊN, nhưng ít nhất gắn rõ
    // đây là ID, không hiển thị 1 số trần trụi vô nghĩa. CHỈ áp dụng cho các
    // field ĐÃ XÁC NHẬN là FK quan hệ (khớp danh sách `ID_OBJECT_KEY_PAIRS`
    // dùng để dedupe ở `getRelevantKeys()` bên dưới, dùng chung 1 nguồn để
    // tránh 2 danh sách lệch nhau) - field số khác (`amount`, `id`...) không
    // bị ảnh hưởng.
    if ((typeof val === 'number' || typeof val === 'string') && RELATION_ID_KEYS.has(key)) {
      return <Text type="secondary">ID: {val} (dữ liệu cũ, chưa có tên)</Text>;
    }

    return String(val);
  };

  // Extract and filter keys
  const getRelevantKeys = () => {
    const keys = new Set([
      ...Object.keys(oldData || {}),
      ...Object.keys(newData || {})
    ]);

    const ignoreKeys = [
      'id', 'createdAt', 'updatedAt', 'deletedAt', 'userId',
      'updatedById', 'createdById', 'updatedBy_OLD', 'createdBy_OLD',
      'hashedRefreshToken', 'user', 'targetCustomer'
    ];

    // Bỏ key FK thô nếu object resolve của ĐÚNG field đó cũng có mặt trong
    // cùng bản ghi (ưu tiên hiển thị bản object đọc được, tránh lặp dòng -
    // xem JSDoc `ID_OBJECT_KEY_PAIRS`). Nếu chỉ có FK thô (không có object đi
    // kèm - dữ liệu cũ thật sự chỉ lưu ID), vẫn giữ nguyên hành vi: hiển thị
    // "ID: X" như trước (xem nhánh `RELATION_ID_KEYS` ở `formatValue()`).
    for (const [idKey, objectKey] of ID_OBJECT_KEY_PAIRS) {
      if (keys.has(idKey) && keys.has(objectKey)) {
        keys.delete(idKey);
      }
    }

    // ⚠️ BẢO MẬT (xem JSDoc `isSensitiveKey()`): loại bỏ HẲN các key nhạy cảm
    // khỏi bảng diff luôn, không chỉ che giá trị - end-user không cần biết
    // (và không nên biết) 1 dòng "currentPassword: Đã ẩn" tồn tại, đây thuần
    // tuý là nhiễu với họ (đúng góp ý: "End-user chẳng hiểu và chẳng cần").
    // `formatValue()` vẫn giữ chặn giá trị làm lớp phòng thủ thứ 2 phòng khi
    // có key nhạy cảm nào đó không khớp pattern lọt qua tới đây.
    return Array.from(keys).filter(k => !ignoreKeys.includes(k) && !isSensitiveKey(k));
  };

  const keys = getRelevantKeys();
  const diffs = keys.map(key => {
    const oldVal = oldData?.[key];
    const newVal = newData?.[key];

    // Skip if same
    if (JSON.stringify(oldVal) === JSON.stringify(newVal) && isUpdate) return null;

    return {
      key,
      label: fieldLabels[key] || key,
      old: oldVal,
      new: newVal,
    };
  }).filter(Boolean);

  if (diffs.length === 0) {
    if (action === 'USER_LOGIN') return <Alert title="Đăng nhập thành công" type="info" showIcon />;
    return <Empty description="Dữ liệu chính không thay đổi (có thể chỉ cập nhật quan hệ ẩn)" />;
  }

  const columns = [
    {
      title: 'Trường thông tin',
      dataIndex: 'label',
      key: 'label',
      width: '35%',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: isCreate ? 'Giá trị mới' : isDelete ? 'Giá trị cũ' : 'Nội dung thay đổi',
      key: 'change',
      render: (_: any, record: any) => {
        if (isCreate) {
          return <Space><PlusOutlined style={{ color: '#52c41a' }} /> {formatValue(record.new, record.key)}</Space>;
        }
        if (isDelete) {
          return <Space><DeleteOutlined style={{ color: '#f5222d' }} /> {formatValue(record.old, record.key)}</Space>;
        }

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ color: '#8c8c8c', textDecoration: 'line-through', fontSize: '12px' }}>
              {formatValue(record.old, record.key)}
            </span>
            <ArrowRightOutlined style={{ color: '#bfbfbf', fontSize: '10px' }} />
            <Text strong style={{ background: '#f6ffed', padding: '1px 4px', borderRadius: '4px', border: '1px solid #b7eb8f' }}>
              {formatValue(record.new, record.key)}
            </Text>
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ marginTop: 8 }}>
      <Table
        dataSource={diffs as any}
        columns={columns}
        pagination={false}
        size="small"
        bordered
        rowKey="key"
        className="audit-diff-table"
      />
    </div>
  );
};