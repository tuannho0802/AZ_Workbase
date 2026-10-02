'use client';

import type { ReactNode } from 'react';

/**
 * Khung bao mọi mẫu minh hoạ. Vùng mẫu TƯƠNG TÁC ĐƯỢC để xem (cuộn ngang/dọc, rê chuột ra tooltip, tick ô chọn,
 * mở xác nhận...) nhưng KHÔNG có tác dụng thật: mẫu chỉ dùng dữ liệu giả, không có handler gọi API; thêm lưới an
 * toàn chặn điều hướng của link và submit form để không rời trang/tải lại khi bấm thử.
 * (Trước đây dùng `inert` -> chặn luôn cả kéo thanh cuộn ngang và tooltip, nên bỏ.)
 * `controls` nằm NGOÀI vùng mẫu (vd bộ chọn "Xem với tư cách").
 */
export function DemoFrame({ title, children, controls }: { title: string; children: ReactNode; controls?: ReactNode }) {
    return (
        <figure
            data-testid="guide-demo"
            style={{ margin: '16px 0', border: '1px dashed #91caff', borderRadius: 8, background: '#f0f7ff', overflow: 'hidden' }}
        >
            <figcaption style={{ padding: '6px 12px', fontSize: 12, color: '#1677ff', borderBottom: '1px dashed #91caff' }}>
                Minh hoạ: {title} (dữ liệu giả: cuộn, rê chuột để xem; không lưu gì)
            </figcaption>
            {controls ? (
                <div data-testid="guide-demo-controls" style={{ padding: '8px 12px', background: '#fff', borderBottom: '1px dashed #d6e4ff', overflowX: 'auto' }}>
                    {controls}
                </div>
            ) : null}
            <div
                data-testid="guide-demo-body"
                onClickCapture={(e) => {
                    if ((e.target as HTMLElement).closest('a[href]')) e.preventDefault();
                }}
                onSubmitCapture={(e) => e.preventDefault()}
                style={{ padding: 12, overflowX: 'auto', background: '#fff' }}
            >
                {children}
            </div>
        </figure>
    );
}
