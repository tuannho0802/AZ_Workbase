import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    permissions: [{ key: 'customers.assign', resource: 'customers', action: 'assign', description: 'Chia data' }],
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
      requiredPermission: null,
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('bai-moi'));
  });
});
