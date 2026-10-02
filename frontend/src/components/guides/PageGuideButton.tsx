'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useGuideList } from '@/lib/hooks/useGuides';
import { GUIDES_BASE_PATH, resolvePageGuideSlug } from '@/lib/guides/guide-slugs';

/**
 * Nút "Hướng dẫn trang này" ở Header dashboard -> `/huong-dan/<slug>` của trang đang mở.
 * Chỉ hiện khi bài đó nằm trong mục lục NGƯỜI XEM ĐƯỢC XEM (`GET /guides` đã lọc đã-xuất-bản + role/vị trí/phòng ban/quyền),
 * nên bài chưa viết / còn nháp / sai đối tượng thì nút tự ẩn - không bao giờ dẫn tới 404.
 */
export function PageGuideButton({ navKey }: { navKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { guides } = useGuideList();
  const visibleSlugs = useMemo(() => guides.map((g) => g.slug), [guides]);
  const slug = resolvePageGuideSlug(navKey, visibleSlugs, pathname);
  if (!slug) return null;

  return (
    <Button
      type="text"
      icon={<QuestionCircleOutlined />}
      onClick={() => router.push(`${GUIDES_BASE_PATH}/${encodeURIComponent(slug)}`)}
      aria-label="Xem hướng dẫn trang này"
      data-testid="page-guide-button"
      style={{ color: '#64748b' }}
    >
      <span className="hidden md:inline">Xem hướng dẫn trang này</span>
    </Button>
  );
}
