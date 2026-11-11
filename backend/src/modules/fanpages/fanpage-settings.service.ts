import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../../database/entities/setting.entity';
import { FANPAGE_SILENT_DAYS_DEFAULT, parseSilentDays } from './helpers/fanpage-cadence.helper';

export const FANPAGE_SILENT_DAYS_KEY = 'fanpage.silent_days';
const CACHE_MS = 60_000;

/** Đọc setting của Fanpage (bảng `settings`) có cache ngắn trong bộ nhớ instance - list/overview gọi rất thường xuyên. */
@Injectable()
export class FanpageSettingsService {
    private silentCache: { value: number; at: number } | null = null;

    constructor(
        @InjectRepository(Setting)
        private readonly repo: Repository<Setting>,
    ) { }

    /** Ngưỡng "im lặng" (ngày). Setting thiếu/hỏng -> mặc định 3. */
    async getSilentDays(): Promise<number> {
        const now = Date.now();
        if (this.silentCache && now - this.silentCache.at < CACHE_MS) return this.silentCache.value;
        let value = FANPAGE_SILENT_DAYS_DEFAULT;
        try {
            const row = await this.repo.findOne({ where: { key: FANPAGE_SILENT_DAYS_KEY } });
            value = parseSilentDays(row?.value);
        } catch {
            // Bảng settings chưa sẵn sàng / lỗi tạm: dùng mặc định, KHÔNG làm sập danh sách Page.
        }
        this.silentCache = { value, at: now };
        return value;
    }

    /** Xoá cache (dùng khi có chỗ ghi setting, hoặc trong test). */
    invalidate(): void {
        this.silentCache = null;
    }
}