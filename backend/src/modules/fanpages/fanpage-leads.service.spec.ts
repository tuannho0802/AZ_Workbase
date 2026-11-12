import { BadRequestException, ConflictException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { FanpageLeadsService } from './fanpage-leads.service';
import { FanpageNotesService } from './fanpage-notes.service';

const user = { id: 7, role: 'employee', departmentId: 1, positionId: null, isRootAdmin: false };
const dto = { name: 'Nguyễn Văn A', phone: '0901234567' };

function setup(o: { canCreate?: boolean; customerScope?: string | null; archived?: boolean; platform?: string; sources?: { name: string }[] } = {}) {
    const page = { id: 3, name: 'Page X', archivedAt: o.archived ? new Date() : null, platform: { name: o.platform ?? 'Facebook' } };
    const access = {
        assertPageAccess: jest.fn(async () => page),
        hasBinary: jest.fn(async () => o.canCreate ?? true),
        scopeOf: jest.fn(async () => (o.customerScope === undefined ? 'own' : o.customerScope)),
    };
    const customersService = {
        create: jest.fn(async () => ({ id: 99 })),
        remove: jest.fn(async () => ({ deleted: true })),
    };
    const mediaRepo = { find: jest.fn(async () => o.sources ?? [{ name: 'Facebook' }, { name: 'TikTok' }]) };
    const qb: Record<string, jest.Mock> = {};
    for (const m of ['leftJoin', 'addSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'offset', 'limit', 'select']) qb[m] = jest.fn(() => qb);
    qb.getManyAndCount = jest.fn(async () => [[], 0]);
    qb.getMany = jest.fn(async () => []);
    const customerRepo = { createQueryBuilder: jest.fn(() => qb) };
    const noteRepo = { createQueryBuilder: jest.fn(() => qb) };
    const uiVisibility = { getHiddenElementKeys: jest.fn(async () => new Set<string>()), stripHiddenCustomerFields: jest.fn((r: unknown) => r) };
    const svc = new FanpageLeadsService(customerRepo as never, noteRepo as never, mediaRepo as never, access as never, customersService as never, uiVisibility as never);
    return { svc, page, access, customersService, customerRepo, qb };
}

afterEach(() => jest.restoreAllMocks());

describe('FanpageLeadsService.createForPage', () => {
    it('thiếu customers.create -> 403, KHÔNG gọi CustomersService (X31)', async () => {
        const t = setup({ canCreate: false });
        await expect(t.svc.createForPage(t.page as never, dto, user)).rejects.toBeInstanceOf(ForbiddenException);
        expect(t.customersService.create).not.toHaveBeenCalled();
    });

    it('Page đã lưu trữ -> 409', async () => {
        const t = setup({ archived: true });
        await expect(t.svc.createForPage(t.page as never, dto, user)).rejects.toBeInstanceOf(ConflictException);
        expect(t.customersService.create).not.toHaveBeenCalled();
    });

    it('đi qua CustomersService.create với fanpageId, nguồn theo nền tảng Page, KHÔNG gán Sales/Marketing (Q11)', async () => {
        const t = setup({ platform: 'facebook' });
        await t.svc.createForPage(t.page as never, dto, user);
        const [payload, userId, caller] = t.customersService.create.mock.calls[0] as unknown as [Record<string, unknown>, number, unknown];
        expect(payload).toMatchObject({ name: dto.name, phone: dto.phone, fanpageId: 3, source: 'Facebook' });
        expect(payload).not.toHaveProperty('salesUserId');
        expect(payload).not.toHaveProperty('marketingUserId');
        expect(userId).toBe(user.id);
        expect(caller).toBe(user);
    });

    it('nền tảng không khớp nguồn nào đang mở và không chọn nguồn -> 400', async () => {
        const t = setup({ platform: 'Zalo' });
        await expect(t.svc.createForPage(t.page as never, dto, user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('nguồn chọn tay không tồn tại/đang khoá -> 400; nguồn hợp lệ (khác hoa/thường) được chuẩn hoá tên', async () => {
        const t = setup({ platform: 'Zalo' });
        await expect(t.svc.createForPage(t.page as never, { ...dto, source: 'Instagram' }, user)).rejects.toBeInstanceOf(BadRequestException);
        await t.svc.createForPage(t.page as never, { ...dto, source: 'tiktok' }, user);
        expect((t.customersService.create.mock.calls[0] as unknown as [Record<string, unknown>])[0].source).toBe('TikTok');
    });

    it('lỗi từ CustomersService (vd trùng SĐT) được ném nguyên, không nuốt', async () => {
        const t = setup();
        t.customersService.create.mockRejectedValueOnce(new BadRequestException('Số điện thoại đã tồn tại'));
        await expect(t.svc.createForPage(t.page as never, dto, user)).rejects.toThrow('Số điện thoại đã tồn tại');
    });
});

describe('FanpageLeadsService.compensateCreated (X29)', () => {
    it('xoá mềm khách vừa tạo bằng đường xoá sẵn có rồi ném 500 nêu rõ SĐT nằm ở Thùng rác', async () => {
        const t = setup();
        await expect(t.svc.compensateCreated(99, user, new Error('db down'))).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(t.customersService.remove).toHaveBeenCalledWith(99, user.id, user.role, 'all');
    });

    it('xoá mềm cũng lỗi -> vẫn ném 500 (không che lỗi gốc)', async () => {
        const t = setup();
        t.customersService.remove.mockRejectedValueOnce(new Error('x'));
        await expect(t.svc.compensateCreated(99, user, new Error('db down'))).rejects.toBeInstanceOf(InternalServerErrorException);
    });
});

describe('FanpageLeadsService.list', () => {
    it('không có customers.view -> 403, không truy vấn khách', async () => {
        const t = setup({ customerScope: null });
        await expect(t.svc.list(3, {}, user)).rejects.toBeInstanceOf(ForbiddenException);
        expect(t.customerRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('lọc theo fanpage_id + bỏ xoá mềm + áp scope customers.view của người xem (X32)', async () => {
        const apply = jest.spyOn(CustomerAccessHelper, 'applyViewFilter').mockImplementation((qb) => qb);
        const t = setup({ customerScope: 'department' });
        const r = await t.svc.list(3, { page: 2, limit: 5 }, user);
        expect(apply).toHaveBeenCalledWith(expect.anything(), user.id, user.role, 'department');
        expect(t.qb.where).toHaveBeenCalledWith('customer.fanpageId = :fanpageId', { fanpageId: 3 });
        expect(t.qb.andWhere).toHaveBeenCalledWith('customer.deletedAt IS NULL');
        expect(t.qb.offset).toHaveBeenCalledWith(5);
        expect(r).toMatchObject({ total: 0, page: 2, limit: 5, customerScope: 'department' });
    });
});

describe('FanpageNotesService.create với lead (X29)', () => {
    function notes(o: { saveFails?: boolean } = {}) {
        const page = { id: 3 };
        const saved = { id: 50, note: 'n', leadCustomerId: 99 };
        const repo = {
            create: jest.fn((x: unknown) => x),
            save: jest.fn(async () => {
                if (o.saveFails) throw new Error('save failed');
                return saved;
            }),
            createQueryBuilder: jest.fn(() => {
                const qb: Record<string, jest.Mock> = {};
                for (const m of ['leftJoin', 'addSelect', 'where']) qb[m] = jest.fn(() => qb);
                qb.getOneOrFail = jest.fn(async () => saved);
                return qb;
            }),
        };
        const access = { assertPageAccess: jest.fn(async () => page) };
        const audit = { logActionAsync: jest.fn() };
        const leads = {
            createForPage: jest.fn(async () => ({ id: 99 })),
            compensateCreated: jest.fn(async (): Promise<never> => {
                throw new InternalServerErrorException('x');
            }),
        };
        const svc = new FanpageNotesService(repo as never, access as never, audit as never, leads as never);
        return { svc, repo, leads, audit };
    }

    it('khách lỗi -> ném lỗi và CHƯA lưu ghi chú', async () => {
        const t = notes();
        t.leads.createForPage.mockRejectedValueOnce(new BadRequestException('Số điện thoại đã tồn tại'));
        await expect(t.svc.create(3, { note: 'n', lead: dto }, user)).rejects.toThrow('Số điện thoại đã tồn tại');
        expect(t.repo.save).not.toHaveBeenCalled();
    });

    it('thành công: lưu leadCustomerId + ghi leadCustomerId vào audit snapshot', async () => {
        const t = notes();
        await t.svc.create(3, { note: 'n', lead: dto }, user);
        expect(t.repo.create).toHaveBeenCalledWith(expect.objectContaining({ leadCustomerId: 99 }));
        expect(t.audit.logActionAsync).toHaveBeenCalledWith(user.id, 'CREATE_FANPAGE_NOTE', 'fanpage_note', 50, null, expect.objectContaining({ leadCustomerId: 99 }));
    });

    it('ghi chú lỗi sau khi khách đã tạo -> gọi compensateCreated', async () => {
        const t = notes({ saveFails: true });
        await expect(t.svc.create(3, { note: 'n', lead: dto }, user)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(t.leads.compensateCreated).toHaveBeenCalledWith(99, user, expect.any(Error));
    });

    it('ghi chú thường (không lead) không đụng tới luồng khách', async () => {
        const t = notes();
        await t.svc.create(3, { note: 'n' }, user);
        expect(t.leads.createForPage).not.toHaveBeenCalled();
    });

    it('sửa ghi chú có `lead` -> 400', async () => {
        const t = notes();
        await expect(t.svc.update(3, 50, { note: 'n', lead: dto }, user)).rejects.toBeInstanceOf(BadRequestException);
    });
});