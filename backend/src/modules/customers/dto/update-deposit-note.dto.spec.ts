import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateDepositNoteDto } from './update-deposit-note.dto';

// Cấu hình y hệt main.ts (whitelist + forbidNonWhitelisted + transform).
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const run = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: UpdateDepositNoteDto });

describe('UpdateDepositNoteDto - chỉ cho sửa ghi chú', () => {
  it('chỉ có note -> hợp lệ', async () => {
    await expect(run({ note: 'ghi chú' })).resolves.toMatchObject({ note: 'ghi chú' });
  });

  it('cho phép chuỗi rỗng (dùng để xoá ghi chú)', async () => {
    await expect(run({ note: '' })).resolves.toMatchObject({ note: '' });
  });

  it('gửi kèm amount -> 400 (số tiền cố định, không sửa được)', async () => {
    await expect(run({ note: 'x', amount: 999 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('gửi depositDate/broker -> 400', async () => {
    await expect(run({ depositDate: '2026-01-01' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run({ broker: 'XM' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('note > 1000 ký tự -> 400', async () => {
    await expect(run({ note: 'a'.repeat(1001) })).rejects.toBeInstanceOf(BadRequestException);
  });
});
