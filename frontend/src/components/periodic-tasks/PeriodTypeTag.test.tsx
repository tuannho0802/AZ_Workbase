import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeriodTypeTag, PERIOD_TYPE_COLORS } from './PeriodTypeTag';

describe('PeriodTypeTag', () => {
  it('mỗi Loại kỳ có nhãn tiếng Việt + class màu riêng', () => {
    const cases = [['daily', 'Ngày'], ['weekly', 'Tuần'], ['monthly', 'Tháng'], ['yearly', 'Năm']] as const;
    for (const [type, label] of cases) {
      const { unmount } = render(<PeriodTypeTag type={type} />);
      const el = screen.getByText(label);
      expect(el.className).toContain(`ant-tag-${PERIOD_TYPE_COLORS[type]}`);
      unmount();
    }
  });

  it('4 màu đôi một khác nhau', () => {
    expect(new Set(Object.values(PERIOD_TYPE_COLORS)).size).toBe(4);
  });
});
