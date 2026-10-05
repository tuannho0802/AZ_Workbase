import { describe, expect, it } from 'vitest';
import { getChecklistGuardPrompt, parseChecklistGuardError } from './statusChecklistGuard';

const axiosErr = (status: number, data: Record<string, unknown>) => ({ response: { status, data } });

describe('parseChecklistGuardError', () => {
    it('409 CHECKLIST_GUARD hợp lệ -> trả info', () => {
        const info = parseChecklistGuardError(
            axiosErr(409, { code: 'CHECKLIST_GUARD', guard: 'complete', sync: 'tick_all', total: 5, done: 3, targetStatusName: 'Hoàn thành' }),
        );
        expect(info).toEqual({ guard: 'complete', sync: 'tick_all', total: 5, done: 3, targetStatusName: 'Hoàn thành' });
    });
    it('lỗi khác (409 không có code, 400, lỗi mạng) -> null', () => {
        expect(parseChecklistGuardError(axiosErr(409, { message: 'trùng' }))).toBeNull();
        expect(parseChecklistGuardError(axiosErr(400, { code: 'CHECKLIST_GUARD', guard: 'complete', sync: 'tick_all' }))).toBeNull();
        expect(parseChecklistGuardError(new Error('Network'))).toBeNull();
        expect(parseChecklistGuardError(null)).toBeNull();
    });
    it('payload sai kiểu guard/sync -> null (không đoán mò)', () => {
        expect(parseChecklistGuardError(axiosErr(409, { code: 'CHECKLIST_GUARD', guard: 'x', sync: 'tick_all' }))).toBeNull();
        expect(parseChecklistGuardError(axiosErr(409, { code: 'CHECKLIST_GUARD', guard: 'reset', sync: 'zzz' }))).toBeNull();
    });
});

describe('getChecklistGuardPrompt', () => {
    it('complete: hỏi "Bạn đã hoàn thành Task?" kèm số checklist chưa tick', () => {
        const p = getChecklistGuardPrompt(
            { guard: 'complete', sync: 'tick_all', total: 5, done: 3, targetStatusName: 'Hoàn thành' },
            'Gọi khách',
        );
        expect(p.title).toBe('Bạn đã hoàn thành Task?');
        expect(p.content).toContain('2/5');
        expect(p.content).toContain('"Hoàn thành"');
        expect(p.okText).toBe('Có, đã hoàn thành');
    });
    it('reset: hỏi bỏ tick khi về To-do', () => {
        const p = getChecklistGuardPrompt({ guard: 'reset', sync: 'untick_all', total: 4, done: 2, targetStatusName: 'To-do' }, 'A');
        expect(p.title).toBe('Đưa Task về To-do?');
        expect(p.content).toContain('2/4');
        expect(p.okText).toBe('Có, bỏ tick hết');
    });
});
