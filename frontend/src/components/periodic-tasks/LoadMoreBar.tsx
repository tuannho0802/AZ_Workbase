'use client';

import React, { useEffect, useRef } from 'react';
import { Button, Typography } from 'antd';

interface LoadMoreBarProps {
    /** Số Task đã tải / tổng số khớp bộ lọc (khoảng ngày đang chọn). */
    loaded: number;
    total: number;
    hasMore: boolean;
    /** Đang tải TRANG TIẾP (không phải lần tải đầu / đổi bộ lọc). */
    loadingMore: boolean;
    onLoadMore: () => void;
    /** Tự tải khi thanh này cuộn vào màn hình (Agenda/Kanban). Lịch tháng để tắt - chỉ bấm tay. */
    auto?: boolean;
}

/**
 * Thanh "Đang hiển thị X/Y - Tải thêm" cho 3 view tải dần. Tự tải trang kế bằng IntersectionObserver; observer được
 * dựng lại sau mỗi lần số dòng đổi nên nếu thanh vẫn còn nằm trong màn hình (trang ít dòng) sẽ tiếp tục tải đến khi
 * lấp đầy hoặc hết dữ liệu - không treo.
 */
export function LoadMoreBar({ loaded, total, hasMore, loadingMore, onLoadMore, auto = true }: LoadMoreBarProps) {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!auto || !hasMore || loadingMore) return;
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) onLoadMore();
            },
            { rootMargin: '200px' },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [auto, hasMore, loadingMore, loaded, onLoadMore]);

    if (total <= 0) return null;
    return (
        <div ref={ref} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '12px 0' }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Đang hiển thị {loaded}/{total} Công việc
            </Typography.Text>
            {hasMore && (
                <Button size="small" loading={loadingMore} onClick={onLoadMore}>
                    Tải thêm
                </Button>
            )}
        </div>
    );
}
