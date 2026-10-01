import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException: (e: unknown) => captureException(e) }));

import DashboardError from './error';

describe('(dashboard)/error.tsx (PLAN_HARDENING P5)', () => {
  beforeEach(() => {
    captureException.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('gửi lỗi lên Sentry đúng 1 lần và hiện giao diện lỗi theo vùng', () => {
    const err = Object.assign(new Error('boom'), { digest: 'abc123' });
    render(<DashboardError error={err} reset={vi.fn()} />);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(err);
    expect(screen.getByText('Trang này gặp sự cố')).toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it('nút "Thử lại" gọi reset()', () => {
    const reset = vi.fn();
    render(<DashboardError error={new Error('x')} reset={reset} />);
    fireEvent.click(screen.getByText('Thử lại'));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
