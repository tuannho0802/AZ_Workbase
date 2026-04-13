import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { User } from '../../database/entities/user.entity';
import * as XLSX from 'xlsx';

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

    const validSources = ['Facebook','TikTok','Google','Instagram','LinkedIn','Other'];

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
      
      const isDuplicateInFile = validCustomers.some(c => c.phone === rawPhone);
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
