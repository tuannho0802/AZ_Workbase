import * as bcrypt from 'bcrypt';
import {
  addRefreshSession,
  hashRefreshToken,
  MAX_REFRESH_SESSIONS,
  parseRefreshStore,
  rotateRefreshSession,
  describeDevice,
  hashRefreshToken as hashTok,
  listRefreshSessions,
  revokeRefreshSessions,
} from './refresh-session-store.util';

const NOW = 1_800_000_000;
const DAY = 24 * 3600;

describe('refresh-session-store.util', () => {
  it('2 token CÓ CÙNG 72 byte đầu nhưng khác phần sau -> KHÔNG được coi là cùng phiên (lỗi bcrypt cũ)', async () => {
    const prefix = 'x'.repeat(80);
    const a = `${prefix}.AAAA`;
    const b = `${prefix}.BBBB`;
    const raw = addRefreshSession(null, a, NOW);
    expect((await rotateRefreshSession(raw, b, 'new', NOW)).ok).toBe(false);
    expect((await rotateRefreshSession(raw, a, 'new', NOW)).ok).toBe(true);
  });

  it('đăng nhập thiết bị thứ 2 KHÔNG đá thiết bị 1; mỗi thiết bị xoay token độc lập', async () => {
    let raw = addRefreshSession(null, 'tokA1', NOW);
    raw = addRefreshSession(raw, 'tokB1', NOW + 1);

    const rotA = await rotateRefreshSession(raw, 'tokA1', 'tokA2', NOW + 10);
    expect(rotA.ok).toBe(true);
    raw = (rotA as { ok: true; next: string | null }).next;

    const rotB = await rotateRefreshSession(raw, 'tokB1', 'tokB2', NOW + 11);
    expect(rotB.ok).toBe(true);
    raw = (rotB as { ok: true; next: string | null }).next;

    // token cũ của A đã bị thay -> tái sử dụng
    expect((await rotateRefreshSession(raw, 'tokA1', 'x', NOW + 12)).ok).toBe(false);
    expect((await rotateRefreshSession(raw, 'tokA2', 'tokA3', NOW + 12)).ok).toBe(true);
  });

  it('token lạ -> không khớp', async () => {
    const raw = addRefreshSession(null, 'tokA', NOW);
    expect((await rotateRefreshSession(raw, 'khac', 'n', NOW)).ok).toBe(false);
    expect((await rotateRefreshSession(null, 'tokA', 'n', NOW)).ok).toBe(false);
  });

  it(`giới hạn ${MAX_REFRESH_SESSIONS} thiết bị: vượt thì bỏ phiên cũ nhất`, async () => {
    let raw: string | null = null;
    for (let i = 0; i < MAX_REFRESH_SESSIONS + 2; i++) raw = addRefreshSession(raw, `tok${i}`, NOW + i);
    expect(parseRefreshStore(raw, NOW + 100).s).toHaveLength(MAX_REFRESH_SESSIONS);
    expect((await rotateRefreshSession(raw, 'tok0', 'n', NOW + 100)).ok).toBe(false); // cũ nhất đã bị bỏ
    expect((await rotateRefreshSession(raw, `tok${MAX_REFRESH_SESSIONS + 1}`, 'n', NOW + 100)).ok).toBe(true);
  });

  it('slot quá hạn (> 8 ngày) bị dọn', async () => {
    const raw = addRefreshSession(null, 'old', NOW);
    expect((await rotateRefreshSession(raw, 'old', 'n', NOW + 9 * DAY)).ok).toBe(false);
  });

  describe('chuyển tiếp từ hash bcrypt cũ', () => {
    let legacy: string;
    beforeAll(async () => {
      legacy = await bcrypt.hash('legacy-token', 4);
    });

    it('token cũ hợp lệ qua bcrypt -> tạo slot mới, GIỮ legacy cho các thiết bị cũ khác', async () => {
      const r = await rotateRefreshSession(legacy, 'legacy-token', 'new1', NOW);
      expect(r.ok).toBe(true);
      const next = (r as { ok: true; next: string | null }).next;
      const store = parseRefreshStore(next, NOW);
      expect(store.s).toHaveLength(1);
      expect(store.l).not.toBeNull();
      // thiết bị cũ thứ 2 (cùng hash bcrypt) vẫn vào được
      expect((await rotateRefreshSession(next, 'legacy-token', 'new2', NOW + 1)).ok).toBe(true);
      // token mới của thiết bị 1 vẫn dùng được
      expect((await rotateRefreshSession(next, 'new1', 'new3', NOW + 1)).ok).toBe(true);
    });

    it('legacy hết hạn sau 7 ngày -> bị dọn, token cũ không còn dùng được', async () => {
      const r = await rotateRefreshSession(legacy, 'legacy-token', 'new1', NOW);
      const next = (r as { ok: true; next: string | null }).next;
      expect((await rotateRefreshSession(next, 'legacy-token', 'x', NOW + 8 * DAY)).ok).toBe(false);
    });

    it('token không khớp bcrypt cũ -> không ok', async () => {
      expect((await rotateRefreshSession(legacy, 'sai-token', 'n', NOW)).ok).toBe(false);
    });

    it('đăng nhập mới trên dữ liệu cũ: giữ legacy + thêm slot', () => {
      const next = addRefreshSession(legacy, 'fresh', NOW);
      const store = parseRefreshStore(next, NOW);
      expect(store.s).toHaveLength(1);
      expect(store.l?.b).toBe(legacy);
    });
  });

  it('dữ liệu JSON hỏng -> coi như không có phiên', async () => {
    expect((await rotateRefreshSession('{khong-phai-json', 't', 'n', NOW)).ok).toBe(false);
  });

  it('không lưu token thô trong chuỗi lưu', () => {
    const raw = addRefreshSession(null, 'super-secret-token', NOW) as string;
    expect(raw).not.toContain('super-secret-token');
    expect(raw).toContain(hashRefreshToken('super-secret-token'));
  });

  describe('JSON v3 (PLAN P5)', () => {
    it('đọc v2 (chưa có id): id = hash.slice(0,12), rồi ghi lại thành v3', () => {
      const h = hashTok('tokOld');
      const v2 = JSON.stringify({ v: 2, s: [{ h, t: NOW }], l: null });
      const s = parseRefreshStore(v2, NOW).s;
      expect(s[0]).toMatchObject({ id: h.slice(0, 12), c: NOW, l: NOW });
      expect(JSON.parse(addRefreshSession(v2, 'tokNew', NOW + 1)!).v).toBe(3);
    });

    it('rotate GIỮ id + thời điểm tạo, chỉ đổi hash/hoạt động; giữ ip/ua cũ nếu refresh không có', async () => {
      const raw = addRefreshSession(null, 'tA', NOW, { sid: 'aaaaaaaaaaaa', ip: '1.1.1.1', ua: 'Chrome Windows' });
      const res = await rotateRefreshSession(raw, 'tA', 'tA2', NOW + 100);
      expect(res.ok).toBe(true);
      const slot = listRefreshSessions((res as { next: string | null }).next, NOW + 100)[0];
      expect(slot).toMatchObject({ id: 'aaaaaaaaaaaa', c: NOW, l: NOW + 100, ip: '1.1.1.1', ua: 'Chrome Windows' });
      expect(slot.h).toBe(hashTok('tA2'));
    });

    it('thu hồi 1 slot / mọi slot trừ 1 / tất cả', () => {
      let raw = addRefreshSession(null, 'a', NOW, { sid: 'aaaaaaaaaaaa' });
      raw = addRefreshSession(raw, 'b', NOW + 1, { sid: 'bbbbbbbbbbbb' });
      expect(revokeRefreshSessions(raw, { sid: 'aaaaaaaaaaaa' }, NOW + 2).removed).toBe(1);
      expect(revokeRefreshSessions(raw, { exceptSid: 'aaaaaaaaaaaa' }, NOW + 2).removed).toBe(1);
      expect(revokeRefreshSessions(raw, {}, NOW + 2)).toEqual({ next: null, removed: 2 });
    });

    it('vượt MAX_REFRESH_SESSIONS -> loại phiên cũ nhất', () => {
      let raw: string | null = null;
      for (let i = 0; i <= MAX_REFRESH_SESSIONS; i++) raw = addRefreshSession(raw, `t${i}`, NOW + i);
      expect(listRefreshSessions(raw, NOW + 100)).toHaveLength(MAX_REFRESH_SESSIONS);
    });

    it('describeDevice: nhãn từ UA, iPhone không bị nhầm macOS, Android không bị nhầm Linux', () => {
      expect(describeDevice('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537')).toBe('Chrome · Windows');
      expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17 like Mac OS X) Safari/604')).toBe('Safari · iOS');
      expect(describeDevice('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile')).toBe('Chrome · Android');
      expect(describeDevice(null)).toBe('Thiết bị không rõ');
    });
  });
});
