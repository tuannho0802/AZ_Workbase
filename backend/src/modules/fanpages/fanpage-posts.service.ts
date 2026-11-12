import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FanpagePost } from '../../database/entities/fanpage-post.entity';
import { FanpagePostType } from '../../database/entities/fanpage-post-type.entity';
import { AuditService } from '../audit/audit.service';
import { BulkCreateFanpagePostsDto, CreateFanpagePostDto, UpdateFanpagePostDto } from './dto/fanpage-post.dto';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';
import { normalizeFanpageUrl } from './fanpages.service';
import { BulkPlanSkipped, planBulkPosts } from './helpers/fanpage-bulk-posts.helper';
import { postUrlKey } from './helpers/fanpage-url.helper';

const blankToNull = (v: string | null | undefined): string | null => (v == null || v.trim() === '' ? null : v.trim());

const POST_METRIC_KEYS = ['views', 'likes', 'comments', 'shares'] as const;
type PostMetricPatch = Partial<Record<(typeof POST_METRIC_KEYS)[number], number | null>>;

/** Chỉ lấy các số liệu bài CÓ gửi lên (undefined = giữ nguyên; null = xoá số đã nhập). */
const pickMetrics = (dto: PostMetricPatch): PostMetricPatch => {
    const out: PostMetricPatch = {};
    for (const k of POST_METRIC_KEYS) if (dto[k] !== undefined) out[k] = dto[k];
    return out;
};

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' cho thông báo lỗi (không đi qua Date -> không dính múi giờ). */
const fmtVnDate = (d: string): string => d.split('-').reverse().join('/');

@Injectable()
export class FanpagePostsService {
    constructor(
        @InjectRepository(FanpagePost)
        private readonly repo: Repository<FanpagePost>,
        private readonly access: FanpageAccessService,
        private readonly auditService: AuditService,
        @InjectRepository(FanpagePostType)
        private readonly typeRepo: Repository<FanpagePostType>,
    ) { }

    private withUsers(id?: number) {
        const qb = this.repo
            .createQueryBuilder('p')
            .leftJoin('p.createdBy', 'createdBy')
            .addSelect(['createdBy.id', 'createdBy.name'])
            .leftJoin('p.updatedBy', 'updatedBy')
            .addSelect(['updatedBy.id', 'updatedBy.name'])
            .leftJoin('p.postType', 'postType')
            .addSelect(['postType.id', 'postType.name', 'postType.color', 'postType.isLocked']);
        if (id != null) qb.where('p.id = :id', { id });
        return qb;
    }

    async list(fanpageId: number, user: FanpageCaller): Promise<FanpagePost[]> {
        await this.access.assertPageAccess(user, 'fanpages.view', fanpageId, 'Bạn không có quyền xem Page này');
        return this.withUsers()
            .where('p.fanpageId = :fanpageId', { fanpageId })
            .orderBy('p.postedDate', 'DESC')
            .addOrderBy('p.id', 'DESC')
            .getMany();
    }

    async create(fanpageId: number, dto: CreateFanpagePostDto, user: FanpageCaller): Promise<FanpagePost> {
        await this.access.assertPageAccess(user, 'fanpage_posts.manage', fanpageId, 'Bạn không có quyền thêm bài đăng cho Page này');
        await this.assertPostUrlFree(fanpageId, dto.url);
        if (dto.postTypeId != null) await this.assertPostTypeUsable(dto.postTypeId);
        const metrics = pickMetrics(dto);
        const saved = await this.repo.save(
            this.repo.create({
                fanpageId,
                url: normalizeFanpageUrl(dto.url),
                title: blankToNull(dto.title),
                postedDate: dto.postedDate ?? null,
                postTypeId: dto.postTypeId ?? null,
                note: blankToNull(dto.note),
                createdById: user.id,
                ...metrics,
                ...(Object.keys(metrics).length > 0 ? { metricsUpdatedAt: new Date() } : {}),
            }),
        );
        this.auditService.logActionAsync(user.id, 'CREATE_FANPAGE_POST', 'fanpage_post', saved.id, null, {
            id: saved.id,
            fanpageId,
            url: saved.url,
            title: saved.title,
            postedDate: saved.postedDate,
            postTypeId: saved.postTypeId ?? null,
            ...metrics,
        });
        return this.withUsers(saved.id).getOneOrFail();
    }

