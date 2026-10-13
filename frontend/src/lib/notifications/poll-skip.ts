/**
 * BE (poll-gate.util.ts) ngoài giờ làm việc trả 200 `{ skipped: true, reason }` thay vì dữ liệu poll.
 * Nếu FE ghi thẳng body này vào cache thì badge sidebar + số chưa đọc biến mất -> phải nhận ra và GIỮ dữ liệu cũ.
 */
export interface PollSkippedResponse {
  skipped: true;
  reason?: string;
}

export function isPollSkipped(data: unknown): data is PollSkippedResponse {
  return typeof data === 'object' && data !== null && (data as { skipped?: unknown }).skipped === true;
}

/** Ném khi BE bỏ qua poll mà FE chưa có dữ liệu cũ để giữ. KHÔNG retry (retry chỉ tốn thêm request). */
export class PollSkippedError extends Error {
  constructor() {
    super('Poll bị bỏ qua ngoài giờ làm việc');
    this.name = 'PollSkippedError';
  }
}
