import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { User } from '../../database/entities/user.entity';
import { MediaSource } from '../../database/entities/media-source.entity';
import * as XLSX from 'xlsx';
import 'multer';
import { todayVnStr } from '../../common/utils/date-vn.util';

@Injectable()
export class CustomersImportService {
  constructor(private dataSource: DataSource) {}

  async importExcel(file: Express.Multer.File, userId: number) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file');
    }

    const validMimetypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/vnd.ms-excel'];
    if (!validMimetypes.includes(file.mimetype) && !file.originalname.match(/\.(xlsx|csv|xls)$/i)) {
      throw new BadRequestException('Chỉ chấp nhận file .xlsx hoặc .csv');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File không được vượt quá 5MB');
    }

    let workbook;
    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer' });
    } catch (e) {
      throw new BadRequestException('File không đúng định dạng Excel/CSV');
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];

    if (!rawData || rawData.length === 0) {
      throw new BadRequestException('File không có dữ liệu hợp lệ');
    }

    if (rawData.length > 1000) {
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

    // ⚠️ TỐI ƯU: trước đây check trùng SĐT trong chính file dùng
    // `validCustomers.some(c => c.phone === rawPhone)` bên trong vòng lặp
    // chính -> với N dòng, đây là vòng lặp lồng nhau O(N²) (so từng dòng
    // với tất cả dòng đã xử lý trước đó). File tối đa 1000 dòng nên không
    // đến mức treo server, nhưng là loop thừa không cần thiết -> đổi sang
    // tra cứu bằng Set (O(1) mỗi lần check) để không phải duyệt lại mảng.
    const phonesInValidCustomers = new Set<string>();
    const todayStr = todayVnStr();

    for (let i = 0; i < normalizedData.length; i++) {
      const row = normalizedData[i];
      const rowNum = i + 2; 

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

      phonesInValidCustomers.add(rawPhone);
      validCustomers.push({
         name,
         phone: rawPhone,
         email: email || null,
         source,
         campaign: campaign || null,
         status: ['closed', 'pending', 'potential', 'lost', 'inactive'].includes(status) ? status : 'pending',
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

    return {
      success: true,
      totalRows: normalizedData.length,
      successCount,
      skipCount,
      errors
    };
  }
}