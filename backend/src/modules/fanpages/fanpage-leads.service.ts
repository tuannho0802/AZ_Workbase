import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { FanpageNote } from '../../database/entities/fanpage-note.entity';
import { MediaSource } from '../../database/entities/media-source.entity';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { CustomersService } from '../customers/customers.service';
import { UiVisibilityService } from '../ui-visibility/ui-visibility.service';
import { FanpageLeadDto, FanpageLeadsQueryDto } from './dto/fanpage-post.dto';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';

export interface FanpageLeadRow {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    source: string;
    status: string;
    inputDate: Date | null;
    createdAt: Date;
    salesUser: { id: number; name: string } | null;
    createdBy: { id: number; name: string } | null;
    /** Ghi chú Page đã sinh ra khách này (liên kết "từ ghi chú"); null = nhập tay trực tiếp. */
    noteId: number | null;
}

export interface FanpageLeadsResponse {
    data: FanpageLeadRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /** Scope `customers.view` đang áp (X32) - FE hiện nhãn "theo phạm vi dữ liệu của bạn". */
    customerScope: string;
}

/**
 * GĐ5b - Lead (khách hàng) từ Page (PLAN_FANPAGE_ANALYTICS mục 15).
 *  - KHÔNG có bảng Lead riêng, KHÔNG nhân đôi luật tạo khách: mọi lần tạo đi qua `CustomersService.create()`
 *    (UTM/trạng thái/audit `CREATE_CUSTOMER`/thông báo `customer.created`) - không đổi chữ ký hàm đó (X29).
 *  - Danh sách & số đếm là CÙNG một truy vấn trên bảng `customers` (X32), lọc `customers.view` bằng `CustomerAccessHelper`;
 *    KHÔNG JOIN `fanpage_notes`/`deposits` vào truy vấn đếm (15.8 tầng 4) - tên "từ ghi chú" lấy bằng truy vấn phụ `IN (...)`.
 *  - Q11: không gán Sales, không set `marketingUserId` (tránh bắn thông báo ngoài ý muốn); `created_by` = người tạo.
 */
@Injectable()
export class FanpageLeadsService {
    private readonly logger = new Logger(FanpageLeadsService.name);

    constructor(
        @InjectRepository(Customer)
        private readonly customerRepo: Repository<Customer>,
        @InjectRepository(FanpageNote)
        private readonly noteRepo: Repository<FanpageNote>,
        @InjectRepository(MediaSource)
        private readonly mediaRepo: Repository<MediaSource>,
        private readonly access: FanpageAccessService,
        private readonly customersService: CustomersService,
        private readonly uiVisibility: UiVisibilityService,
    ) {}

    // ───────────── Đọc ─────────────

    async list(fanpageId: number, q: FanpageLeadsQueryDto, user: FanpageCaller): Promise<FanpageLeadsResponse> {
        await this.access.assertPageAccess(user, 'fanpages.view', fanpageId, 'Bạn không có quyền xem Page này');
        const scope = await this.access.scopeOf(user, 'customers.view');
        if (!scope) throw new ForbiddenException('Bạn không có quyền xem khách hàng');

        const page = q.page ?? 1;
        const limit = q.limit ?? 10;

        const qb = this.customerRepo
            .createQueryBuilder('customer')
            .leftJoin('customer.salesUser', 'salesUser')
            .addSelect(['salesUser.id', 'salesUser.name'])
            .leftJoin('customer.createdBy', 'createdBy')
            .addSelect(['createdBy.id', 'createdBy.name'])
            .where('customer.fanpageId = :fanpageId', { fanpageId })
            .andWhere('customer.deletedAt IS NULL');
        CustomerAccessHelper.applyViewFilter(qb, user.id, user.role, scope);

        const kw = q.search?.trim();
        if (kw) qb.andWhere('(customer.name LIKE :kw OR customer.phone LIKE :kw)', { kw: `%${kw}%` });

        qb.orderBy('customer.inputDate', 'DESC')
            .addOrderBy('customer.id', 'DESC')
            .offset((page - 1) * limit)
            .limit(limit);
        const [entities, total] = await qb.getManyAndCount();

        const noteByCustomer = new Map<number, number>();
        if (entities.length > 0) {
            const notes = await this.noteRepo
                .createQueryBuilder('n')
                .select(['n.id', 'n.leadCustomerId'])
                .where('n.leadCustomerId IN (:...ids)', { ids: entities.map((c) => c.id) })
                .getMany();
            for (const n of notes) if (n.leadCustomerId != null) noteByCustomer.set(n.leadCustomerId, n.id);
        }

        const hidden = await this.uiVisibility.getHiddenElementKeys(user.role, 'customers', user.departmentId, user.positionId, user.isRootAdmin);
        const data = entities.map((c) =>
            this.uiVisibility.stripHiddenCustomerFields(
                {
                    id: c.id,
                    name: c.name,
                    phone: c.phone,
                    email: c.email,
                    source: c.source,
                    status: c.status,
                    inputDate: c.inputDate ?? null,
                    createdAt: c.createdAt,
                    salesUserId: c.salesUser?.id,
                    salesUser: c.salesUser ? { id: c.salesUser.id, name: c.salesUser.name } : null,
                    createdBy: c.createdBy ? { id: c.createdBy.id, name: c.createdBy.name } : null,
                    noteId: noteByCustomer.get(c.id) ?? null,
                } as FanpageLeadRow & { salesUserId?: number },
                hidden,
            ),
        );
        return { data, total, page, limit, totalPages: Math.ceil(total / limit), customerScope: scope };
    }

    // ───────────── Ghi ─────────────

