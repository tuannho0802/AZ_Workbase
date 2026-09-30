import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UtmStatsCustomersQueryDto, UtmStatsQueryDto } from './utm-stats-query.dto';

const parse = async <T extends object>(cls: new () => T, plain: Record<string, unknown>) => {
  const obj = plainToInstance(cls, plain);
  return { obj, errors: await validate(obj, { whitelist: true, forbidNonWhitelisted: true }) };
};

describe('UtmStatsQueryDto (bộ lọc nhanh)', () => {
  it('utmIds dạng "1,2,3" -> [1,2,3]', async () => {
    const { obj, errors } = await parse(UtmStatsQueryDto, { utmIds: '1,2,3' });
    expect(errors).toHaveLength(0);
    expect(obj.utmIds).toEqual([1, 2, 3]);
  });

  it('utmIds lặp key (mảng) và có khoảng trắng', async () => {
    const { obj, errors } = await parse(UtmStatsQueryDto, { utmIds: ['4', ' 5 '] });
    expect(errors).toHaveLength(0);
    expect(obj.utmIds).toEqual([4, 5]);
  });

  it('utmIds rỗng -> [] (coi như không lọc)', async () => {
    const { obj, errors } = await parse(UtmStatsQueryDto, { utmIds: '' });
    expect(errors).toHaveLength(0);
    expect(obj.utmIds).toEqual([]);
  });

  it('utmIds chứa giá trị không phải số / <1 -> lỗi validate', async () => {
    expect((await parse(UtmStatsQueryDto, { utmIds: '1,abc' })).errors.length).toBeGreaterThan(0);
    expect((await parse(UtmStatsQueryDto, { utmIds: '0' })).errors.length).toBeGreaterThan(0);
  });

  it('primaryManagerId / secondaryManagerId ép kiểu số', async () => {
    const { obj, errors } = await parse(UtmStatsQueryDto, { primaryManagerId: '5', secondaryManagerId: '7' });
    expect(errors).toHaveLength(0);
    expect(obj.primaryManagerId).toBe(5);
    expect(obj.secondaryManagerId).toBe(7);
  });

  it('DTO khách: kế thừa bộ lọc + page/limit (limit tối đa 50) + status/search', async () => {
    const ok = await parse(UtmStatsCustomersQueryDto, { utmIds: '1', page: '2', limit: '20', status: 'closed', search: 'An', from: '2026-09-01', to: '2026-09-30' });
    expect(ok.errors).toHaveLength(0);
    expect(ok.obj).toMatchObject({ utmIds: [1], page: 2, limit: 20 });
    expect((await parse(UtmStatsCustomersQueryDto, { limit: '51' })).errors.length).toBeGreaterThan(0);
  });
});