    async update(fanpageId: number, postId: number, dto: UpdateFanpagePostDto, user: FanpageCaller): Promise<FanpagePost> {
        await this.access.assertPageAccess(user, 'fanpage_posts.manage', fanpageId, 'Bạn không có quyền sửa bài đăng của Page này');
        const post = await this.findInPage(fanpageId, postId);
        const before = {
            url: post.url,
            title: post.title,
            postedDate: post.postedDate,
            postTypeId: post.postTypeId ?? null,
            note: post.note,
            views: post.views,
            likes: post.likes,
            comments: post.comments,
            shares: post.shares,
        };

        const patch: Partial<FanpagePost> = {};
        if (dto.url !== undefined) {
            // Chỉ kiểm tra trùng khi link THỰC SỰ đổi (so theo khoá chuẩn hoá) - sửa ngày/ghi chú không bị chặn bởi dữ liệu cũ trùng sẵn.
            if (postUrlKey(dto.url) !== postUrlKey(post.url)) await this.assertPostUrlFree(fanpageId, dto.url, postId);
            patch.url = normalizeFanpageUrl(dto.url);
        }
        if (dto.title !== undefined) patch.title = blankToNull(dto.title);
        if (dto.postedDate !== undefined) patch.postedDate = dto.postedDate;
        if (dto.postTypeId !== undefined) {
            // Chỉ kiểm tra khi loại bài THỰC SỰ đổi - bài đang dùng loại đã khoá vẫn sửa các trường khác được.
            if (dto.postTypeId !== null && dto.postTypeId !== post.postTypeId) await this.assertPostTypeUsable(dto.postTypeId);
            patch.postTypeId = dto.postTypeId;
        }
        if (dto.note !== undefined) patch.note = blankToNull(dto.note);
        // Số liệu bài (C4): chỉ ghi số có gửi; chạm số nào thì ghi lại `metricsUpdatedAt`.
        const metrics = pickMetrics(dto);
        if (Object.keys(metrics).length > 0) Object.assign(patch, metrics, { metricsUpdatedAt: new Date() });

        if (Object.keys(patch).length > 0) {
            await this.repo.update(postId, { ...patch, updatedById: user.id });
            this.auditService.logActionAsync(user.id, 'UPDATE_FANPAGE_POST', 'fanpage_post', postId, before, patch);
        }
        return this.withUsers(postId).getOneOrFail();
    }

