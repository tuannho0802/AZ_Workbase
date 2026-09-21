import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaSource } from '../../database/entities/media-source.entity';
import { Customer } from '../../database/entities/customer.entity';
import { CreateMediaSourceDto } from './dto/create-media-source.dto';
import { UpdateMediaSourceDto } from './dto/update-media-source.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class MediaSourcesService {
    constructor(
        @InjectRepository(MediaSource)
        private readonly mediaSourceRepo: Repository<MediaSource>,
        @InjectRepository(Customer)
        private readonly customerRepo: Repository<Customer>,
        private readonly auditService: AuditService,
    ) { }

    /**
     * @param activeOnly true = chỉ trả về nguồn CHƯA bị khoá (dùng cho dropdown
     * "Thêm khách hàng mới"). false/undefined = trả về TẤT CẢ (dùng cho trang
     * quản lý /nguon-media - admin cần thấy cả nguồn đã khoá để mở lại được).
     */
    async findAll(activeOnly = false): Promise<MediaSource[]> {
        return this.mediaSourceRepo.find({
            where: activeOnly ? { isLocked: false } : {},
            order: { sortOrder: 'ASC', id: 'ASC' },
        });
    }

    async create(dto: CreateMediaSourceDto, callerId?: number): Promise<MediaSource> {
        const existing = await this.mediaSourceRepo.findOne({ where: { name: dto.name } });
        if (existing) {
            throw new ConflictException(`Nguồn "${dto.name}" đã tồn tại`);
        }
        const created = this.mediaSourceRepo.create({
            name: dto.name,
            color: dto.color ?? '#1677ff',
            sortOrder: dto.sortOrder ?? 0,
        });
        const saved = await this.mediaSourceRepo.save(created);
        if (callerId) {
            this.auditService.logActionAsync(callerId, 'CREATE_MEDIA_SOURCE', 'media_source', saved.id, null, saved);
        }
        return saved;
    }

    async update(id: number, dto: UpdateMediaSourceDto, callerId?: number): Promise<MediaSource> {
        const source = await this.mediaSourceRepo.findOne({ where: { id } });
        if (!source) {
            throw new NotFoundException('Không tìm thấy nguồn này');
        }
        const before = { ...source };

        if (dto.name && dto.name !== source.name) {
            const existing = await this.mediaSourceRepo.findOne({ where: { name: dto.name } });
            if (existing) {
                throw new ConflictException(`Nguồn "${dto.name}" đã tồn tại`);
            }
            // ⚠️ ĐỔI TÊN nguồn KHÔNG tự cập nhật lại các customer đang dùng tên cũ
            // (cột `customers.source` là free-text, lưu nguyên chuỗi tại thời điểm
            // tạo customer, không có FK trỏ về media_sources.id). Nghĩa là sau khi
            // đổi tên, các customer cũ vẫn hiển thị tên NGUỒN CŨ, không tự đổi
            // theo. Đây là đánh đổi có chủ đích: đơn giản hơn nhiều so với phải
            // đồng bộ ngược hàng loạt customer mỗi lần đổi tên nguồn, và tên nguồn
            // hiếm khi cần đổi sau khi đã có dữ liệu dùng nó (nên "Khoá" + tạo
            // nguồn mới thường hợp lý hơn "Đổi tên" nếu nguồn đã có nhiều customer).
            source.name = dto.name;
        }
        if (dto.color !== undefined) {
            source.color = dto.color;
        }
        if (dto.sortOrder !== undefined) {
            source.sortOrder = dto.sortOrder;
        }

        const saved = await this.mediaSourceRepo.save(source);
        if (callerId) {
            this.auditService.logActionAsync(callerId, 'UPDATE_MEDIA_SOURCE', 'media_source', saved.id, before, saved);
        }
        return saved;
    }

    async setLocked(id: number, isLocked: boolean, callerId?: number): Promise<MediaSource> {
        const source = await this.mediaSourceRepo.findOne({ where: { id } });
        if (!source) {
            throw new NotFoundException('Không tìm thấy nguồn này');
        }
        const before = { id: source.id, name: source.name, isLocked: source.isLocked };
        source.isLocked = isLocked;
        const saved = await this.mediaSourceRepo.save(source);
        if (callerId) {
            this.auditService.logActionAsync(
                callerId,
                isLocked ? 'LOCK_MEDIA_SOURCE' : 'UNLOCK_MEDIA_SOURCE',
                'media_source',
                saved.id,
                before,
                { id: saved.id, name: saved.name, isLocked: saved.isLocked },
            );
        }
        return saved;
    }

    async remove(id: number, callerId?: number): Promise<{ deleted: true }> {
        const source = await this.mediaSourceRepo.findOne({ where: { id } });
        if (!source) {
            throw new NotFoundException('Không tìm thấy nguồn này');
        }

        // Bảo vệ: không cho xoá cứng nếu đang có customer dùng nguồn này - vì
        // cột source là free-text (không FK), xoá vẫn để lại chuỗi "mồ côi"
        // trên các customer cũ - dữ liệu KHÔNG hỏng (vẫn hiển thị đúng tên) chỉ
        // là user không thể chọn lại tên đó cho customer MỚI khi cần lọc/thêm
        // nữa. Chặn ở đây để tránh xoá nhầm nguồn quan trọng - gợi ý dùng
        // "Khoá" thay vì "Xoá" khi nguồn đã có dữ liệu gắn vào.
        const inUseCount = await this.customerRepo.count({ where: { source: source.name } });
        if (inUseCount > 0) {
            throw new BadRequestException(
                `Không thể xoá "${source.name}" vì đang có ${inUseCount} khách hàng dùng nguồn này. Hãy dùng chức năng Khoá thay vì Xoá.`,
            );
        }

        // [AUDIT] chụp snapshot TRƯỚC remove() - TypeORM xoá `id` khỏi entity sau khi xoá.
        const snapshot = { ...source };
        await this.mediaSourceRepo.remove(source);
        if (callerId) {
            this.auditService.logActionAsync(callerId, 'DELETE_MEDIA_SOURCE', 'media_source', id, snapshot, null);
        }
        return { deleted: true };
    }
}