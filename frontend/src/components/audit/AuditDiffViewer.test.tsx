import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuditDiffViewer } from './AuditDiffViewer';
import { rolesApi } from '@/lib/api/roles.api';

vi.mock('@/lib/api/roles.api', () => ({
  rolesApi: { getAllRoleColors: vi.fn().mockResolvedValue([]) },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const renderViewer = (props: React.ComponentProps<typeof AuditDiffViewer>) =>
  render(<AuditDiffViewer {...props} />, { wrapper });

describe('AuditDiffViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (rolesApi.getAllRoleColors as any).mockResolvedValue([]);
  });

  // ⚠️ Bug đã báo: 4 action REMOVED/UNLINKED chỉ có oldData (không có
  // newData) đáng lẽ phải hiện kiểu "đã xoá: giá trị" (icon xoá đỏ, "Giá trị
  // cũ"), KHÔNG được hiện "Trống -> giá trị" như 1 lượt update.
  it.each([
    ['checklist_item_removed', { content: 'Gọi lại khách' }],
    ['secondary_assignee_removed', { secondaryAssignee: { id: 5, name: 'Nguyễn Văn A' } }],
    ['parent_unlinked', { parentTask: { id: 1, name: 'Task cha' } }],
    ['customer_unlinked', { customer: { id: 2, name: 'Khách hàng B' } }],
  ])('action 1 chiều "%s" (chỉ có oldData) render kiểu xoá, không phải update', (action, oldData) => {
    renderViewer({ action, oldData, newData: undefined });

    // Không được có chữ "Trống" xuất hiện (dấu hiệu bug cũ coi đây là update).
    expect(screen.queryByText('Trống')).not.toBeInTheDocument();
    // Cột tiêu đề phải là "Giá trị cũ" (kiểu delete), không phải "Nội dung thay đổi".
    expect(screen.getByText('Giá trị cũ')).toBeInTheDocument();
  });

  // Đối xứng: action ADDED/LINKED chỉ có newData (không có oldData) phải
  // hiện kiểu "+" (create), không phải "Trống -> giá trị".
  it.each([
    ['checklist_item_added', { content: 'Việc mới' }],
    ['secondary_assignee_added', { secondaryAssignee: { id: 5, name: 'Nguyễn Văn A' } }],
    ['parent_linked', { parentTask: { id: 1, name: 'Task cha' } }],
    ['customer_linked', { customer: { id: 2, name: 'Khách hàng B' } }],
  ])('action 1 chiều "%s" (chỉ có newData) render kiểu thêm, không phải update', (action, newData) => {
    renderViewer({ action, oldData: undefined, newData });

    expect(screen.queryByText('Trống')).not.toBeInTheDocument();
    expect(screen.getByText('Giá trị mới')).toBeInTheDocument();
  });

  // Không regress: DELETE_CUSTOMER (đặt tên rõ ràng, có sẵn "DELETE") vẫn
  // đúng kiểu xoá như trước khi sửa.
  it('DELETE_CUSTOMER vẫn render kiểu xoá như trước (không regress)', () => {
    renderViewer({
      action: 'DELETE_CUSTOMER',
      oldData: { name: 'Khách hàng cũ' },
      newData: null,
    });

    expect(screen.getByText('Giá trị cũ')).toBeInTheDocument();
  });

  // Không regress: UPDATE thật (có cả oldData lẫn newData khác nhau) vẫn
  // hiện đúng kiểu "Nội dung thay đổi", không bị 2 lớp check mới nuốt mất.
  it('UPDATE_CUSTOMER (có cả oldData và newData) vẫn render kiểu thay đổi như trước', () => {
    renderViewer({
      action: 'UPDATE_CUSTOMER',
      oldData: { name: 'Tên cũ' },
      newData: { name: 'Tên mới' },
    });

    expect(screen.getByText('Nội dung thay đổi')).toBeInTheDocument();
    expect(screen.getByText('Tên cũ')).toBeInTheDocument();
    expect(screen.getByText('Tên mới')).toBeInTheDocument();
  });

  // Không regress: CREATE_CUSTOMER (chỉ có newData, tên đã chứa "CREATE")
  // vẫn đúng kiểu "+".
  it('CREATE_CUSTOMER vẫn render kiểu thêm như trước (không regress)', () => {
    renderViewer({
      action: 'CREATE_CUSTOMER',
      oldData: null,
      newData: { name: 'Khách hàng mới' },
    });

    expect(screen.getByText('Giá trị mới')).toBeInTheDocument();
  });

  // ⚠️ Bug đã báo (ảnh chụp màn hình "Tạo ghi chú"): noteType/isImportant
  // phải có nhãn tiếng Việt + giá trị được dịch, customerId/editCount phải
  // bị ẩn hẳn khỏi bảng diff (không có giá trị nghiệp vụ khi xem lại).
  it('CREATE_NOTE dịch noteType/isImportant, ẩn customerId/editCount', () => {
    renderViewer({
      action: 'CREATE_NOTE',
      oldData: null,
      newData: { note: 'Hi marketing', noteType: 'general', editCount: 0, customerId: 53218, isImportant: false },
    });

    expect(screen.getByText('Loại ghi chú')).toBeInTheDocument();
    expect(screen.getByText('Chung')).toBeInTheDocument();
    expect(screen.getByText('Đánh dấu quan trọng')).toBeInTheDocument();
    expect(screen.getByText('Bình thường')).toBeInTheDocument();
    expect(screen.queryByText('customerId')).not.toBeInTheDocument();
    expect(screen.queryByText('editCount')).not.toBeInTheDocument();
    expect(screen.queryByText('53218')).not.toBeInTheDocument();
  });

  // ⚠️ Bug đã báo (ảnh chụp màn hình "Tạo đơn nghỉ phép"): startDate/endDate/
  // leaveType/totalDays phải có nhãn, và `reason` phải dịch thành "Lý do"
  // (không phải "Lý do từ chối" - field này là lý do XIN nghỉ, không phải lý
  // do từ chối đơn).
  it('CREATE_LEAVE_REQUEST có đủ nhãn tiếng Việt, "reason" không bị nhầm thành "Lý do từ chối"', () => {
    renderViewer({
      action: 'CREATE_LEAVE_REQUEST',
      oldData: null,
      newData: {
        leaveType: 'Thai sản',
        startDate: '2026-09-21',
        endDate: '2026-09-21',
        totalDays: 1,
        reason: 'Test audit',
      },
    });

    expect(screen.getByText('Loại phép')).toBeInTheDocument();
    expect(screen.getByText('Từ ngày')).toBeInTheDocument();
    expect(screen.getByText('Đến ngày')).toBeInTheDocument();
    expect(screen.getByText('Số ngày')).toBeInTheDocument();
    expect(screen.getByText('Lý do')).toBeInTheDocument();
    expect(screen.queryByText('Lý do từ chối')).not.toBeInTheDocument();
  });

  // Không regress: REJECT_USER vẫn giữ đúng nhãn "Lý do từ chối" cho field
  // `reason` (khác ngữ cảnh CREATE_LEAVE_REQUEST/UPDATE_ASSIGNMENT ở trên).
  it('REJECT_USER vẫn giữ nhãn "Lý do từ chối" cho field reason (không regress)', () => {
    renderViewer({
      action: 'REJECT_USER',
      oldData: null,
      newData: { reason: 'Không đúng chính sách' },
    });

    expect(screen.getByText('Lý do từ chối')).toBeInTheDocument();
  });

  // ⚠️ Bug đã báo (LeaveRequest.status dùng chung key `status` với Customer -
  // trước đây rơi vào StatusTag sai bảng, hiện Tag xám kèm "pending" thô).
  it('LeaveRequest status dịch đúng bảng LEAVE_STATUS_META, không rơi vào StatusTag của Customer', () => {
    renderViewer({
      action: 'APPROVE_LEAVE_REQUEST',
      oldData: { status: 'pending' },
      newData: { status: 'approved', requester: { id: 1, name: 'Nguyễn Văn A' } },
    });

    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
    expect(screen.getByText('Đã duyệt')).toBeInTheDocument();
    expect(screen.getByText('Người gửi')).toBeInTheDocument();
  });
});