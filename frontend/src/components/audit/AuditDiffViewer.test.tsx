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
});
