import { RefDataChangeSubscriber, REF_DATA_TABLE_DOMAINS } from './ref-data-change.subscriber';

/** Đợi hết hàng đợi microtask (subscriber gom sự kiện cùng tick rồi mới bump). */
const flush = () => new Promise<void>((r) => setImmediate(r));

describe('RefDataChangeSubscriber (9D)', () => {
  let versionService: { bumpRef: jest.Mock };
  let dataSource: { subscribers: unknown[] };
  let sub: RefDataChangeSubscriber;

  const qr = (isTransactionActive = false) => ({ isTransactionActive }) as any;
  const meta = (tableName: string) => ({ tableName }) as any;
  const updateEvent = (tableName: string, over: Record<string, unknown> = {}) =>
    ({ metadata: meta(tableName), queryRunner: qr(), updatedColumns: [], updatedRelations: [], entity: undefined, ...over }) as any;
  const bumped = () => versionService.bumpRef.mock.calls.map((c) => [...c[0]].sort());

  beforeEach(() => {
    versionService = { bumpRef: jest.fn() };
    dataSource = { subscribers: [] };
    sub = new RefDataChangeSubscriber(dataSource as any, versionService as any);
  });

  it('tự đăng ký vào dataSource.subscribers', () => {
    expect(dataSource.subscribers).toContain(sub);
  });

  it('bảng KHÔNG thuộc danh mục (vd. customers, notifications) -> không bump', async () => {
    sub.afterInsert({ metadata: meta('customers'), queryRunner: qr() } as any);
    sub.afterUpdate(updateEvent('customers', { entity: { name: 'x' } }));
    sub.afterRemove({ metadata: meta('notifications'), queryRunner: qr() } as any);
    await flush();
    expect(versionService.bumpRef).not.toHaveBeenCalled();
  });

  it.each(Object.entries(REF_DATA_TABLE_DOMAINS))('ghi vào bảng %s -> bump đúng domain %j', async (table, domains) => {
    sub.afterInsert({ metadata: meta(table), queryRunner: qr() } as any);
    await flush();
    expect(bumped()).toEqual([[...domains].sort()]);
  });

  it('sửa/xoá (afterUpdate, afterRemove) bảng danh mục đều bump', async () => {
    sub.afterUpdate(updateEvent('leave_types'));
    await flush();
    sub.afterRemove({ metadata: meta('media_sources'), queryRunner: qr() } as any);
    await flush();
    expect(bumped()).toEqual([['leave_types'], ['media_sources']]);
  });

  it('nhiều sự kiện cùng 1 tick (xoá rồi chèn lại danh sách manager) -> gom thành ĐÚNG 1 lần bump, không trùng domain', async () => {
    sub.afterRemove({ metadata: meta('department_managers'), queryRunner: qr() } as any);
    sub.afterInsert({ metadata: meta('department_managers'), queryRunner: qr() } as any);
    sub.afterInsert({ metadata: meta('department_managers'), queryRunner: qr() } as any);
    sub.afterUpdate(updateEvent('departments'));
    await flush();
    expect(versionService.bumpRef).toHaveBeenCalledTimes(1);
    expect(bumped()).toEqual([['departments', 'positions', 'users']]);
  });

  it('sự kiện ở tick sau -> lần bump mới (không "nuốt" mất thay đổi)', async () => {
    sub.afterInsert({ metadata: meta('roles'), queryRunner: qr() } as any);
    await flush();
    sub.afterInsert({ metadata: meta('roles'), queryRunner: qr() } as any);
    await flush();
    expect(versionService.bumpRef).toHaveBeenCalledTimes(2);
  });

  it('thiếu queryRunner vẫn chạy (coi như ngoài transaction)', async () => {
    sub.afterInsert({ metadata: meta('positions'), queryRunner: undefined } as any);
    await flush();
    expect(bumped()).toEqual([['positions', 'users']]);
  });

  describe('users (payload /departments có employees + managers)', () => {
    it('thêm user mới -> bump departments', async () => {
      sub.afterInsert({ metadata: meta('users'), queryRunner: qr() } as any);
      await flush();
      expect(bumped()).toEqual([['departments', 'link_groups', 'users']]);
    });

    it.each(['name', 'role', 'departmentId', 'isActive', 'deletedAt'])('save(): cột %s đổi -> bump departments + users', async (prop) => {
      sub.afterUpdate(updateEvent('users', { updatedColumns: [{ propertyName: prop }] }));
      await flush();
      expect(bumped()).toEqual([['departments', 'link_groups', 'users']]);
    });

    it('save(): quan hệ `department` đổi -> bump', async () => {
      sub.afterUpdate(updateEvent('users', { updatedRelations: [{ propertyName: 'department' }] }));
      await flush();
      expect(bumped()).toEqual([['departments', 'link_groups', 'users']]);
    });

    it('đăng nhập / refresh token (save) -> KHÔNG bump', async () => {
      sub.afterUpdate(
        updateEvent('users', {
          updatedColumns: [{ propertyName: 'lastLoginAt' }, { propertyName: 'hashedRefreshToken' }],
        }),
      );
      await flush();
      expect(versionService.bumpRef).not.toHaveBeenCalled();
    });

    it('số dư phép / avatar (save): KHÔNG bump departments nhưng bump users (payload /users/all có các cột này)', async () => {
      sub.afterUpdate(
        updateEvent('users', { updatedColumns: [{ propertyName: 'annualLeaveBalance' }, { propertyName: 'avatarUrl' }] }),
      );
      await flush();
      expect(bumped()).toEqual([['link_groups', 'users']]);
    });

    it('QueryBuilder/update(): lấy cột từ giá trị được set - xoá mềm `update(id, { deletedAt })` -> bump', async () => {
      sub.afterUpdate(updateEvent('users', { entity: { deletedAt: new Date(), deletedById: 1 } }));
      await flush();
      expect(bumped()).toEqual([['departments', 'link_groups', 'users']]);
    });

    it('QueryBuilder/update(): chỉ đổi lastLoginAt/hashedRefreshToken -> KHÔNG bump', async () => {
      sub.afterUpdate(updateEvent('users', { entity: { lastLoginAt: new Date(), hashedRefreshToken: 'h' } }));
      sub.afterUpdate(updateEvent('users', { entity: undefined }));
      await flush();
      expect(versionService.bumpRef).not.toHaveBeenCalled();
    });

    it('softDelete()/restore() (afterSoftRemove/afterRecover) -> bump', async () => {
      sub.afterSoftRemove({ metadata: meta('users'), queryRunner: qr() } as any);
      await flush();
      sub.afterRecover({ metadata: meta('users'), queryRunner: qr() } as any);
      await flush();
      expect(bumped()).toEqual([['departments', 'link_groups', 'users'], ['departments', 'link_groups', 'users']]);
    });

    it('softDelete()/restore() bảng danh mục -> bump domain của bảng đó', async () => {
      sub.afterSoftRemove({ metadata: meta('positions'), queryRunner: qr() } as any);
      await flush();
      expect(bumped()).toEqual([['positions', 'users']]);
    });
  });

  describe('trong transaction', () => {
    it('KHÔNG bump trước khi commit; commit xong mới bump ĐÚNG 1 lần (gộp các bảng)', async () => {
      const runner = qr(true);
      sub.afterInsert({ metadata: meta('roles'), queryRunner: runner } as any);
      sub.afterInsert({ metadata: meta('role_permissions'), queryRunner: runner } as any);
      sub.afterUpdate({ ...updateEvent('departments'), queryRunner: runner });
      await flush();
      expect(versionService.bumpRef).not.toHaveBeenCalled();

      sub.afterTransactionCommit({ queryRunner: runner } as any);
      expect(versionService.bumpRef).toHaveBeenCalledTimes(1);
      expect(bumped()).toEqual([['departments', 'positions', 'roles', 'users']]);

      sub.afterTransactionCommit({ queryRunner: runner } as any); // commit lần 2 -> không bump lại
      expect(versionService.bumpRef).toHaveBeenCalledTimes(1);
    });

    it('rollback -> bỏ hết, KHÔNG bump (dữ liệu không đổi thì không báo đổi)', async () => {
      const runner = qr(true);
      sub.afterInsert({ metadata: meta('leave_types'), queryRunner: runner } as any);
      sub.afterTransactionRollback({ queryRunner: runner } as any);
      sub.afterTransactionCommit({ queryRunner: runner } as any);
      await flush();
      expect(versionService.bumpRef).not.toHaveBeenCalled();
    });

    it('2 transaction song song độc lập: rollback cái này không ảnh hưởng cái kia', async () => {
      const a = qr(true);
      const b = qr(true);
      sub.afterInsert({ metadata: meta('positions'), queryRunner: a } as any);
      sub.afterInsert({ metadata: meta('media_sources'), queryRunner: b } as any);
      sub.afterTransactionRollback({ queryRunner: a } as any);
      sub.afterTransactionCommit({ queryRunner: b } as any);
      expect(bumped()).toEqual([['media_sources']]);
    });

    it('commit transaction không đụng danh mục nào -> không bump', () => {
      sub.afterTransactionCommit({ queryRunner: qr(true) } as any);
      expect(versionService.bumpRef).not.toHaveBeenCalled();
    });

    it('ghi ngoài transaction trong lúc có transaction khác đang mở -> bump ngay (không bị giữ lại)', async () => {
      const txn = qr(true);
      sub.afterInsert({ metadata: meta('roles'), queryRunner: txn } as any);
      sub.afterInsert({ metadata: meta('customer_statuses'), queryRunner: qr(false) } as any);
      await flush();
      expect(bumped()).toEqual([['customer_statuses']]);
    });
  });
});

describe('RefDataChangeSubscriber - link groups (cache HTTP /link-categories, /link-groups)', () => {
  it('bảng link_categories -> bump link_categories + link_groups; link_groups/secondary/content_staff -> link_groups', () => {
    expect(REF_DATA_TABLE_DOMAINS['link_categories']).toEqual(['link_categories', 'link_groups']);
    for (const t of ['link_groups', 'link_group_secondary_managers', 'link_group_content_staff']) {
      expect(REF_DATA_TABLE_DOMAINS[t]).toEqual(['link_groups']);
    }
  });
});
