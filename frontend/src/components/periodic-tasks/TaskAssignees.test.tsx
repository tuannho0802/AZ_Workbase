import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskAssignees } from './TaskAssignees';

vi.mock('@/lib/hooks/useRoleColorMap', () => ({
  useRoleColorMap: () => ({ getRoleColor: () => '#1677ff' }),
}));

const p = { id: 1, name: 'Chính A' };

describe('TaskAssignees (card)', () => {
  it('không có phụ trách phụ -> chỉ card người chính, KHÔNG có Tag "Phụ trách chính"', () => {
    render(<TaskAssignees task={{ primaryAssignee: p, secondaryAssignees: [] }} />);
    expect(screen.getByText('Chính A')).toBeTruthy();
    expect(screen.queryByText('Phụ trách chính')).toBeNull();
  });

  it('có phụ trách phụ -> hiện Tag "Phụ trách chính" + card từng người phụ, không hiện Vai trò', () => {
    render(
      <TaskAssignees
        task={{ primaryAssignee: p, secondaryAssignees: [{ id: 2, name: 'Phụ B' }, { id: 3, name: 'Phụ C' }] }}
      />,
    );
    expect(screen.getByText('Phụ trách chính')).toBeTruthy();
    expect(screen.getByText('Phụ B')).toBeTruthy();
    expect(screen.getByText('Phụ C')).toBeTruthy();
  });

  it('quá 2 người phụ -> chỉ 2 card, phần còn lại gộp "+N"', () => {
    render(
      <TaskAssignees
        task={{
          primaryAssignee: p,
          secondaryAssignees: [{ id: 2, name: 'B' }, { id: 3, name: 'C' }, { id: 4, name: 'D' }],
        }}
      />,
    );
    expect(screen.queryByText('D')).toBeNull();
    expect(screen.getByText('+1')).toBeTruthy();
  });

  it('không có primaryAssignee -> "—"', () => {
    render(<TaskAssignees task={{ primaryAssignee: undefined as unknown as typeof p }} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0); // Avatar + tên đều là "—"
  });
});

describe('TaskAssignees (text - Tooltip của Lịch)', () => {
  it('chữ thuần "Chính · +Phụ", quá 2 người gộp "+N"', () => {
    render(
      <TaskAssignees
        variant="text"
        task={{
          primaryAssignee: p,
          secondaryAssignees: [{ id: 2, name: 'B' }, { id: 3, name: 'C' }, { id: 4, name: 'D' }],
        }}
      />,
    );
    expect(screen.getByText(/\+B, C \+1/)).toBeTruthy();
  });
});
