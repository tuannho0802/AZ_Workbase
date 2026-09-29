import { extendedPeriodEndForReopen, isCompletedTask, resolveTickTargetStatus } from './task-status.helper';

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
});
