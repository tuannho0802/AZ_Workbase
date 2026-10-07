'use client';

import { Skeleton } from 'antd';

/** Placeholder khi chunk biểu đồ (recharts) đang tải qua next/dynamic - giữ đúng chiều cao để không nhảy layout. */
export function ChartSkeleton({ height = 320 }: { height?: number }) {
  return (
    <Skeleton.Node active style={{ width: '100%', height }}>
      <span />
    </Skeleton.Node>
  );
}
