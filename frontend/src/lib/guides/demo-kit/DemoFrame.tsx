'use client';

import type { ReactNode } from 'react';

/**
 * Khung bao mọi mẫu minh hoạ. `children` nằm trong vùng `inert` (không bấm/focus được) để người đọc không
 * tưởng nhầm là thao tác thật; `controls` nằm NGOÀI vùng inert (vd bộ chọn "Xem với tư cách") nên bấm được.
 */
export function DemoFrame({ title, children, controls }: { title: string; children: ReactNode; controls?: ReactNode }) {
    return (
        <figure
            data-testid="guide-demo"
            style={{ margin: '16px 0', border: '1px dashed #91caff', borderRadius: 8, background: '#f0f7ff', overflow: 'hidden' }}
        >
            <figcaption style={{ padding: '6px 12px', fontSize: 12, color: '#1677ff', borderBottom: '1px dashed #91caff' }}>
                Minh hoạ: {title} (chỉ xem, không thao tác được)
            </figcaption>
            {controls ? (
                <div data-testid="guide-demo-controls" style={{ padding: '8px 12px', background: '#fff', borderBottom: '1px dashed #d6e4ff', overflowX: 'auto' }}>
                    {controls}
                </div>
            ) : null}
            <div inert style={{ padding: 12, overflowX: 'auto', background: '#fff' }}>
                {children}
            </div>
        </figure>
    );
}
