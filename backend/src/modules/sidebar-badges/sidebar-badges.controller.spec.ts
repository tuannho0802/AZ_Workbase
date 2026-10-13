import { SidebarBadgesController } from './sidebar-badges.controller';

describe('SidebarBadgesController.poll (PLAN CPU 10C - gộp poll + badges)', () => {
  const user = { id: 7, role: 'employee' };
  const make = (over: Partial<Record<'notif' | 'sig' | 'ref' | 'epoch' | 'badges', jest.Mock>> = {}) => {
    const notif = over.notif ?? jest.fn().mockResolvedValue({ unread: 3, version: 100 });
    const sig = over.sig ?? jest.fn().mockResolvedValue('sig-1');
    const ref = over.ref ?? jest.fn().mockResolvedValue({ departments: 2 });
    const epoch = over.epoch ?? jest.fn().mockResolvedValue(4);
    const badges = over.badges ?? jest.fn().mockResolvedValue({ taskTodo: 5 });
    const ctrl = new SidebarBadgesController(
      { getBadges: badges } as never,
      { poll: notif } as never,
      { buildSig: sig, getRefSig: ref, getEpoch: epoch } as never,
    );
    return { ctrl, notif, sig, ref, epoch, badges };
  };

  it('trả unread/version + permSig + refSig + badges trong 1 lần gọi', async () => {
    const { ctrl, notif, badges } = make();
    expect(await ctrl.poll(user)).toEqual({
      unread: 3, version: 100, permSig: 'sig-1', refSig: { departments: 2 }, epoch: 4, badges: { taskTodo: 5 },
    });
    expect(notif).toHaveBeenCalledWith(7);
    expect(badges).toHaveBeenCalledWith(user);
  });

  it('đếm badge lỗi -> vẫn trả phần thông báo, không có field badges', async () => {
    const { ctrl } = make({ badges: jest.fn().mockRejectedValue(new Error('db')) });
    const res = await ctrl.poll(user);
    expect(res).toEqual({ unread: 3, version: 100, permSig: 'sig-1', refSig: { departments: 2 }, epoch: 4 });
    expect('badges' in res).toBe(false);
  });

  it('permSig/refSig/epoch không đọc được (undefined) -> bỏ field, giống /notifications/poll', async () => {
    const { ctrl } = make({ sig: jest.fn().mockResolvedValue(undefined), ref: jest.fn().mockResolvedValue(undefined), epoch: jest.fn().mockResolvedValue(undefined) });
    expect(await ctrl.poll(user)).toEqual({ unread: 3, version: 100, badges: { taskTodo: 5 } });
  });
});

describe('SidebarBadgesController.getBadges (endpoint cũ, đang theo dõi để xoá)', () => {
  it('vẫn trả số đếm như cũ; chỉ cảnh báo [Deprecated] 1 lần trong 10 phút', () => {
    const badges = jest.fn().mockReturnValue({ taskTodo: 1 });
    const ctrl = new SidebarBadgesController({ getBadges: badges } as never, {} as never, {} as never);
    const warn = jest.spyOn((ctrl as any).logger, 'warn').mockImplementation();
    expect(ctrl.getBadges({ id: 7 })).toEqual({ taskTodo: 1 });
    ctrl.getBadges({ id: 7 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('[Deprecated]');
    expect(badges).toHaveBeenCalledTimes(2);
  });
});
