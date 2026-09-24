import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskAssignees } from './TaskAssignees';

const p = { id: 1, name: 'Chính A' };

describe('TaskAssignees', () => {
  it('chỉ có phụ trách chính -> không hiện phần phụ', () => {
    render(<TaskAssignees task={{ primaryAssignee: p, secondaryAssignees: [] }} />);
    expect(screen.getByText(/Chính A/)).toBeTruthy();
    expect(screen.queryByText(/\+/)).toBeNull();
  });

  it('có phụ trách phụ -> hiện tên, quá 2 người gộp "+N"', () => {
    render(
      <TaskAssignees
        task={{
          primaryAssignee: p,
          secondaryAssignees: [
            { id: 2, name: 'B' },
            { id: 3, name: 'C' },
            { id: 4, name: 'D' },
          ],
        }}
      />,
    );
    expect(screen.getByText('+B, C +1')).toBeTruthy();
  });

  it('không có primaryAssignee -> "—"', () => {
    render(<TaskAssignees task={{ primaryAssignee: undefined as unknown as typeof p }} layout="stacked" />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
