import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { App } from 'antd';

// RangePicker thật rất khó điều khiển trong jsdom -> thay bằng nút đặt khoảng cố định.
vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  const MockRange = (props: Record<string, unknown>) => (
    <button
      data-testid={props['data-testid'] as string}
      onClick={() => (props.onChange as (v: unknown) => void)([dayjs('2026-01-01'), dayjs('2026-01-31')])}
    >
      pick
    </button>
  );
  return { ...actual, DatePicker: { ...actual.DatePicker, RangePicker: MockRange } };
});

import { CleanupRangesModal, CLEANUP_CONFIRM_TEXT, MAX_CLEANUP_RANGES } from './CleanupRangesModal';

const PREVIEW = {
  dryRun: true,
  perRange: [{ from: '2026-01-01', to: '2026-01-31', count: 7 }],
  total: 7,
  partial: false,
  dropped: [],
  includeSecurityEvents: false,
  securityEvents: 2,
};

let run: ReturnType<typeof vi.fn>;
let onDone: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

function renderModal(scope: 'audit' | 'task-audit' = 'audit') {
  return render(
    <App>
      <CleanupRangesModal open onClose={onClose as never} scope={scope} run={run as never} onDone={onDone as never} />
    </App>,
  );
}

const pick = (i = 0) => fireEvent.click(screen.getByTestId(`cleanup-range-${i}`));
const btn = (id: string) => screen.getByTestId(id).closest('button') as HTMLButtonElement;

beforeEach(() => {
  run = vi.fn().mockImplementation(async (_p: unknown, dryRun: boolean) => (dryRun ? PREVIEW : { ...PREVIEW, dryRun: false }));
  onDone = vi.fn();
  onClose = vi.fn();
});

describe('CleanupRangesModal', () => {
  it('thêm/bớt khoảng ngày, tối đa 20', () => {
    renderModal();
    expect(screen.queryByTestId('cleanup-remove-0')).toBeNull(); // chỉ 1 khoảng thì không cho bỏ
    fireEvent.click(screen.getByTestId('cleanup-add-range'));
    expect(screen.getByTestId('cleanup-range-1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('cleanup-remove-1'));
    expect(screen.queryByTestId('cleanup-range-1')).toBeNull();

    for (let i = 1; i < MAX_CLEANUP_RANGES; i++) fireEvent.click(screen.getByTestId('cleanup-add-range'));
    expect(screen.getByTestId(`cleanup-range-${MAX_CLEANUP_RANGES - 1}`)).toBeTruthy();
    expect(btn('cleanup-add-range').disabled).toBe(true);
  });

  it('"Xem trước" khoá cho tới khi mọi khoảng đã chọn đủ', () => {
    renderModal();
    expect(btn('cleanup-preview-btn').disabled).toBe(true);
    pick();
    expect(btn('cleanup-preview-btn').disabled).toBe(false);
    fireEvent.click(screen.getByTestId('cleanup-add-range')); // khoảng mới còn trống
    expect(btn('cleanup-preview-btn').disabled).toBe(true);
  });

  it('nút Xóa khoá cho tới khi đã xem trước VÀ gõ đúng chữ xác nhận', async () => {
    renderModal();
    pick();
    expect(btn('cleanup-delete-btn').disabled).toBe(true); // chưa xem trước

    fireEvent.click(screen.getByTestId('cleanup-preview-btn'));
    await waitFor(() => expect(screen.getByTestId('cleanup-total').textContent).toBe('7'));
    expect(run).toHaveBeenCalledWith({ ranges: [{ from: '2026-01-01', to: '2026-01-31' }], includeSecurityEvents: false }, true);
    expect(btn('cleanup-delete-btn').disabled).toBe(true); // đã xem trước nhưng chưa gõ xác nhận

    const input = screen.getByTestId('cleanup-confirm-input');
    fireEvent.change(input, { target: { value: 'xoa' } });
    expect(btn('cleanup-delete-btn').disabled).toBe(true); // sai chữ
    fireEvent.change(input, { target: { value: CLEANUP_CONFIRM_TEXT } });
    expect(btn('cleanup-delete-btn').disabled).toBe(false);

    fireEvent.click(screen.getByTestId('cleanup-delete-btn'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(run).toHaveBeenLastCalledWith(expect.anything(), false);
    expect(onClose).toHaveBeenCalled();
  });

  it('đổi khoảng ngày sau khi xem trước -> bản xem trước cũ bị huỷ, phải xem trước lại', async () => {
    renderModal();
    pick();
    fireEvent.click(screen.getByTestId('cleanup-preview-btn'));
    await waitFor(() => screen.getByTestId('cleanup-confirm-input'));
    fireEvent.change(screen.getByTestId('cleanup-confirm-input'), { target: { value: CLEANUP_CONFIRM_TEXT } });

    fireEvent.click(screen.getByTestId('cleanup-add-range'));
    expect(screen.queryByTestId('cleanup-confirm-input')).toBeNull();
    expect(btn('cleanup-delete-btn').disabled).toBe(true);
  });

  it('chỉ trang audit mới có checkbox sự kiện bảo mật và gửi includeSecurityEvents', async () => {
    const { unmount } = renderModal('audit');
    expect(screen.getByText(/Bao gồm sự kiện bảo mật/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    pick();
    fireEvent.click(screen.getByTestId('cleanup-preview-btn'));
    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(run.mock.calls[0][0].includeSecurityEvents).toBe(true);
    await waitFor(() => screen.getByText(/sự kiện bảo mật trong các khoảng này/)); // hiện số sự kiện bảo mật
    unmount();

    renderModal('task-audit');
    expect(screen.queryByText(/Bao gồm sự kiện bảo mật/)).toBeNull();
    pick();
    fireEvent.click(screen.getByTestId('cleanup-preview-btn'));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect('includeSecurityEvents' in run.mock.calls[1][0]).toBe(false);
  });

  it('kết quả partial: giữ modal mở và bắt xem trước lại', async () => {
    run.mockImplementation(async (_p: unknown, dryRun: boolean) => (dryRun ? PREVIEW : { ...PREVIEW, dryRun: false, partial: true }));
    renderModal();
    pick();
    fireEvent.click(screen.getByTestId('cleanup-preview-btn'));
    await waitFor(() => screen.getByTestId('cleanup-confirm-input'));
    fireEvent.change(screen.getByTestId('cleanup-confirm-input'), { target: { value: CLEANUP_CONFIRM_TEXT } });
    fireEvent.click(screen.getByTestId('cleanup-delete-btn'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(btn('cleanup-delete-btn').disabled).toBe(true);
  });
});
