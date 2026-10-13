import { getNowVn } from '../../common/utils/date-vn.util';
import { reminderEarlySkip, respondReminderSkipped, REMINDER_PATH } from './reminder-gate.util';

const at = (h: number, m = 0) => Date.UTC(2026, 9, 12, h - 7, m); // Thứ 2 12/10/2026, giờ VN h:m
const ENV = { CRON_SECRET: 's3cret' } as NodeJS.ProcessEnv;
const get = (url = `${REMINDER_PATH}?secret=s3cret`, extra: Record<string, any> = {}) => ({ url, method: 'GET', ...extra });

describe('reminder-gate.util', () => {
  it('trước 18:00 VN + secret đúng -> skip, trả giờ/ngày VN', () => {
    expect(reminderEarlySkip(get(), at(9, 5), ENV)).toEqual({ nowVnHour: 9, todayVn: '2026-10-12' });
    expect(reminderEarlySkip(get(), at(17, 59), ENV)?.nowVnHour).toBe(17);
    expect(reminderEarlySkip(get(), at(0, 10), ENV)?.todayVn).toBe('2026-10-12'); // 00:10 VN = 17:10 UTC hôm trước
  });
  it('từ 18:00 VN trở đi -> đi đường cũ', () => {
    expect(reminderEarlySkip(get(), at(18, 0), ENV)).toBeNull();
    expect(reminderEarlySkip(get(), at(23, 30), ENV)).toBeNull();
  });
  it('secret qua header x-cron-secret hoặc Bearer đều được', () => {
    expect(reminderEarlySkip(get(REMINDER_PATH, { headers: { 'x-cron-secret': 's3cret' } }), at(10), ENV)).not.toBeNull();
    expect(reminderEarlySkip(get(REMINDER_PATH, { headers: { authorization: 'Bearer s3cret' } }), at(10), ENV)).not.toBeNull();
  });
  it('secret sai/thiếu hoặc CRON_SECRET chưa cấu hình -> đi đường cũ (Nest trả 401/503)', () => {
    expect(reminderEarlySkip(get(`${REMINDER_PATH}?secret=bad`), at(10), ENV)).toBeNull();
    expect(reminderEarlySkip(get(REMINDER_PATH), at(10), ENV)).toBeNull();
    expect(reminderEarlySkip(get(), at(10), {} as NodeJS.ProcessEnv)).toBeNull();
    expect(reminderEarlySkip(get(`${REMINDER_PATH}?secret=s3cretX`), at(10), ENV)).toBeNull();
  });
  it('chỉ đúng path và GET/HEAD', () => {
    expect(reminderEarlySkip(get('/api/periodic-tasks-cron/auto-overdue?secret=s3cret'), at(10), ENV)).toBeNull();
    expect(reminderEarlySkip({ url: `${REMINDER_PATH}?secret=s3cret`, method: 'POST' }, at(10), ENV)).toBeNull();
    expect(reminderEarlySkip({ url: `${REMINDER_PATH}?secret=s3cret`, method: 'HEAD' }, at(10), ENV)).not.toBeNull();
  });
  it('REMINDER_EARLY_SKIP=false tắt hoàn toàn', () => {
    expect(reminderEarlySkip(get(), at(10), { ...ENV, REMINDER_EARLY_SKIP: 'false' })).toBeNull();
  });
  it('respond: GET trả JSON cùng field RunDueRemindersResult + skipped; HEAD không body', () => {
    const mk = () => {
      const r = { statusCode: 0, headers: {} as Record<string, string>, body: undefined as string | undefined };
      return { r, res: { get statusCode() { return r.statusCode; }, set statusCode(v: number) { r.statusCode = v; }, setHeader: (k: string, v: string) => (r.headers[k] = v), end: (b?: string) => (r.body = b) } };
    };
    const g = mk();
    respondReminderSkipped({ method: 'GET' }, g.res as any, { nowVnHour: 9, todayVn: '2026-10-12' });
    expect(g.r.statusCode).toBe(200);
    expect(JSON.parse(g.r.body!)).toEqual({
      nowVnHour: 9, todayVn: '2026-10-12', pastCutoff: false, candidatesChecked: 0, remindersSent: 0, remindedTaskIds: [], skipped: 'before-18h-vn',
    });
    const h = mk();
    respondReminderSkipped({ method: 'HEAD' }, h.res as any, { nowVnHour: 9, todayVn: '2026-10-12' });
    expect(h.r.body).toBeUndefined();
  });

  it('khớp với getNowVn().getHours() mà service dùng (kể cả khi TZ=UTC như Vercel), mọi giờ trong ngày', () => {
    jest.useFakeTimers();
    try {
      for (let h = 0; h < 24; h++) {
        const t = at(h, 30);
        jest.setSystemTime(t);
        const info = reminderEarlySkip(get(), t, ENV);
        const serviceSaysEarly = getNowVn().getHours() < 18;
        expect(info !== null).toBe(serviceSaysEarly);
        if (info) expect(info.nowVnHour).toBe(getNowVn().getHours());
      }
    } finally {
      jest.useRealTimers();
    }
  });
});
