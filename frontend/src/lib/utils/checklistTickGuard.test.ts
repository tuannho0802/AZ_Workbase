import { describe, expect, it } from 'vitest';
import { getTickPrompt } from './checklistTickGuard';

describe('getTickPrompt', () => {
    it('bỏ tick -> không hỏi', () => {
        expect(getTickPrompt({ statusCode: 'not_started', isTicking: false, remainingUndone: 1 })).toBeNull();
    });
    it('tick mục cuối khi đang in_progress -> hỏi đã xong, đích in_review', () => {
        expect(getTickPrompt({ statusCode: 'in_progress', isTicking: true, remainingUndone: 1 })).toEqual({ kind: 'finish', nextStatusCode: 'in_review' });
    });
    it('tick mục cuối khi còn not_started -> ưu tiên hỏi đã xong', () => {
        expect(getTickPrompt({ statusCode: 'not_started', isTicking: true, remainingUndone: 1 })?.kind).toBe('finish');
    });
    it('tick mục thường khi not_started -> hỏi đang làm, đích in_progress', () => {
        expect(getTickPrompt({ statusCode: 'not_started', isTicking: true, remainingUndone: 3 })).toEqual({ kind: 'start', nextStatusCode: 'in_progress' });
    });
    it('tick mục thường khi in_progress -> không hỏi', () => {
        expect(getTickPrompt({ statusCode: 'in_progress', isTicking: true, remainingUndone: 3 })).toBeNull();
    });
    it('Task đã in_review/done -> không hỏi kể cả mục cuối', () => {
        expect(getTickPrompt({ statusCode: 'in_review', isTicking: true, remainingUndone: 1 })).toBeNull();
        expect(getTickPrompt({ statusCode: 'done', isTicking: true, remainingUndone: 1 })).toBeNull();
    });
});