    /** `POST /fanpages/:id/customers` - tạo Lead thủ công. */
    async create(fanpageId: number, dto: FanpageLeadDto, user: FanpageCaller): Promise<FanpageLeadRow> {
        const page = await this.access.assertPageAccess(user, 'fanpages.view', fanpageId, 'Bạn không có quyền xem Page này');
        const customer = await this.createForPage(page, dto, user);
        return this.toRow(customer.id, user);
    }

    /**
     * Lõi tạo khách cho 1 Page - dùng chung cho endpoint trên và ghi chú có `lead` (X29). Kiểm đủ điều kiện TRƯỚC khi tạo:
     * `customers.create` (X31, kiểm ở BE dù endpoint ghi chú chỉ có `fanpage_notes.manage`) + Page chưa lưu trữ (409).
     * Lỗi trùng SĐT/validate của `CustomersService.create` được ném nguyên (4xx) - KHÔNG tự gắn khách cũ vào Page (X30).
     */
    async createForPage(page: Fanpage, dto: FanpageLeadDto, user: FanpageCaller): Promise<Customer> {
        if (!(await this.access.hasBinary(user, 'customers.create'))) {
            throw new ForbiddenException('Bạn không có quyền tạo khách hàng');
        }
        if (page.archivedAt != null) {
            throw new ConflictException('Page này đã được lưu trữ - hãy bỏ lưu trữ Page trước khi thêm khách');
        }
        const source = await this.resolveSource(page, dto.source);

        // `fanpageId` không nằm trong CreateCustomerDto (UpdateCustomerDto kế thừa -> sẽ lọt vào API sửa) nên truyền qua spread + ép kiểu;
        // `CustomersService.create` spread nguyên DTO vào entity. Không set salesUserId/marketingUserId (Q11).
        const payload = {
            name: dto.name,
            phone: dto.phone,
            email: dto.email,
            source,
            note: dto.note,
            fanpageId: page.id,
        } as unknown as Parameters<CustomersService['create']>[0];
        const saved = await this.customersService.create(payload, user.id, user);
        return saved as unknown as Customer;
    }

    /**
     * X29: ghi chú lỗi SAU khi khách đã tạo -> xoá mềm khách vừa tạo bằng đường xoá mềm sẵn có của Customers (có audit).
     * `phone` UNIQUE tính cả bản ghi xoá mềm nên SĐT nằm lại ở Thùng rác (Admin khôi phục/xoá cứng) - nói rõ trong lỗi trả về.
     */
    async compensateCreated(customerId: number, user: FanpageCaller, cause: unknown): Promise<never> {
        this.logger.error(`Ghi chú Page lỗi sau khi tạo khách #${customerId}`, cause instanceof Error ? cause.stack : String(cause));
        try {
            await this.customersService.remove(customerId, user.id, user.role, 'all');
        } catch (e) {
            this.logger.error(`Không xoá mềm được khách #${customerId} sau lỗi ghi chú`, e instanceof Error ? e.stack : String(e));
        }
        throw new InternalServerErrorException(
            'Không lưu được ghi chú. Khách vừa tạo đã được chuyển vào Thùng rác (SĐT vẫn nằm ở Thùng rác - nhờ Admin khôi phục hoặc xoá hẳn nếu cần nhập lại).',
        );
    }

    // ───────────── Nội bộ ─────────────

    /** Q11: `source` do người dùng chọn (phải là nguồn đang mở) hoặc mặc định theo nền tảng của Page nếu khớp 1 nguồn đang mở. */
    private async resolveSource(page: Fanpage, requested?: string): Promise<string> {
        const open = await this.mediaRepo.find({ where: { isLocked: false } });
        const byLower = new Map(open.map((m) => [m.name.trim().toLowerCase(), m.name]));
        const want = requested?.trim();
        if (want) {
            const hit = byLower.get(want.toLowerCase());
            if (!hit) throw new BadRequestException(`Nguồn "${want}" không tồn tại hoặc đang bị khoá. Vui lòng chọn nguồn khác.`);
            return hit;
        }
        const platformName = page.platform?.name?.trim().toLowerCase();
        const fromPlatform = platformName ? byLower.get(platformName) : undefined;
        if (!fromPlatform) throw new BadRequestException('Vui lòng chọn nguồn khách hàng (nền tảng của Page không khớp nguồn nào đang mở).');
        return fromPlatform;
    }

    private async toRow(customerId: number, user: FanpageCaller): Promise<FanpageLeadRow> {
        const c = await this.customerRepo
            .createQueryBuilder('customer')
            .leftJoin('customer.salesUser', 'salesUser')
            .addSelect(['salesUser.id', 'salesUser.name'])
            .leftJoin('customer.createdBy', 'createdBy')
            .addSelect(['createdBy.id', 'createdBy.name'])
            .where('customer.id = :customerId', { customerId })
            .getOneOrFail();
        const hidden = await this.uiVisibility.getHiddenElementKeys(user.role, 'customers', user.departmentId, user.positionId, user.isRootAdmin);
        return this.uiVisibility.stripHiddenCustomerFields(
            {
                id: c.id,
                name: c.name,
                phone: c.phone,
                email: c.email,
                source: c.source,
                status: c.status,
                inputDate: c.inputDate ?? null,
                createdAt: c.createdAt,
                salesUserId: c.salesUser?.id,
                salesUser: c.salesUser ? { id: c.salesUser.id, name: c.salesUser.name } : null,
                createdBy: c.createdBy ? { id: c.createdBy.id, name: c.createdBy.name } : null,
                noteId: null,
            } as FanpageLeadRow & { salesUserId?: number },
            hidden,
        );
    }
}
