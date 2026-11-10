import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FanpageNote } from '../../database/entities/fanpage-note.entity';
import { AuditService } from '../audit/audit.service';
import { FanpageNoteDto } from './dto/fanpage-post.dto';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';

@Injectable()
export class FanpageNotesService {
    constructor(
        @InjectRepository(FanpageNote)
        private readonly repo: Repository<FanpageNote>,
        private readonly access: FanpageAccessService,
        private readonly auditService: AuditService,
    ) { }

    private withUsers(id?: number) {
        const qb = this.repo
            .createQueryBuilder('n')
            .leftJoin('n.createdBy', 'createdBy')
            .addSelect(['createdBy.id', 'createdBy.name'])
            .leftJoin('n.updatedBy', 'updatedBy')
            .addSelect(['updatedBy.id', 'updatedBy.name']);
        if (id != null) qb.where('n.id = :id', { id });
        return qb;
    }

    async list(fanpageId: number, user: FanpageCaller): Promise<FanpageNote[]> {
        await this.access.assertPageAccess(user, 'fanpages.view', fanpageId, 'Bạn không có quyền xem Page này');
        return this.withUsers()
            .where('n.fanpageId = :fanpageId', { fanpageId })
            .orderBy('n.createdAt', 'DESC')
            .addOrderBy('n.id', 'DESC')
            .getMany();
    }

    async create(fanpageId: number, dto: FanpageNoteDto, user: FanpageCaller): Promise<FanpageNote> {
        await this.access.assertPageAccess(user, 'fanpage_notes.manage', fanpageId, 'Bạn không có quyền ghi chú cho Page này');
        const saved = await this.repo.save(this.repo.create({ fanpageId, note: dto.note.trim(), createdById: user.id }));
        this.auditService.logActionAsync(user.id, 'CREATE_FANPAGE_NOTE', 'fanpage_note', saved.id, null, {
            id: saved.id,
            fanpageId,
            note: saved.note,
        });
        return this.withUsers(saved.id).getOneOrFail();
    }

    async update(fanpageId: number, noteId: number, dto: FanpageNoteDto, user: FanpageCaller): Promise<FanpageNote> {
        await this.access.assertPageAccess(user, 'fanpage_notes.manage', fanpageId, 'Bạn không có quyền sửa ghi chú của Page này');
        const note = await this.findInPage(fanpageId, noteId);
        const next = dto.note.trim();
        if (next !== note.note) {
            await this.repo.update(noteId, { note: next, updatedById: user.id, editCount: note.editCount + 1 });
            this.auditService.logActionAsync(
                user.id,
                'UPDATE_FANPAGE_NOTE',
                'fanpage_note',
                noteId,
                { note: note.note },
                { note: next },
            );
        }
        return this.withUsers(noteId).getOneOrFail();
    }

    async remove(fanpageId: number, noteId: number, user: FanpageCaller): Promise<{ deleted: true }> {
        await this.access.assertPageAccess(user, 'fanpage_notes.delete', fanpageId, 'Bạn không có quyền xoá ghi chú của Page này');
        const note = await this.findInPage(fanpageId, noteId);
        const snap = { id: note.id, fanpageId, note: note.note };
        await this.repo.delete(noteId);
        this.auditService.logActionAsync(user.id, 'DELETE_FANPAGE_NOTE', 'fanpage_note', noteId, snap, null);
        return { deleted: true };
    }

    private async findInPage(fanpageId: number, noteId: number): Promise<FanpageNote> {
        const note = await this.repo.findOne({ where: { id: noteId, fanpageId } });
        if (!note) throw new NotFoundException('Không tìm thấy ghi chú này');
        return note;
    }
}