    /**
     * B4 - dán nhiều link (tối đa 50). Kế hoạch tạo/bỏ qua do HÀM THUẦN `planBulkPosts` quyết định (cùng chuẩn trùng URL với tạo 1 bài);
     * phần hợp lệ ghi trong 1 transaction, phần sai/trùng trả theo từng dòng ở `skipped[]`.
     */
    async bulkCreate(fanpageId: number, dto: BulkCreateFanpagePostsDto, user: FanpageCaller) {
        await this.access.assertPageAccess(user, 'fanpage_posts.manage', fanpageId, 'Bạn không có quyền thêm bài đăng cho Page này');
        if (dto.postTypeId != null) await this.assertPostTypeUsable(dto.postTypeId);

        const existing = await this.repo.find({ where: { fanpageId }, select: ['id', 'url', 'postedDate'] });
        const plan = planBulkPosts(dto.urls, existing);

        let created: Array<Pick<FanpagePost, 'id' | 'url' | 'postedDate'>> = [];
        if (plan.valid.length > 0) {
            const entities = plan.valid.map((v) =>
                this.repo.create({
                    fanpageId,
                    url: normalizeFanpageUrl(v.url),
                    title: null,
                    postedDate: dto.postedDate ?? null,
                    postTypeId: dto.postTypeId ?? null,
                    note: null,
                    createdById: user.id,
                }),
            );
            const saved = await this.repo.manager.transaction((em) => em.getRepository(FanpagePost).save(entities));
            created = saved.map((p) => ({ id: p.id, url: p.url, postedDate: p.postedDate ?? null }));
            this.auditService.logActionAsync(user.id, 'BULK_CREATE_FANPAGE_POSTS', 'fanpage', fanpageId, null, {
                fanpageId,
                created: created.length,
                skipped: plan.skipped.length,
                postedDate: dto.postedDate ?? null,
                postTypeId: dto.postTypeId ?? null,
                postIds: created.map((c) => c.id),
            });
        }
        return { requested: dto.urls.length, created, skipped: plan.skipped as BulkPlanSkipped[] };
    }

    async remove(fanpageId: number, postId: number, user: FanpageCaller): Promise<{ deleted: true }> {
        await this.access.assertPageAccess(user, 'fanpage_posts.delete', fanpageId, 'Bạn không có quyền xoá bài đăng của Page này');
        const post = await this.findInPage(fanpageId, postId);
        const snap = { id: post.id, fanpageId, url: post.url, title: post.title, postedDate: post.postedDate, note: post.note };
        await this.repo.delete(postId);
        this.auditService.logActionAsync(user.id, 'DELETE_FANPAGE_POST', 'fanpage_post', postId, snap, null);
        return { deleted: true };
    }

    /** Loại bài phải tồn tại và chưa bị khoá (khoá = không chọn được cho bài mới / bài đổi sang loại này). */
    private async assertPostTypeUsable(postTypeId: number): Promise<void> {
        const type = await this.typeRepo.findOne({ where: { id: postTypeId }, select: ['id', 'name', 'isLocked'] });
        if (!type) throw new BadRequestException('Loại bài không tồn tại');
        if (type.isLocked) throw new BadRequestException(`Loại bài "${type.name}" đã bị khoá`);
    }

    /**
     * Chống trùng URL bài trong CÙNG Page (PLAN 6.4, A5): so theo khoá đã chuẩn hoá (bỏ #fragment, tham số theo dõi,
     * www/m., http/https, `/` cuối). Chỉ chặn ở service - KHÔNG thêm UNIQUE DB vì dữ liệu cũ có thể đã trùng.
     * 409 kèm `code` + `existingPostId` + `existingPostedDate` để FE hỏi "mở bài đó?".
     */
    private async assertPostUrlFree(fanpageId: number, url: string, exceptPostId?: number): Promise<void> {
        const key = postUrlKey(url);
        const rows = await this.repo.find({ where: { fanpageId }, select: ['id', 'url', 'postedDate'] });
        const dup = rows.find((r) => r.id !== exceptPostId && postUrlKey(r.url) === key);
        if (!dup) return;
        throw new ConflictException({
            code: 'FANPAGE_POST_DUPLICATE',
            message: dup.postedDate
                ? `Link này đã có ở bài ngày ${fmtVnDate(dup.postedDate)}`
                : 'Link này đã có ở một bài khác của Page (bài chưa có ngày đăng)',
            existingPostId: dup.id,
            existingPostedDate: dup.postedDate ?? null,
        });
    }

    /** Bài đăng PHẢI thuộc đúng Page trên URL - chặn sửa/xoá chéo Page qua ID đoán mò. */
    private async findInPage(fanpageId: number, postId: number): Promise<FanpagePost> {
        const post = await this.repo.findOne({ where: { id: postId, fanpageId } });
        if (!post) throw new NotFoundException('Không tìm thấy bài đăng này');
        return post;
    }
}