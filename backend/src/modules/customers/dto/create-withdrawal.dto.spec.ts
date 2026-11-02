import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateWithdrawalDto } from './create-withdrawal.dto';
import { UpdateWithdrawalNoteDto } from './update-withdrawal-note.dto';

// Cấu hình y hệt main.ts (whitelist + forbidNonWhitelisted + transform).
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const create = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreateWithdrawalDto });
const updateNote = (body: unknown) => pipe.transform(body, { type: 'body', metatype: UpdateWithdrawalNoteDto });
const ok = { amount: 100.5, withdrawalDate: '2026-11-02' };

describe('CreateWithdrawalDto', () => {
  it('hợp lệ tối thiểu', async () => {
    await expect(create(ok)).resolves.toMatchObject(ok);
  });
  it.each([0, -5, 1000000000])('amount %p -> 400', async (amount) => {
    await expect(create({ ...ok, amount })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('amount quá 2 chữ số thập phân -> 400', async () => {
    await expect(create({ ...ok, amount: 1.005 })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('amount là chuỗi -> 400', async () => {
    await expect(create({ ...ok, amount: '100' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('ngày sai định dạng -> 400', async () => {
    await expect(create({ ...ok, withdrawalDate: 'abc' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('broker > 100 / note > 1000 ký tự -> 400', async () => {
    await expect(create({ ...ok, broker: 'a'.repeat(101) })).rejects.toBeInstanceOf(BadRequestException);
    await expect(create({ ...ok, note: 'a'.repeat(1001) })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('field lạ (vd customerId, createdById) -> 400', async () => {
    await expect(create({ ...ok, createdById: 1 })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('UpdateWithdrawalNoteDto', () => {
  it('chỉ note (kể cả rỗng) -> hợp lệ', async () => {
    await expect(updateNote({ note: 'x' })).resolves.toMatchObject({ note: 'x' });
    await expect(updateNote({ note: '' })).resolves.toMatchObject({ note: '' });
  });
  it('gửi amount/withdrawalDate/broker -> 400', async () => {
    await expect(updateNote({ amount: 1 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(updateNote({ withdrawalDate: '2026-01-01' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(updateNote({ broker: 'XM' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
