import { describe, it, expect } from 'vitest';
import { getJwtExpMs, isAccessTokenExpiring } from './token-expiry';
import { makeJwt } from './__test-helpers__/makeJwt';

const NOW = 1_800_000_000_000; // ms

describe('token-expiry', () => {
  it('đọc đúng exp (giây -> ms), kể cả payload base64url có ký tự - _ và thiếu padding', () => {
    expect(getJwtExpMs(makeJwt(1_800_003_600))).toBe(1_800_003_600_000);
    expect(getJwtExpMs(makeJwt(1_800_003_600, { name: 'Nguyễn Văn Ạ ???>>>' }))).toBe(1_800_003_600_000);
  });

  it('token lạ / thiếu exp / null -> null (caller bỏ qua, gửi như cũ)', () => {
    expect(getJwtExpMs(null)).toBeNull();
    expect(getJwtExpMs('abc')).toBeNull();
    expect(getJwtExpMs('a.b.c')).toBeNull();
    expect(getJwtExpMs(makeJwt(undefined))).toBeNull();
    expect(getJwtExpMs(makeJwt('x' as unknown as number))).toBeNull();
  });

  it('còn > 60 s -> chưa sắp hết hạn; < 60 s hoặc đã hết hạn -> sắp hết hạn', () => {
    expect(isAccessTokenExpiring(makeJwt(NOW / 1000 + 3600), NOW)).toBe(false);
    expect(isAccessTokenExpiring(makeJwt(NOW / 1000 + 61), NOW)).toBe(false);
    expect(isAccessTokenExpiring(makeJwt(NOW / 1000 + 59), NOW)).toBe(true);
    expect(isAccessTokenExpiring(makeJwt(NOW / 1000 - 10), NOW)).toBe(true);
  });

  it('token không đọc được exp -> KHÔNG coi là sắp hết hạn (không refresh nhầm)', () => {
    expect(isAccessTokenExpiring('garbage', NOW)).toBe(false);
    expect(isAccessTokenExpiring(null, NOW)).toBe(false);
  });
});
