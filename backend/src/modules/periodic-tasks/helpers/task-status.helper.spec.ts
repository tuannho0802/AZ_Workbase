import {
  extendedPeriodEndForReopen,
  isCompletedTask,
  resolveStatusChecklistGuard,
  resolveTickTargetStatus,
} from './task-status.helper';

describe('task-status.helper', () => {
  describe('resolveTickTargetStatus', () => {
    it('not_started tick thường (FE không gửi gì) -> ép in_progress', () => {
      expect(resolveTickTargetStatus('not_started', undefined)).toBe('in_progress');
    });
    it('not_started + FE xin in_review -> in_review', () => {
      expect(resolveTickTargetStatus('not_started', 'in_review')).toBe('in_review');
    });
    it('in_progress không xin gì -> không đổi', () => {
      expect(resolveTickTargetStatus('in_progress', undefined)).toBeNull();
    });
    it('in_progress xin in_review -> in_review', () => {
      expect(resolveTickTargetStatus('in_progress', 'in_review')).toBe('in_review');
    });
    it('không bao giờ hạ in_review/done xuống in_progress', () => {
      expect(resolveTickTargetStatus('in_review', 'in_progress')).toBeNull();
      expect(resolveTickTargetStatus('done', 'in_review')).toBeNull();
    });
    it('status tuỳ chỉnh -> không tự ép', () => {
      expect(resolveTickTargetStatus('custom_x', 'in_progress')).toBeNull();
    });
  });

  describe('isCompletedTask', () => {
    it('in_review/done/isDoneState -> true', () => {
      expect(isCompletedTask({ code: 'done' })).toBe(true);
      expect(isCompletedTask({ code: 'in_review' })).toBe(true);
      expect(isCompletedTask({ code: 'x', isDoneState: true })).toBe(true);
    });
    it('in_progress/null -> false', () => {
      expect(isCompletedTask({ code: 'in_progress' })).toBe(false);
      expect(isCompletedTask(null)).toBe(false);
    });
  });

  describe('extendedPeriodEndForReopen', () => {
    it('deadline 28/9, thêm checklist 29/9 -> kéo period_end thành 29/9', () => {
      expect(extendedPeriodEndForReopen('2026-09-28', '2026-09-29')).toBe('2026-09-29');
    });
    it('kỳ chưa qua -> giữ nguyên', () => {
      expect(extendedPeriodEndForReopen('2026-09-29', '2026-09-29')).toBeNull();
      expect(extendedPeriodEndForReopen('2026-10-05', '2026-09-29')).toBeNull();
    });
  });

  describe('resolveStatusChecklistGuard', () => {
    const g = (current: string, target: string, total: number, done: number, extra: { isDoneState?: boolean } = {}) =>
      resolveStatusChecklistGuard({ current: { code: current }, target: { code: target, ...extra }, total, done });

    it('sang Hoàn thành khi còn checklist chưa tick -> hỏi complete (tick_all)', () => {
      expect(g('in_progress', 'done', 5, 3)).toEqual({ kind: 'complete', sync: 'tick_all', undone: 2 });
    });
    it('sang Xem xét (cũng là trạng thái hoàn thành) khi còn chưa tick -> hỏi complete', () => {
      expect(g('in_progress', 'in_review', 4, 0)).toEqual({ kind: 'complete', sync: 'tick_all', undone: 4 });
    });
    it('status tuỳ chỉnh is_done_state=true cũng bị coi là hoàn thành', () => {
      expect(g('in_progress', 'early_done', 2, 1, { isDoneState: true })?.kind).toBe('complete');
    });
    it('tick đủ hoặc không có checklist -> không hỏi', () => {
      expect(g('in_progress', 'done', 3, 3)).toBeNull();
      expect(g('in_progress', 'done', 0, 0)).toBeNull();
    });
    it('đang ở nhóm hoàn thành rồi (in_review -> done) -> không hỏi lại', () => {
      expect(g('in_review', 'done', 5, 2)).toBeNull();
    });
    it('về To-do khi đã có tick -> hỏi reset (untick_all)', () => {
      expect(g('in_progress', 'not_started', 5, 2)).toEqual({ kind: 'reset', sync: 'untick_all', ticked: 2 });
      expect(g('done', 'not_started', 3, 3)).toEqual({ kind: 'reset', sync: 'untick_all', ticked: 3 });
    });
    it('về To-do khi chưa tick gì -> không hỏi', () => {
      expect(g('in_progress', 'not_started', 5, 0)).toBeNull();
    });
    it('sang Đang làm -> không có Guard (kể cả từ Hoàn thành mở lại)', () => {
      expect(g('not_started', 'in_progress', 5, 0)).toBeNull();
      expect(g('done', 'in_progress', 5, 5)).toBeNull();
    });
    it('current null (Task chưa load status) + target hoàn thành -> vẫn hỏi', () => {
      expect(resolveStatusChecklistGuard({ current: null, target: { code: 'done' }, total: 2, done: 0 })?.kind).toBe('complete');
    });
  });
});
