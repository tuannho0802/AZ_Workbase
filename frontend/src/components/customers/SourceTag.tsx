'use client';

import { Tag } from 'antd';
import { useMemo } from 'react';
import { useMediaSources } from '@/lib/hooks/useMediaSources';

interface SourceTagProps {
  source?: string | null;
  fallback?: React.ReactNode;
}

/**
 * Tag hiển thị nguồn khách hàng, tô đúng màu đã cấu hình ở /nguon-media.
 *
 * Trước đây mỗi trang (customers, chia-data, trash-can, CustomerInfoTab) tự
 * hardcode 1 bảng màu riêng (vd chỉ map được Facebook/TikTok/Google/
 * Instagram, thiếu LinkedIn/Other và mọi nguồn admin tự thêm sau này) -
 * không đồng bộ và không phản ánh màu thật admin đã chọn ở trang quản lý
 * nguồn. Component này lấy TẤT CẢ nguồn (kể cả đã khoá - activeOnly=false)
 * để vẫn tô đúng màu cho khách hàng cũ dùng 1 nguồn đã bị khoá, và fallback
 * về Tag mặc định (không màu) nếu tên nguồn không còn khớp dòng nào trong
 * bảng media_sources (vd nguồn đã bị đổi tên/xoá hẳn từ trước khi có màu).
 */
export const SourceTag = ({ source, fallback = null }: SourceTagProps) => {
  const { sources } = useMediaSources(false);
  const colorMap = useMemo(
    () => new Map(sources.map((s) => [s.name, s.color])),
    [sources],
  );

  if (!source) return <>{fallback}</>;

  return <Tag color={colorMap.get(source)}>{source}</Tag>;
};
