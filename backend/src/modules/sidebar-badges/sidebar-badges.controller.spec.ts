import { SidebarBadgesController } from './sidebar-badges.controller';

describe('SidebarBadgesController.poll (PLAN CPU 10C - gộp poll + badges)', () => {
  const user = { id: 7, role: 'employee' };
  const make = (over: Partial<Record<'notif' | 'sig' | 'ref' | 'badges', jest.Mock>> = {}) => {
    const notif = over.notif ?? jest.fn().mockResolvedValue({ unread: 3, version: 100 });
    const sig = over.sig ?? jest.fn().mockResolvedValue('sig-1');
    const ref = over.ref ?? jest.fn().mockResolvedValue({ departments: 2 });
    const badges = over.badges ?? jest.fn().mockResolvedValue({ taskTodo: 5 });
    const ctrl = new SidebarBadgesController(
      { getBadges: badges } as never,
      { poll: notif } as never,
      { buildSig: sig, getRefSig: ref } as never,
    );
    return { ctrl, notif, sig, ref, badges };
  };

  it('trả unread/version + permSig + refSig + badges trong 1 lần gọi', async () => {
    const { ctrl, notif, badges } = make();
    expect(await ctrl.poll(user)).toEqual({
      unread: 3, version: 100, permSig: 'sig-1', refSig: { departments: 2 }, badges: { taskTodo: 5 },
    });
    expect(notif).toHaveBeenCalledWith(7);
    expect(badges).toHaveBeenCalledWith(user);
  });

  it('đếm badge lỗi -> vẫn trả phần thông báo, không có field badges', async () => {
    const { ctrl } = make({ badges: jest.fn().mockRejectedValue(new Error('db')) });
    const res = await ctrl.poll(user);
    expect(res).toEqual({ unread: 3, version: 100, permSig: 'sig-1', refSig: { departments: 2 } });
    expect('badges' in res).toBe(false);
  });

  it('permSig/refSig không đọc được (undefined) -> bỏ field, giống /notifications/poll', async () => {
    const { ctrl } = make({ sig: jest.fn().mockResolvedValue(undefined), ref: jest.fn().mockResolvedValue(undefined) });
    expect(await ctrl.poll(user)).toEqual({ unread: 3, version: 100, badges: { taskTodo: 5 } });
  });
});
