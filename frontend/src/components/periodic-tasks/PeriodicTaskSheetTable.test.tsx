import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { PeriodicTaskSheetTable } from './PeriodicTaskSheetTable';

vi.mock('./TaskActionsBar', () => ({ TaskActionsBar: ({ task }: { task: PeriodicTask }) => <span data-testid={`act-${task.id}`} /> }));

const mk = (id: number, aid: number, name: string, extra: Partial<PeriodicTask> = {}) =>
    ({
        id,
        title: `Việc ${id}`,
        description: null,
        note: null,
        color: null,
        isLocked: false,
        overdueMarkedAt: null,
        periodStartDate: '2026-11-26',
        periodEndDate: '2099-11-26',
        primaryAssigneeId: aid,
        primaryAssignee: { id: aid, name },
        status: { id: 1, code: 'doing', name: 'Đang làm', color: '#52c41a', isDoneState: false },
        productLink: null,
        ...extra,
    }) as unknown as PeriodicTask;

const noop = () => {};
const props = { canEdit: true, canEditLocked: true, canApprove: true, canDelete: true, onLink: noop, onChecklist: noop, onAudit: noop, onEdit: noop, onLock: noop, onUnlock: noop, onDelete: noop, isUnlocking: () => false };

describe('PeriodicTaskSheetTable', () => {
    it('gộp ô TÊN theo người, hiện tiến độ, link từ productLink và nút thao tác từng dòng', () => {
        const { container } = render(
            <PeriodicTaskSheetTable
                {...props}
                tasks={[mk(1, 1, 'Lư Ngọc'), mk(2, 1, 'Lư Ngọc', { productLink: 'https://drive.google.com/x/TAP_13.mp4', note: 'ghi chú A' }), mk(3, 2, 'Yến Thư')]}
            />,
        );
        expect(container.querySelectorAll('td[rowspan="2"]')).toHaveLength(1); // Lư Ngọc 2 dòng gộp
        expect(screen.getByText('LƯ NGỌC')).toBeInTheDocument();
        expect(screen.getByText('YẾN THƯ')).toBeInTheDocument();
        expect(screen.getAllByText('Đang làm')).toHaveLength(3);
        expect(screen.getByRole('link', { name: 'TAP_13.mp4' })).toHaveAttribute('href', 'https://drive.google.com/x/TAP_13.mp4');
        expect(screen.getByText('ghi chú A')).toBeInTheDocument();
        expect([1, 2, 3].every((i) => screen.getByTestId(`act-${i}`))).toBe(true);
        expect(screen.getAllByText('26/11/2026')).toHaveLength(3);
    });
    it('productLink: không có -> không hiện link; link không hợp lệ (javascript:) -> không render href', () => {
        render(<PeriodicTaskSheetTable {...props} tasks={[mk(1, 1, 'A'), mk(2, 1, 'A', { productLink: 'javascript:alert(1)' })]} />);
        expect(screen.queryAllByRole('link')).toHaveLength(0);
    });
    it('Task đã xong -> tình trạng "Đã xong"', () => {
        render(<PeriodicTaskSheetTable {...props} tasks={[mk(1, 1, 'A', { status: { id: 9, code: 'done', name: 'Hoàn thành', color: '#0050b3', isDoneState: true } as PeriodicTask['status'] })]} />);
        expect(screen.getByText('Đã xong')).toBeInTheDocument();
    });
});
