import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FanpagePost } from '../../database/entities/fanpage-post.entity';
import { AuditService } from '../audit/audit.service';
import { CreateFanpagePostDto, UpdateFanpagePostDto } from './dto/fanpage-post.dto';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';
import { normalizeFanpageUrl } from './fanpages.service';

const blankToNull = (v: string | null | undefined): string | null => (v == null || v.trim() === '' ? null : v.trim());

@Injectable()
export class FanpagePostsService {
    constructor(
        @InjectRepository(FanpagePost)
        private readonly repo: Repository<FanpagePost>,
        private readonly access: FanpageAccessService,
        private readonly auditService: AuditService,
    ) { }

    private withUsers(id?: number) {
        const qb = this.repo
            .createQueryBuilder('p')
            .leftJoin('p.createdBy', 'createdBy')
            .addSelect(['createdBy.id', 'createdBy.name'])
            .leftJoin('p.updatedBy', 'updatedBy')
            .addSelect(['updatedBy.id', 'updatedBy.name']);
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
        const saved = await this.repo.save(
            this.repo.create({
                fanpageId,
                url: normalizeFanpageUrl(dto.url),
                title: blankToNull(dto.title),
                postedDate: dto.postedDate ?? null,
                note: blankToNull(dto.note),
                createdById: user.id,
            }),
        );
        this.auditService.logActionAsync(user.id, 'CREATE_FANPAGE_POST', 'fanpage_post', saved.id, null, {
            id: saved.id,
            fanpageId,
            url: saved.url,
            title: saved.title,
            postedDate: saved.postedDate,
        });
        return this.withUsers(saved.id).getOneOrFail();
    }

    async update(fanpageId: number, postId: number, dto: UpdateFanpagePostDto, user: FanpageCaller): Promise<FanpagePost> {
        await this.access.assertPageAccess(user, 'fanpage_posts.manage', fanpageId, 'Bạn không có quyền sửa bài đăng của Page này');
        const post = await this.findInPage(fanpageId, postId);
        const before = { url: post.url, title: post.title, postedDate: post.postedDate, note: post.note };

        const patch: Partial<FanpagePost> = {};
        if (dto.url !== undefined) patch.url = normalizeFanpageUrl(dto.url);
        if (dto.title !== undefined) patch.title = blankToNull(dto.title);
        if (dto.postedDate !== undefined) patch.postedDate = dto.postedDate;
        if (dto.note !== undefined) patch.note = blankToNull(dto.note);

        if (Object.keys(patch).length > 0) {
            await this.repo.update(postId, { ...patch, updatedById: user.id });
            this.auditService.logActionAsync(user.id, 'UPDATE_FANPAGE_POST', 'fanpage_post', postId, before, patch);
        }
        return this.withUsers(postId).getOneOrFail();
    }

    async remove(fanpageId: number, postId: number, user: FanpageCaller): Promise<{ deleted: true }> {
        await this.access.assertPageAccess(user, 'fanpage_posts.delete', fanpageId, 'Bạn không có quyền xoá bài đăng của Page này');
        const post = await this.findInPage(fanpageId, postId);
        const snap = { id: post.id, fanpageId, url: post.url, title: post.title, postedDate: post.postedDate, note: post.note };
        await this.repo.delete(postId);
        this.auditService.logActionAsync(user.id, 'DELETE_FANPAGE_POST', 'fanpage_post', postId, snap, null);
        return { deleted: true };
    }

    /** Bài đăng PHẢI thuộc đúng Page trên URL - chặn sửa/xoá chéo Page qua ID đoán mò. */
    private async findInPage(fanpageId: number, postId: number): Promise<FanpagePost> {
        const post = await this.repo.findOne({ where: { id: postId, fanpageId } });
        if (!post) throw new NotFoundException('Không tìm thấy bài đăng này');
        return post;
    }
}