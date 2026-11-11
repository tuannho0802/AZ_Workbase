import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CadenceBadge } from './CadenceBadge';
import { CADENCE_META } from '@/lib/utils/fanpageCadence';
import type { FanpageCadence, FanpageCadenceState } from '@/lib/api/fanpages.api';

const base = (state: FanpageCadenceState): FanpageCadence => ({
    state,
    daysSinceLastPost: 2,
    weekCount: 3,
    target: 5,
    streak: 1,
    postedToday: false,
});

describe('CadenceBadge', () => {
    it.each(['paused', 'new', 'silent', 'at_risk', 'ok'] as const)('trạng thái %s hiện icon + chữ (không chỉ màu)', (state) => {
        const { container, unmount } = render(<CadenceBadge cadence={base(state)} />);
        expect(screen.getByText(CADENCE_META[state].label)).toBeTruthy();
        expect(container.textContent).toContain(CADENCE_META[state].icon);
        unmount();
    });

    it('detail=true hiện thêm tiến độ tuần và số ngày kể từ bài gần nhất', () => {
        const { container } = render(<CadenceBadge cadence={base('at_risk')} detail />);
        expect(container.textContent).toContain('3/5');
        expect(container.textContent).toContain('2 ngày trước');
    });
});
