/** Hiển thị số request API (3.6.2): luôn có dấu ≈ vì đây là số XẤP XỈ (gom thùng 1 phút, có thể thấp hơn thật). */
export function formatApproxHits(n: number | null | undefined): string {
    const v = Number.isFinite(n as number) ? Math.max(0, Math.trunc(n as number)) : 0;
    return v > 0 ? `≈ ${v.toLocaleString('en-US')}` : '0';
}
