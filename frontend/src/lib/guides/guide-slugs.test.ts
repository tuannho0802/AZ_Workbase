import { describe, expect, it } from 'vitest';
import { GETTING_STARTED_GUIDE_SLUG, guideSlugForNavKey, resolvePageGuideSlug } from './guide-slugs';

describe('guideSlugForNavKey', () => {
  it('trang chủ -> bài tổng; mục menu -> slug; key lạ -> null', () => {
    expect(guideSlugForNavKey('home')).toBe(GETTING_STARTED_GUIDE_SLUG);
    expect(guideSlugForNavKey('customers')).toBe('khach-hang');
    expect(guideSlugForNavKey('audit-logs')).toBe('nhat-ky-he-thong');
    expect(guideSlugForNavKey('khong-co')).toBeNull();
  });
});

describe('resolvePageGuideSlug', () => {
  const visible = ['khach-hang', 'bat-dau'];
  it('có bài và người xem được xem -> trả slug', () => {
    expect(resolvePageGuideSlug('customers', visible, '/customers')).toBe('khach-hang');
    expect(resolvePageGuideSlug('home', visible, '/')).toBe('bat-dau');
  });
  it('bài không nằm trong mục lục người xem (nháp / sai role / thiếu quyền / chưa viết) -> ẩn nút', () => {
    expect(resolvePageGuideSlug('chia-data', visible, '/chia-data')).toBeNull();
    expect(resolvePageGuideSlug('customers', [], '/customers')).toBeNull();
  });
  it('đang ở chính bài đó -> ẩn nút', () => {
    expect(resolvePageGuideSlug('customers', visible, '/huong-dan/khach-hang')).toBeNull();
    expect(resolvePageGuideSlug('customers', visible, '/huong-dan/khach-hang/')).toBeNull();
  });
  it('trang không ánh xạ -> ẩn nút', () => {
    expect(resolvePageGuideSlug('khong-co', visible, '/x')).toBeNull();
  });
});
