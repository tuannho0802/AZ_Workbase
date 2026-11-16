import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useIsMobile } from './useIsMobile';
import { VIEWPORTS, resetViewport, setViewport } from '@/test-utils/viewport';

function Probe() {
  return <div data-testid="probe">{useIsMobile() ? 'mobile' : 'desktop'}</div>;
}

describe('useIsMobile', () => {
  afterEach(() => resetViewport());

  it.each([
    [320, 'mobile'],
    [VIEWPORTS.phoneS, 'mobile'],
    [VIEWPORTS.phone, 'mobile'],
    [VIEWPORTS.tablet, 'mobile'],
    [991, 'mobile'],
    [992, 'desktop'],
    [VIEWPORTS.laptop, 'desktop'],
  ])('%ipx -> %s', (width, expected) => {
    setViewport(width);
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe(expected);
  });

  it('đổi viewport khi đang mount -> tự cập nhật (xoay/đổi cỡ cửa sổ)', () => {
    setViewport(VIEWPORTS.laptop);
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('desktop');
    setViewport(VIEWPORTS.phone);
    expect(screen.getByTestId('probe').textContent).toBe('mobile');
    setViewport(VIEWPORTS.laptop);
    expect(screen.getByTestId('probe').textContent).toBe('desktop');
  });

  it('lần render client đầu đã đúng ngay (không nháy desktop rồi mới sang mobile)', () => {
    setViewport(VIEWPORTS.phone);
    const seen: string[] = [];
    function Spy() {
      const m = useIsMobile();
      seen.push(m ? 'mobile' : 'desktop');
      return null;
    }
    render(<Spy />);
    expect(seen[0]).toBe('mobile');
  });

  it('server render luôn desktop (không phụ thuộc window)', () => {
    setViewport(VIEWPORTS.phone);
    expect(renderToString(<Probe />)).toContain('desktop');
  });
});
