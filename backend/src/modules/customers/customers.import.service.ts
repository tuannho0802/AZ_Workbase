import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { User } from '../../database/entities/user.entity';
import { MediaSource } from '../../database/entities/media-source.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import 'multer';
import { readImportFile, IMPORT_MAX_FILE_BYTES, IMPORT_MAX_ROWS } from './customers-import-reader.util';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { AuditService } from '../audit/audit.service';
import { UtmsService } from '../utms/utms.service';
import { Utm } from '../../database/entities/utm.entity';
import { normalizeSearchableText } from '../../common/utils/text-normalize.util';

@Injectable()
export class CustomersImportService {
  constructor(
    private dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly utmsService: UtmsService,
  ) {}

  async importExcel(file: Express.Multer.File, userId: number) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file');
    }

    // [AGENT] OLD CODE (giữ lại để rollback): đọc bằng SheetJS `xlsx` (không còn bản vá)
    // const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    // const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }) as any[];
    // [AGENT] NEW CODE: exceljs (.xlsx) + papaparse (.csv); từ chối .xls — xem customers-import-reader.util.ts
    if (file.size > IMPORT_MAX_FILE_BYTES) {
      throw new BadRequestException('File không được vượt quá 5MB');
    }

    const { rows: rawData, rowNumbers } = await readImportFile(file);

    if (!rawData || rawData.length === 0) {
      throw new BadRequestException('File không có dữ liệu hợp lệ');
    }

    if (rawData.length > IMPORT_MAX_ROWS) {
      throw new BadRequestException('Tối đa 1000 dòng mỗi lần nhập');
    }

    // Normalizing headers
    const normalizedData = rawData.map((row: any) => {
      const newRow: any = {};
      for (const key in row) {
        newRow[key.trim().toLowerCase()] = typeof row[key] === 'string' ? row[key].trim() : row[key];
      }
      return newRow;
    });

    const requiredHeaders = ['họ và tên', 'số điện thoại'];
    const firstRowKeys = Object.keys(normalizedData[0] || {});
    const missingHeaders = requiredHeaders.filter(h => !firstRowKeys.includes(h));
    if (missingHeaders.length > 0) {
      throw new BadRequestException(`File thiếu cột bắt buộc: ${missingHeaders.join(', ')}`);
    }

    const userRepo = this.dataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: userId });
    if (!user) throw new BadRequestException('Không tìm thấy thông tin user thực hiện');

    const errors: any[] = [];
    const validCustomers: any[] = [];
    let skipCount = 0;
    
    const phoneRegex = /^(09|08|07|03|05)[0-9]{8}$/;
    
    const phonesInFile = normalizedData.map(r => r['số điện thoại']).filter(p => !!p).map(p => String(p).replace(/[^0-9]/g, ''));
    let existingPhones = new Set<string>();
    
    if (phonesInFile.length > 0) {
      const customersRepo = this.dataSource.getRepository(Customer);
      const existing = await customersRepo.find({
        where: { phone: In(phonesInFile) },
        select: ['phone'],
        withDeleted: true
      });
      existingPhones = new Set(existing.map(c => c.phone as string));
    }

    // ⚠️ Trước đây là mảng hardcode `['Facebook','TikTok',...]` - không biết
    // gì về các nguồn admin tự thêm qua /nguon-media. Giờ lấy TÊN SỐNG từ
    // bảng media_sources (không cần thêm code mỗi lần admin thêm nguồn mới).
    // Fallback về "Other" khi nguồn trong file không khớp/rỗng - "Other"
    // luôn tồn tại vì được seed sẵn (xem migration CreateMediaSources), trừ
    // khi admin lỡ xoá nó, nên giữ nguyên logic fallback cứng "Other" ở đây
    // cho an toàn thay vì fallback theo dữ liệu động dễ vỡ khi bảng rỗng.
    const mediaSourceRepo = this.dataSource.getRepository(MediaSource);
    const validSources = (await mediaSourceRepo.find({ select: ['name'] })).map((s) => s.name);

    // ⚠️ FIX BUG THẬT (Setup dynamic Customer Status -
    // CreateCustomerStatuses1781400000000): trước đây mảng hardcode
    // `['closed','pending','potential','lost','inactive']` - status nào
    // admin tự thêm sau qua "/quan-ly-status-khach" sẽ bị import Excel âm
    // thầm ghi đè về 'pending' dù giá trị trong file khớp đúng 1 status hợp
    // lệ. Giờ lấy CODE SỐNG từ bảng `customer_statuses`, mirror đúng cách
    // đã fix cho `source`/`media_sources` ở trên. Fallback 'pending' khi cột
    // "Trạng thái" trong file rỗng/không khớp bất kỳ code nào - 'pending'
    // luôn tồn tại vì là status mặc định seed sẵn, trừ khi admin lỡ xoá
    // (không thể vì is_system chặn xoá - xem CustomerStatusesService.remove()).
    const customerStatusRepo = this.dataSource.getRepository(CustomerStatus);
    const validStatusCodes = (await customerStatusRepo.find({ select: ['code'] })).map((s) => s.code);

    // ⚠️ TỐI ƯU: trước đây check trùng SĐT trong chính file dùng
    // `validCustomers.some(c => c.phone === rawPhone)` bên trong vòng lặp
    // chính -> với N dòng, đây là vòng lặp lồng nhau O(N²) (so từng dòng
    // với tất cả dòng đã xử lý trước đó). File tối đa 1000 dòng nên không
    // đến mức treo server, nhưng là loop thừa không cần thiết -> đổi sang
    // tra cứu bằng Set (O(1) mỗi lần check) để không phải duyệt lại mảng.
    const phonesInValidCustomers = new Set<string>();
    // UTM (PLAN case 7): resolve theo tên (CI+AI), gom theo tên để tạo tối đa 1 lần cho cả file.
    const utmCache = new Map<string, { utmId: number; campaign: string } | { error: string }>();
    const createdUtms: string[] = [];
    const utmRepo = this.dataSource.getRepository(Utm);
    const todayStr = todayVnStr();

    for (let i = 0; i < normalizedData.length; i++) {
      const row = normalizedData[i];
      const rowNum = rowNumbers[i]; // số dòng thật trong file (đúng cả khi có dòng trống xen giữa)

      const rawPhone = row['số điện thoại'] ? String(row['số điện thoại']).replace(/[^0-9]/g, '') : '';
      const name = row['họ và tên'];
      const email = row['email'];
      let source = row['nguồn'];
      const campaign = row['chiến dịch'];
      const status = row['trạng thái'] || 'pending';
      const broker = row['broker'];
      const rawDate = row['ngày chốt'];
      const note = row['ghi chú'];

      if (!name) {
        errors.push({ row: rowNum, phone: rawPhone, name: name || '', reason: 'Họ tên không được để trống' });
        skipCount++;
        continue;
      }

      if (!rawPhone || !phoneRegex.test(rawPhone)) {
        errors.push({ row: rowNum, phone: rawPhone, name, reason: 'Số điện thoại trống hoặc không đúng định dạng Việt Nam' });
        skipCount++;
        continue;
      }

      if (existingPhones.has(rawPhone)) {
        errors.push({ row: rowNum, phone: rawPhone, name, reason: 'Số điện thoại đã tồn tại trong hệ thống' });
        skipCount++;
        continue;
      }
      
      const isDuplicateInFile = phonesInValidCustomers.has(rawPhone);
      if (isDuplicateInFile) {
        errors.push({ row: rowNum, phone: rawPhone, name, reason: 'Số điện thoại bị trùng lặp trong chính file tải lên' });
        skipCount++;
        continue;
      }

      if (source && !validSources.includes(source)) {
        source = 'Other';
      } else if (!source) {
        source = 'Other';
      }

      let closedDateObj: Date | null = null;
      if (rawDate) {
        const parts = String(rawDate).split('/');
        if (parts.length === 3) {
          const d = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const y = parseInt(parts[2], 10);
          const parsed = new Date(y, m, d);
          if (!isNaN(parsed.getTime())) {
            closedDateObj = parsed;
          }
        }
      }

      // Logic cho Ngày nhập data
      const rawInputDate = row['ngày nhập data'];
      let inputDateObj: Date = new Date(new Date().getTime() + (7 * 60 * 60 * 1000)); // Default today UTC+7
      if (rawInputDate) {
        const parts = String(rawInputDate).split('/');
        if (parts.length === 3) {
          const d = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const y = parseInt(parts[2], 10);
          const parsed = new Date(y, m, d);
          if (!isNaN(parsed.getTime())) {
            inputDateObj = parsed;
          }
        }
      }

      // Không cho phép "Ngày nhập data" lớn hơn ngày hiện tại (giờ VN,
      // GMT+7) — cùng quy tắc áp dụng cho form thêm/sửa thủ công.
      const inputDateStr = inputDateObj.toISOString().split('T')[0];
      if (inputDateStr > todayStr) {
        errors.push({
          row: rowNum,
          phone: rawPhone,
          name,
          reason: `Ngày nhập data (${rawInputDate || inputDateStr}) không được lớn hơn ngày hiện tại`,
        });
        skipCount++;
        continue;
      }

      // UTM: chưa có + có `utms.create` -> tạo; không có quyền / UTM khoá / restricted -> lỗi dòng.
      let utmId: number | null = null;
      let campaignSnapshot: string | null = campaign ? String(campaign) : null;
      const utmName = normalizeSearchableText(campaign ? String(campaign) : null);
      if (utmName) {
        const key = utmName.toLowerCase();
        let hit = utmCache.get(key);
        if (!hit) {
          const existed = await utmRepo.findOne({ where: { name: utmName }, select: ['id'] });
          try {
            const r = await this.utmsService.resolveForCustomer({ campaign: utmName }, user);
            hit = r && r.utmId != null ? { utmId: r.utmId, campaign: r.campaign as string } : { error: 'UTM không hợp lệ' };
            if (!existed && r?.utmId != null) createdUtms.push(r.campaign as string);
          } catch (e: any) {
            hit = { error: e?.message || 'UTM không hợp lệ' };
          }
          utmCache.set(key, hit);
        }
        if ('error' in hit) {
          errors.push({ row: rowNum, phone: rawPhone, name, reason: `UTM "${utmName}": ${hit.error}` });
          skipCount++;
          continue;
        }
        utmId = hit.utmId;
        campaignSnapshot = hit.campaign;
      } else {
        campaignSnapshot = null;
      }

      phonesInValidCustomers.add(rawPhone);
      validCustomers.push({
         name,
         phone: rawPhone,
         email: email || null,
         source,
         campaign: campaignSnapshot,
         utmId,
        status: validStatusCodes.includes(status) ? status : 'pending',
         broker: broker || null,
         closedDate: closedDateObj,
         inputDate: inputDateObj,
         assignedDate: (user.role === 'employee') ? inputDateObj : null, // Nếu sales import thì tự nhận luôn
         note: note || null,
         departmentId: user.departmentId,
         salesUserId: user.id,
         createdBy: user.id
      });
    }

    let successCount = 0;
    if (validCustomers.length > 0) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        await queryRunner.manager.insert(Customer, validCustomers);
        await queryRunner.commitTransaction();
        successCount = validCustomers.length;
      } catch (err: any) {
        await queryRunner.rollbackTransaction();
        throw new BadRequestException('Lỗi lưu CSDL: ' + err.message);
      } finally {
        await queryRunner.release();
      }
    }

    // [AUDIT] Import Excel chèn hàng loạt trực tiếp bằng `manager.insert()`,
    // KHÔNG đi qua CustomersService.create() nên không có log CREATE_CUSTOMER
    // từng dòng - ghi 1 dòng tổng kết cho cả đợt (ai import, file nào, bao
    // nhiêu dòng vào/bỏ qua). `importedPhones` (SĐT là khoá duy nhất, đã lọc
    // trùng) giúp truy ngược đúng những khách hàng nào thuộc đợt import này.
    // Chỉ ghi khi thật sự có dòng được chèn vào DB.
    if (successCount > 0) {
      this.auditService.logActionAsync(userId, 'IMPORT_CUSTOMERS', 'customer', 0, null, {
        fileName: file.originalname,
        fileSizeBytes: file.size,
        totalRows: normalizedData.length,
        successCount,
        skipCount,
        errorCount: errors.length,
        importedPhones: validCustomers.map((c) => c.phone),
      });
    }

    return {
      success: true,
      totalRows: normalizedData.length,
      successCount,
      skipCount,
      errors,
      createdUtms,
    };
  }
}