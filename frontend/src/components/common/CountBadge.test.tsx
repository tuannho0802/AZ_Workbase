import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CountBadge } from './CountBadge';
import { getNavBadgeProps } from '@/lib/nav-badge';
import { TASK_IN_PROGRESS_COUNT_KEY } from '@/lib/hooks/useSidebarBadgeCounts';

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe('CountBadge', () => {
  it('count 0/undefined và không có extra -> chỉ render children, không có badge', () => {
    const { container } = render(<CountBadge count={0}>Nhãn</CountBadge>);
    expect(container.querySelector('.ant-badge-count')).toBeNull();
    expect(screen.getByText('Nhãn')).toBeTruthy();
  });

  it('chỉ chấm đỏ To-Do có số -> 1 badge', () => {
    const { container } = render(
      <CountBadge {...getNavBadgeProps('cong-viec-dinh-ky', { 'cong-viec-dinh-ky': 3 })}>Việc</CountBadge>,
    );
    expect(container.querySelectorAll('.ant-badge-count')).toHaveLength(1);
  });

  it('cả 2 chấm: đỏ To-Do + vàng Đang làm, đúng số và đúng màu vàng', () => {
    const { container } = render(
      <CountBadge
        {...getNavBadgeProps('cong-viec-dinh-ky', {
          'cong-viec-dinh-ky': 3,
          [TASK_IN_PROGRESS_COUNT_KEY]: 5,
        })}
      >
        Việc
      </CountBadge>,
    );
    const dots = container.querySelectorAll('.ant-badge-count');
    expect(dots).toHaveLength(2);
    expect(dots[0].textContent).toBe('3');
    expect(dots[1].textContent).toBe('5');
    // chấm vàng: nền #faad14 (jsdom chuẩn hoá về rgb)
    expect((dots[1] as HTMLElement).style.backgroundColor).toMatch(/250,\s*173,\s*20|#faad14/i);
  });

  it('To-Do = 0 nhưng Đang làm > 0 -> chỉ hiện chấm vàng', () => {
    const { container } = render(
      <CountBadge
        {...getNavBadgeProps('cong-viec-dinh-ky', {
          'cong-viec-dinh-ky': 0,
          [TASK_IN_PROGRESS_COUNT_KEY]: 2,
        })}
      >
        Việc
      </CountBadge>,
    );
    const dots = container.querySelectorAll('.ant-badge-count');
    expect(dots).toHaveLength(1);
    expect(dots[0].textContent).toBe('2');
  });

  it('rê chuột vào chấm vàng -> tooltip giải thích đang đếm gì', async () => {
    const { container } = render(
      <CountBadge
        {...getNavBadgeProps('cong-viec-dinh-ky', {
          'cong-viec-dinh-ky': 3,
          [TASK_IN_PROGRESS_COUNT_KEY]: 5,
        })}
      >
        Việc
      </CountBadge>,
    );
    const items = container.querySelectorAll('.az-count-badge-item');
    fireEvent.mouseEnter(items[1]);
    await waitFor(() => expect(screen.getByText('Việc của tôi đang làm (in progress)')).toBeTruthy());
  });

  it('mục nav khác không bị ảnh hưởng: chỉ { count }', () => {
    expect(getNavBadgeProps('duyet-phep', { 'duyet-phep': 4 })).toEqual({ count: 4 });
  });
});
