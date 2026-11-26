import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { CreatePeriodicTaskDto } from './create-periodic-task.dto';
import { UpdatePeriodicTaskDto } from './update-periodic-task.dto';

/** Cùng cấu hình ValidationPipe với main.ts. */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

const base = { title: 'T', periodType: 'daily', periodStartDate: '2026-11-26', periodEndDate: '2026-11-26', primaryAssigneeId: 1 };
const create = (extra: Record<string, unknown>) => pipe.transform({ ...base, ...extra }, { type: 'body', metatype: CreatePeriodicTaskDto });
const update = (body: Record<string, unknown>) => pipe.transform(body, { type: 'body', metatype: UpdatePeriodicTaskDto });

describe('productLink (Link sản phẩm)', () => {
  it('không gửi / rỗng / null đều hợp lệ (không bắt buộc, rỗng = xoá)', async () => {
    await expect(create({})).resolves.toBeDefined();
    await expect(create({ productLink: '' })).resolves.toMatchObject({ productLink: '' });
    await expect(update({ productLink: null })).resolves.toMatchObject({ productLink: null });
  });
  it('nhận http/https và tự trim', async () => {
    await expect(create({ productLink: '  https://drive.google.com/file/d/1/view  ' })).resolves.toMatchObject({ productLink: 'https://drive.google.com/file/d/1/view' });
    await expect(update({ productLink: 'http://a.com/x' })).resolves.toMatchObject({ productLink: 'http://a.com/x' });
  });
  it.each(['javascript:alert(1)', 'ftp://a.com/x', 'drive.google.com/x', 'https://a.com/x y', 'data:text/html,hi'])('từ chối "%s" (400)', async (bad) => {
    await expect(create({ productLink: bad })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('từ chối link dài hơn 1000 ký tự', async () => {
    await expect(create({ productLink: 'https://a.com/' + 'x'.repeat(1000) })).rejects.toBeInstanceOf(BadRequestException);
  });
});
