import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuideAudienceTags } from './GuideAudienceTags';

describe('GuideAudienceTags', () => {
  it('cả 3 chiều trống -> "Mọi người"', () => {
    render(<GuideAudienceTags roles={[]} positions={[]} departments={[]} />);
    expect(screen.getByText('Mọi người')).toBeInTheDocument();
  });

  it('hiện tag cho role / vị trí / phòng ban, đúng màu cấu hình', () => {
    const { container } = render(
      <GuideAudienceTags
        roles={[{ id: 1, name: 'Admin', color: '#ff0000' }]}
        positions={[{ id: 7, name: 'Media', color: '#00ff00' }]}
        departments={[{ id: 5, name: 'Kinh doanh', color: '#0000ff' }]}
      />,
    );
    expect(screen.queryByText('Mọi người')).toBeNull();
    for (const [kind, name, color] of [
      ['role', 'Admin', '#ff0000'],
      ['position', 'Media', '#00ff00'],
      ['department', 'Kinh doanh', '#0000ff'],
    ] as const) {
      const tag = screen.getByTestId(`audience-${kind}`);
      expect(tag).toHaveTextContent(name);
      expect(tag.getAttribute('style') ?? '').toMatch(new RegExp(`background(-color)?:\\s*(${color}|rgb)`, 'i'));
    }
    expect(container.querySelectorAll('[data-testid^="audience-"]')).toHaveLength(3);
  });

  it('chỉ có 1 chiều (vd chỉ vị trí) -> không hiện "Mọi người"', () => {
    render(<GuideAudienceTags roles={[]} positions={[{ id: 7, name: 'Media', color: '#00ff00' }]} departments={[]} />);
    expect(screen.queryByText('Mọi người')).toBeNull();
    expect(screen.getByTestId('audience-position')).toBeInTheDocument();
  });

  it('chỉ có yêu cầu quyền -> không hiện "Mọi người", hiện tag quyền', () => {
    render(<GuideAudienceTags roles={[]} positions={[]} departments={[]} requiredPermission="customers.assign" />);
    expect(screen.queryByText('Mọi người')).toBeNull();
    expect(screen.getByTestId('audience-permission')).toHaveTextContent('customers.assign');
  });

  it('không yêu cầu quyền (null) -> không có tag quyền', () => {
    render(<GuideAudienceTags roles={[]} positions={[{ id: 7, name: 'Media', color: '#00ff00' }]} departments={[]} requiredPermission={null} />);
    expect(screen.queryByTestId('audience-permission')).toBeNull();
  });
});
