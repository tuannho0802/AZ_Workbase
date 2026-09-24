import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskCustomersModal } from './TaskCustomersModal';
import { TaskActionsBar } from './TaskActionsBar';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';

const mockUsePeriodicTask = vi.fn();
vi.mock('@/lib/hooks/usePeriodicTasks', () => ({
  usePeriodicTask: (id: number | null) => mockUsePeriodicTask(id),
}));
vi.mock('@/components/customers/SourceTag', () => ({ SourceTag: ({ source }: { source?: string }) => <span>{source}</span> }));
vi.mock('@/components/customers/StatusTag', () => ({ StatusTag: ({ code }: { code?: string }) => <span>{code}</span> }));

const task = { id: 7, title: 'Task A' } as PeriodicTask;
const makeCustomers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `KH ${i + 1}`,
    phone: `09000000${String(i).padStart(2, '0')}`,
    source: 'Facebook',
    status: 'pending',
    inputDate: '2026-09-01',
    salesUser: { id: 1, name: 'Sales A' },
  }));

describe('TaskCustomersModal', () => {
  beforeEach(() => mockUsePeriodicTask.mockReset());

  it('chỉ fetch khi modal mở', () => {
    mockUsePeriodicTask.mockReturnValue({ data: undefined, isLoading: false });
    render(<TaskCustomersModal open={false} onClose={() => {}} task={task} />);
    expect(mockUsePeriodicTask).toHaveBeenCalledWith(null);
  });

  it('phân trang tối đa 10 dòng/trang', () => {
    mockUsePeriodicTask.mockReturnValue({ data: { linkedCustomers: makeCustomers(23) }, isLoading: false });
    render(<TaskCustomersModal open onClose={() => {}} task={task} />);
    expect(screen.getByText('KH 10')).toBeTruthy();
    expect(screen.queryByText('KH 11')).toBeNull();
    fireEvent.click(screen.getByTitle('2'));
    expect(screen.getByText('KH 11')).toBeTruthy();
    expect(screen.queryByText('KH 1')).toBeNull();
  });

  it('hover ngày nhập -> Tooltip hiện createdAt thực tế', async () => {
    const list = makeCustomers(1).map((c) => ({ ...c, createdAt: '2026-09-08T03:15:00' }));
    mockUsePeriodicTask.mockReturnValue({ data: { linkedCustomers: list }, isLoading: false });
    render(<TaskCustomersModal open onClose={() => {}} task={task} />);
    fireEvent.mouseEnter(screen.getByText('01/09/2026'));
    expect(await screen.findByText(/Ngày nhập thực tế: 03:15 08\/09\/2026/)).toBeTruthy();
  });

  it('linkedCustomers undefined (thiếu customers.view) -> cảnh báo, không có bảng', () => {
    mockUsePeriodicTask.mockReturnValue({ data: { id: 7 }, isLoading: false });
    render(<TaskCustomersModal open onClose={() => {}} task={task} />);
    expect(screen.getByText(/không có quyền xem/i)).toBeTruthy();
  });
});

describe('TaskActionsBar - nút Khách hàng', () => {
  const noop = () => {};
  const base = {
    canEdit: false, canEditLocked: false, canApprove: false, canDelete: false,
    onLink: noop, onChecklist: noop, onAudit: noop, onEdit: noop, onLock: noop, onUnlock: noop, onDelete: noop,
  };

  it('customerCount > 0 -> hiện nút \"Khách hàng (N)\" và gọi onCustomers', () => {
    const onCustomers = vi.fn();
    const t = { id: 1, customerCount: 3 } as PeriodicTask;
    render(<TaskActionsBar {...base} task={t} onCustomers={onCustomers} />);
    fireEvent.click(screen.getByText('Khách hàng (3)'));
    expect(onCustomers).toHaveBeenCalledWith(t);
  });

  it.each([[0], [undefined]])('customerCount = %s -> ẩn nút', (count) => {
    const t = { id: 1, customerCount: count } as PeriodicTask;
    render(<TaskActionsBar {...base} task={t} onCustomers={noop} />);
    expect(screen.queryByText(/Khách hàng/)).toBeNull();
  });
});
