import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Grid } from 'antd';
import { VIEWPORTS, evalMediaQuery, resetViewport, setViewport } from './viewport';

function Probe() {
  const screens = Grid.useBreakpoint();
  return <div data-testid="probe">{screens.lg ? 'desktop' : 'mobile'}</div>;
}

describe('evalMediaQuery', () => {
  it('min/max-width và nối bằng and', () => {
    expect(evalMediaQuery('(min-width: 992px)', 1280)).toBe(true);
    expect(evalMediaQuery('(min-width: 992px)', 390)).toBe(false);
    expect(evalMediaQuery('(max-width: 767.98px)', 390)).toBe(true);
    expect(evalMediaQuery('(min-width: 768px) and (max-width: 1279px)', 1000)).toBe(true);
    expect(evalMediaQuery('(min-width: 768px) and (max-width: 1279px)', 1280)).toBe(false);
  });
  it('query lạ -> false (không ném lỗi)', () => {
    expect(evalMediaQuery('(prefers-color-scheme: dark)', 1280)).toBe(false);
  });
});

describe('setViewport + antd Grid.useBreakpoint', () => {
  afterEach(() => resetViewport());

  it.each([
    [VIEWPORTS.phoneS, 'mobile'],
    [VIEWPORTS.phone, 'mobile'],
    [VIEWPORTS.tablet, 'mobile'], // lg = 992px -> tablet dọc vẫn là "mobile" theo quy ước plan
    [VIEWPORTS.laptop, 'desktop'],
  ])('%ipx -> %s', (width, expected) => {
    setViewport(width);
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe(expected);
  });

  it('đổi viewport khi đang mount -> component cập nhật theo', () => {
    setViewport(VIEWPORTS.laptop);
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('desktop');
    setViewport(VIEWPORTS.phone);
    expect(screen.getByTestId('probe').textContent).toBe('mobile');
  });
});
