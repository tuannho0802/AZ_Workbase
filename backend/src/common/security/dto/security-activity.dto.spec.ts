import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GetIpAccessDetailDto, UpdateSecurityConfigDto } from './security-activity.dto';

const errs = (cls: new () => object, plain: Record<string, unknown>) =>
  validateSync(plainToInstance(cls, plain)).map((e) => e.property);

describe('UpdateSecurityConfigDto.ipAccessLogApiEnabled (3.6.2)', () => {
  it.each([0, 1])('%s hợp lệ', (v) => expect(errs(UpdateSecurityConfigDto, { ipAccessLogApiEnabled: v })).toEqual([]));
  it.each([2, -1, 1.5, 'abc'])('%p bị từ chối (400)', (v) =>
    expect(errs(UpdateSecurityConfigDto, { ipAccessLogApiEnabled: v })).toContain('ipAccessLogApiEnabled'));
  it('bỏ trống hoặc null là hợp lệ (tuỳ chọn; service bỏ qua null)', () => {
    expect(errs(UpdateSecurityConfigDto, {})).toEqual([]);
    expect(errs(UpdateSecurityConfigDto, { ipAccessLogApiEnabled: null })).toEqual([]);
  });
});

describe('GetIpAccessDetailDto.outcome (3.6.2)', () => {
  it('chấp nhận outcome=api và các outcome cũ', () => {
    for (const o of ['api', 'success', 'refresh_failed']) expect(errs(GetIpAccessDetailDto, { outcome: o })).toEqual([]);
  });
  it('từ chối outcome lạ', () => expect(errs(GetIpAccessDetailDto, { outcome: 'hack' })).toContain('outcome'));
});
