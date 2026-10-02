import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const push = vi.fn();
let pathname = '/customers';
let guides: Array<{ slug: string }> = [];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));
vi.mock('@/lib/hooks/useGuides', () => ({
  useGuideList: () => ({ guides, isLoading: false, isError: false }),
}));

import { PageGuideButton } from './PageGuideButton';

describe('PageGuideButton', () => {
  beforeEach(() => {
    push.mockClear();
    pathname = '/customers';
    guides = [];
  });

  it('bài của trang nằm trong mục lục -> hiện nút và bấm sang /huong-dan/<slug>', () => {
    guides = [{ slug: 'khach-hang' }];
    render(<PageGuideButton navKey="customers" />);
    fireEvent.click(screen.getByTestId('page-guide-button'));
    expect(push).toHaveBeenCalledWith('/huong-dan/khach-hang');
  });

  it('bài không có trong mục lục (chưa viết / nháp / không đủ quyền xem) -> không render nút', () => {
    guides = [{ slug: 'chia-data' }];
    render(<PageGuideButton navKey="customers" />);
    expect(screen.queryByTestId('page-guide-button')).toBeNull();
  });

  it('đang đứng ở chính bài đó -> không render nút', () => {
    guides = [{ slug: 'khach-hang' }];
    pathname = '/huong-dan/khach-hang';
    render(<PageGuideButton navKey="customers" />);
    expect(screen.queryByTestId('page-guide-button')).toBeNull();
  });
});
