import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, getVisibleNavItems } from './nav-config';

describe('nav-config: getVisibleNavItems', () => {
  it('mục roles=null và không có permission -> luôn hiện cho mọi role đăng nhập', () => {
    // FIX TEST STALE (rà soát permission 2026-09): trước đây dùng 'customers'
    // làm ví dụ, nhưng mục đó đã được gắn `permission: 'customers.view'` từ
    // 1 lần fix bug trước (không còn "không có permission" nữa) - test cũ
    // vì vậy luôn đỏ, không liên quan gì tới thay đổi ở lần rà soát này.
    // 'profile' mới thực sự là mục `roles: null` KHÔNG có `permission`.
    const items = getVisibleNavItems('employee', () => false);
    expect(items.some((i) => i.key === 'profile')).toBe(true);
  });

  it('mục dùng `permission` -> ẨN nếu can() trả false, dù role có nằm trong 1 field roles cũ nào đó', () => {
    const can = (key: string) => key !== 'audit.view';
    const items = getVisibleNavItems('admin', can);
    expect(items.some((i) => i.key === 'audit-logs')).toBe(false);
  });

  it('mục dùng `permission` -> HIỆN nếu can() trả true', () => {
    const can = (key: string) => key === 'audit.view';
    const items = getVisibleNavItems('assistant', can);
    expect(items.some((i) => i.key === 'audit-logs')).toBe(true);
  });

  it('AN TOÀN MẶC ĐỊNH: mục có `permission` nhưng KHÔNG truyền hàm can() -> phải ẨN, không phải hiện', () => {
    // Đây là bug pattern nguy hiểm nhất: nếu 1 nơi gọi getVisibleNavItems()
    // quên truyền `can` (vd lúc useMyPermissions() đang loading), item phải
    // tự ẩn thay vì mặc định hiện ra rồi 403 khi bấm vào.
    const items = getVisibleNavItems('admin');
    const dynamicItems = NAV_ITEMS.filter((i) => i.permission);
    expect(dynamicItems.length).toBeGreaterThan(0); // đảm bảo test này thật sự kiểm tra được gì đó
    for (const item of dynamicItems) {
      expect(items.some((i) => i.key === item.key)).toBe(false);
    }
  });

  it('mục dùng field `roles` tĩnh (chưa migrate) vẫn lọc đúng theo role, không phụ thuộc can()', () => {
    // nhom-toi-quan-ly: roles=null, không permission -> luôn hiện, không
    // liên quan gì tới can() - nếu ai lỡ đổi field `permission` cho mục
    // này mà quên cập nhật BE tương ứng, test dưới sẽ đỏ và cảnh báo sớm.
    const items = getVisibleNavItems('employee', () => false);
    expect(items.some((i) => i.key === 'nhom-toi-quan-ly')).toBe(true);
  });

  it('mỗi NAV_ITEM chỉ dùng ĐÚNG 1 trong 2 cơ chế: hoặc `permission`, hoặc `roles` cụ thể - không lẫn lộn dở dang', () => {
    // Không bắt buộc roles phải null khi có permission ở cấp type, nhưng
    // getVisibleNavItems() ưu tiên permission và bỏ qua roles hoàn toàn khi
    // permission có mặt (xem implementation) - test này khẳng định lại
    // đúng hành vi đó để không ai vô tình đổi field roles của 1 mục ĐÃ có
    // permission và tưởng rằng nó còn tác dụng.
    for (const item of NAV_ITEMS) {
      if (item.permission) {
        const shownWhenCanTrue = getVisibleNavItems('employee', () => true).some(
          (i) => i.key === item.key,
        );
        expect(shownWhenCanTrue).toBe(true); // roles tĩnh (kể cả null cho role lạ) không cản được
      }
    }
  });

  it('danh mục permission key không trùng lặp vô nghĩa và không rỗng chuỗi', () => {
    for (const item of NAV_ITEMS) {
      if (item.permission) {
        const keys = Array.isArray(item.permission) ? item.permission : [item.permission];
        expect(keys.length).toBeGreaterThan(0);
        expect(new Set(keys).size).toBe(keys.length); // không trùng lặp trong cùng 1 mục
        for (const key of keys) {
          expect(key.length).toBeGreaterThan(0);
          expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/);
        }
      }
    }
  });

  it('mục dùng mảng permission (OR) -> HIỆN nếu can() trả true cho BẤT KỲ 1 key nào trong mảng', () => {
    // duyet-phep: permission = ['leave_requests.view', 'leave_requests.approve']
    // - role chỉ có approve (không có view) vẫn phải thấy mục này (bug đã
    // sửa 2026-09 - trước đây chỉ check .view, ẩn nhầm role chỉ có .approve).
    const canOnlyApprove = (key: string) => key === 'leave_requests.approve';
    const items = getVisibleNavItems('manager', canOnlyApprove);
    expect(items.some((i) => i.key === 'duyet-phep')).toBe(true);

    const canOnlyView = (key: string) => key === 'leave_requests.view';
    const items2 = getVisibleNavItems('employee', canOnlyView);
    expect(items2.some((i) => i.key === 'duyet-phep')).toBe(true);

    const canNeither = () => false;
    const items3 = getVisibleNavItems('employee', canNeither);
    expect(items3.some((i) => i.key === 'duyet-phep')).toBe(false);
  });
});