import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import { GuideEditorModal } from './GuideEditorModal';

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();

vi.mock('@/lib/hooks/useGuides', () => ({
  useGuideManageDetail: () => ({ data: undefined, isLoading: false }),
  useGuideRoleOptions: () => ({ roles: [{ id: 1, code: 'admin', name: 'Admin', color: '#f00' }], isLoading: false }),
  useGuidePositionOptions: () => ({
    positions: [{ id: 7, code: 'media', name: 'Media', color: '#0f0' }],
    isLoading: false,
  }),
  useGuideDepartmentOptions: () => ({
    departments: [{ id: 5, name: 'Kinh doanh', color: '#00f' }],
    isLoading: false,
  }),
  useGuidePermissionOptions: () => ({
    permissions: [
      { key: 'customers.assign', resource: 'customers', action: 'assign', description: 'Chia data' },
      { key: 'customers.edit', resource: 'customers', action: 'edit', description: 'Sửa khách hàng' },
      { key: 'roles.view', resource: 'roles', action: 'view', description: 'Xem phân quyền' },
    ],
    isLoading: false,
  }),
  useCreateGuide: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateGuide: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));

describe('GuideEditorModal (role / vị trí / phòng ban)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMutateAsync.mockResolvedValue({ slug: 'bai-moi' });
  });

  it('có đủ 3 ô chọn phạm vi xem và giải thích quy tắc AND', async () => {
    render(
      <App>
        <GuideEditorModal open onClose={vi.fn()} guideId={null} onSaved={vi.fn()} />
      </App>,
    );
    expect(await screen.findByText('Role được xem')).toBeInTheDocument();
    expect(screen.getByText('Vị trí được xem')).toBeInTheDocument();
    expect(screen.getByText('Phòng ban được xem')).toBeInTheDocument();
    expect(screen.getByText(/TẤT CẢ mục đã chọn/)).toBeInTheDocument();
    expect(screen.getByText('Cần quyền để xem')).toBeInTheDocument();
    expect(screen.getByText('Role loại trừ')).toBeInTheDocument();
    expect(screen.getByText('Vị trí loại trừ')).toBeInTheDocument();
    expect(screen.getByText('Phòng ban loại trừ')).toBeInTheDocument();
  });

  it('tạo mới không chọn gì -> gửi roleIds/positionIds/departmentIds đều rỗng (không giới hạn)', async () => {
    const onSaved = vi.fn();
    render(
      <App>
        <GuideEditorModal open onClose={vi.fn()} guideId={null} onSaved={onSaved} />
      </App>,
    );
    await userEvent.type(await screen.findByPlaceholderText('Cách thêm khách hàng mới'), 'Bài mới');
    await userEvent.type(screen.getByPlaceholderText(/Nội dung Markdown/), 'Xin chào');
    await userEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({
      title: 'Bài mới',
      content: 'Xin chào',
      roleIds: [],
      positionIds: [],
      departmentIds: [],
      excludedRoleIds: [],
      excludedPositionIds: [],
      excludedDepartmentIds: [],
      requiredPermissions: [],
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('bai-moi'));
  });
});

describe('GuideEditorModal - chọn nhiều quyền theo nhóm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMutateAsync.mockResolvedValue({ slug: 'bai-moi' });
  });

  it('chọn 2 quyền từ nhóm "Khách hàng" -> gửi mảng requiredPermissions', async () => {
    render(
      <App>
        <GuideEditorModal open onClose={vi.fn()} guideId={null} onSaved={vi.fn()} />
      </App>,
    );
    await userEvent.type(await screen.findByPlaceholderText('Cách thêm khách hàng mới'), 'Bài quyền');
    await userEvent.type(screen.getByPlaceholderText(/Nội dung Markdown/), 'Nội dung');

    // Placeholder có pointer-events: none -> mở dropdown qua ô combobox của đúng Select quyền.
    const permissionSelect = screen.getByText('Không yêu cầu quyền').closest('.ant-select') as HTMLElement;
    await userEvent.click(within(permissionSelect).getByRole('combobox'));
    // Tiêu đề nhóm hiện trong dropdown, giống drawer Phân quyền.
    expect(await screen.findByText('Khách hàng')).toBeInTheDocument();
    // antd render thêm bản ẩn (a11y) của mỗi option -> chỉ bấm bản nằm trong danh sách hiển thị.
    const visibleOption = (key: string) =>
      screen.getAllByText(key).find((el) => el.closest('.ant-select-item-option-content')) as HTMLElement;
    await userEvent.click(visibleOption('customers.assign'));
    await userEvent.click(visibleOption('customers.edit'));

    await userEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0][0].requiredPermissions).toEqual(['customers.assign', 'customers.edit']);
  });
});

describe('GuideEditorModal - loại trừ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMutateAsync.mockResolvedValue({ slug: 'bai-moi' });
  });

  const openSelect = async (placeholder: string) => {
    const select = screen.getByText(placeholder).closest('.ant-select') as HTMLElement;
    await userEvent.click(within(select).getByRole('combobox'));
  };
  const visibleOption = (name: string) =>
    screen.getAllByText(name).find((el) => el.closest('.ant-select-item-option-content')) as HTMLElement;

  it('loại trừ vị trí Media -> gửi excludedPositionIds=[7], positionIds rỗng (mọi người trừ Media)', async () => {
    render(
      <App>
        <GuideEditorModal open onClose={vi.fn()} guideId={null} onSaved={vi.fn()} />
      </App>,
    );
    await userEvent.type(await screen.findByPlaceholderText('Cách thêm khách hàng mới'), 'Khách hàng');
    await userEvent.type(screen.getByPlaceholderText(/Nội dung Markdown/), 'Nội dung');
    await openSelect('Không loại trừ vị trí nào');
    await userEvent.click(visibleOption('Media'));
    await userEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({ positionIds: [], excludedPositionIds: [7] });
  });

  it('mục đã chọn ở "Vị trí được xem" bị khoá (disabled) trong ô "Vị trí loại trừ"', async () => {
    render(
      <App>
        <GuideEditorModal open onClose={vi.fn()} guideId={null} onSaved={vi.fn()} />
      </App>,
    );
    await screen.findByText('Vị trí loại trừ');
    await openSelect('Mọi vị trí');
    await userEvent.click(visibleOption('Media'));
    await userEvent.keyboard('{Escape}');
    await openSelect('Không loại trừ vị trí nào');
    // Chỉ ô loại trừ có mục bị khoá (ô "được xem" không có partner nào được chọn) -> đúng 1 option disabled là Media.
    const disabled = document.querySelectorAll('.ant-select-item-option-disabled');
    expect(disabled).toHaveLength(1);
    expect(disabled[0]).toHaveTextContent('Media');
  });
});
