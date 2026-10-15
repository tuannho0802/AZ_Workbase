import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { isPasswordPolicyValid } from './password-policy';
import { RegisterDto } from '../../modules/auth/dto/register.dto';
import { CreateUserDto } from '../../modules/users/dto/create-user.dto';
import { ResetPasswordDto } from '../../modules/users/dto/reset-password.dto';
import { ChangePasswordDto } from '../../modules/users/dto/change-password.dto';
import { ChangePasswordRequiredDto } from '../../modules/auth/dto/change-password-required.dto';

const SEVEN = 'Abcd@12'; // 7 ký tự - phải bị từ chối ở MỌI nơi
const OK = 'Abcd@1234';

const errsOn = async (cls: any, plain: any, prop: string) =>
  (await validate(plainToInstance(cls, plain))).filter((e) => e.property === prop);

describe('password-policy (C1)', () => {
  it('isPasswordPolicyValid', () => {
    expect(isPasswordPolicyValid(SEVEN)).toBe(false);
    expect(isPasswordPolicyValid('abcdefgh1@')).toBe(false); // thiếu hoa
    expect(isPasswordPolicyValid(OK)).toBe(true);
  });

  const base = { name: 'Nguyen A', email: 'a@b.co', role: 'employee' };
  it.each([
    ['RegisterDto', RegisterDto, (p: string) => ({ ...base, password: p }), 'password'],
    ['CreateUserDto', CreateUserDto, (p: string) => ({ ...base, password: p }), 'password'],
    ['ResetPasswordDto', ResetPasswordDto, (p: string) => ({ newPassword: p }), 'newPassword'],
    ['ChangePasswordDto', ChangePasswordDto, (p: string) => ({ currentPassword: 'x', newPassword: p, confirmNewPassword: p }), 'newPassword'],
    ['ChangePasswordRequiredDto', ChangePasswordRequiredDto, (p: string) => ({ currentPassword: 'x', newPassword: p, confirmNewPassword: p }), 'newPassword'],
  ])('%s: 7 ký tự bị từ chối, hợp lệ được chấp nhận', async (_n, cls, mk, prop) => {
    expect((await errsOn(cls, mk(SEVEN), prop)).length).toBeGreaterThan(0);
    expect(await errsOn(cls, mk(OK), prop)).toHaveLength(0);
  });
});
