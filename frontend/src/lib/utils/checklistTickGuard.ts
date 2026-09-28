/** Mã status hệ thống dùng cho luồng xác nhận khi tick checklist. */
export const STATUS_NOT_STARTED = 'not_started';
export const STATUS_IN_PROGRESS = 'in_progress';
export const STATUS_IN_REVIEW = 'in_review';
export const STATUS_DONE = 'done';

export type TickPrompt =
    /** Tick checklist CUỐI CÙNG -> hỏi "Task này đã xong?"; Có => tick + chuyển in_review. */
    | { kind: 'finish'; nextStatusCode: typeof STATUS_IN_REVIEW }
    /** Task đang To-do -> hỏi "Bạn đang làm Task này?"; Có => tick + chuyển in_progress. */
    | { kind: 'start'; nextStatusCode: typeof STATUS_IN_PROGRESS };

/**
 * Quyết định có phải hỏi xác nhận khi người dùng TICK (không phải bỏ tick) 1 checklist item hay không.
 *  - `remainingUndone` = số mục (checklist item + Task con liên kết) CHƯA xong TRƯỚC khi tick.
 *  - Tick mục cuối (remainingUndone === 1) và Task chưa in_review/done -> hỏi "đã xong?" (ưu tiên hơn "đang làm",
 *    vì Có => in_review đã bao hàm đang làm).
 *  - Ngược lại, Task đang not_started -> hỏi "đang làm?".
 *  - Còn lại (đã in_progress/in_review/done, hoặc bỏ tick) -> không hỏi, tick luôn.
 */
export function getTickPrompt(params: {
    statusCode: string | null | undefined;
    isTicking: boolean;
    remainingUndone: number;
}): TickPrompt | null {
    const { statusCode, isTicking, remainingUndone } = params;
    if (!isTicking) return null;
    if (statusCode === STATUS_IN_REVIEW || statusCode === STATUS_DONE) return null;
    if (remainingUndone === 1) return { kind: 'finish', nextStatusCode: STATUS_IN_REVIEW };
    if (statusCode === STATUS_NOT_STARTED) return { kind: 'start', nextStatusCode: STATUS_IN_PROGRESS };
    return null;
}
