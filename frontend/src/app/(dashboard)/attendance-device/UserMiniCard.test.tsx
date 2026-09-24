import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserMiniCard } from './UserMiniCard';

const base = {
  getRoleColor: () => '#1677ff',
  getRoleName: (c?: string) => c ?? '',
};

describe('UserMiniCard - tên dài không được làm card cao lên', () => {
  const longName = 'NGUYỄN THỊ HOÀNG YẾN NHI PHƯƠNG TRÂM ANH';

  it('tên luôn 1 dòng (nowrap + ellipsis) và có title để hover xem đủ tên', () => {
    render(<UserMiniCard name={longName} role="employee" hideRoleTag {...base} />);
    // `strong` của antd Typography bọc chữ trong <strong> - lấy span Typography ngoài cùng.
    const nameEl = screen.getByText(longName).closest('.ant-typography') as HTMLElement;
    expect(nameEl.getAttribute('title')).toBe(longName);
    expect(nameEl.style.whiteSpace).toBe('nowrap');
    expect(nameEl.style.overflow).toBe('hidden');
    expect(nameEl.style.textOverflow).toBe('ellipsis');
  });

  it('card không tràn ô chứa (maxWidth 100%) và Avatar + tên nằm chung 1 nhóm không xuống dòng', () => {
    const { container } = render(<UserMiniCard name={longName} hideRoleTag {...base} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.style.maxWidth).toBe('100%');
    expect(card.style.minWidth).toBe('0px');
    const nameEl = screen.getByText(longName).closest('.ant-typography') as HTMLElement;
    // Tên và Avatar cùng 1 wrapper con (nhóm không wrap), Tag nằm ngoài wrapper này.
    expect(nameEl.parentElement?.style.display).toBe('inline-flex');
    expect(nameEl.parentElement?.querySelector('.ant-avatar')).not.toBeNull();
  });

  it('vẫn hiện Tag Vai trò/Phòng ban/Vị trí khi không ẩn', () => {
    render(
      <UserMiniCard name="An" role="admin" departmentName="Kinh doanh" positionName="Trưởng nhóm" {...base} />,
    );
    expect(screen.getByText('admin')).toBeTruthy();
    expect(screen.getByText('Kinh doanh')).toBeTruthy();
    expect(screen.getByText('Trưởng nhóm')).toBeTruthy();
  });
});
