import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { REPORT_DEMOS } from './reports.demos';

const demo = (id: string) => REPORT_DEMOS.find((d) => d.id === id)!;

describe('mẫu Báo cáo doanh số: đăng ký + render', () => {
    it('3 mẫu có trong GUIDE_DEMOS', () => {
        expect(REPORT_DEMOS.map((d) => d.id)).toEqual(['report-revenue-by-viewer', 'report-metric-dates', 'report-period-explainer']);
        for (const d of REPORT_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
    });

    it('phạm vi: admin 3 dòng + nhãn toàn hệ thống; manager 2 dòng; own 1 dòng, nhãn "của bạn"', () => {
        const a = render(<>{demo('report-revenue-by-viewer').render({ viewer: 'admin' })}</>);
        expect(a.container.querySelectorAll('.ant-table-row')).toHaveLength(3);
        expect(screen.getByText('Tổng doanh thu toàn hệ thống')).toBeTruthy();
        a.unmount();
        const m = render(<>{demo('report-revenue-by-viewer').render({ viewer: 'manager' })}</>);
        expect(m.container.querySelectorAll('.ant-table-row')).toHaveLength(2);
        expect(screen.getByText('Tổng doanh thu của bạn')).toBeTruthy();
        m.unmount();
        const o = render(<>{demo('report-revenue-by-viewer').render({ viewer: 'own' })}</>);
        expect(o.container.querySelectorAll('.ant-table-row')).toHaveLength(1);
    });

    it('FTD + nạp lại = doanh thu ở mọi dòng mẫu (số liệu nhất quán)', () => {
        const { container } = render(<>{demo('report-revenue-by-viewer').render({ viewer: 'admin' })}</>);
        // 4.500+8.000=12.500 ; 3.000+5.200=8.200 ; 2.000+4.000=6.000
        const text = container.textContent ?? '';
        for (const v of ['$12,500', '$8,200', '$6,000', '$26,700']) expect(text).toContain(v);
    });

    it('period-explainer: 3 giá trị đều render, tuần bắt đầu Thứ Hai', () => {
        for (const p of ['week', 'month', 'quarter']) {
            const r = render(<>{demo('report-period-explainer').render({ period: p })}</>);
            expect(r.container.textContent).toContain('Đang xem');
            if (p === 'week') expect(r.container.textContent).toContain('Thứ Hai 05/10/2026');
            r.unmount();
        }
    });
});