/**
 * Tách 1 chuỗi text thành các đoạn "text thường" / "link" để render thành
 * link bấm được (dùng cho Mô tả, Ghi chú, Checklist item của Công việc định kỳ).
 * Chỉ chấp nhận http/https (chặn `javascript:`...); `www.xxx` tự thêm `https://`.
 */
export type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_PUNCT = new Set(['.', ',', ';', ':', '!', '?', "'", '"', '…', ']', '}', ')']);

const count = (s: string, ch: string) => s.split(ch).length - 1;

/** Cắt dấu câu dính đuôi URL (vd "xem https://a.com." -> bỏ "."); giữ ")" nếu URL có "(" tương ứng. */
function trimTrailing(raw: string): { url: string; rest: string } {
  let url = raw;
  while (url.length > 0) {
    const last = url[url.length - 1];
    if (!TRAILING_PUNCT.has(last)) break;
    if (last === ')' && count(url, ')') <= count(url, '(')) break;
    url = url.slice(0, -1);
  }
  return { url, rest: raw.slice(url.length) };
}

function toSafeHref(url: string): string | null {
  const href = /^www\./i.test(url) ? `https://${url}` : url;
  try {
    const p = new URL(href);
    return p.protocol === 'http:' || p.protocol === 'https:' ? href : null;
  } catch {
    return null;
  }
}

export function parseLinks(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  const push = (value: string) => {
    if (!value) return;
    const prev = out[out.length - 1];
    if (prev && prev.type === 'text') prev.value += value;
    else out.push({ type: 'text', value });
  };

  for (const m of text.matchAll(URL_REGEX)) {
    const start = m.index ?? 0;
    const { url, rest } = trimTrailing(m[0]);
    const href = url ? toSafeHref(url) : null;
    push(text.slice(last, start));
    if (href) {
      out.push({ type: 'link', value: url, href });
      push(rest);
    } else {
      push(m[0]);
    }
    last = start + m[0].length;
  }
  push(text.slice(last));
  return out;
}

/**
 * Cắt hiển thị theo tổng số ký tự (giống `truncateText` ở bảng) nhưng KHÔNG làm
 * hỏng URL: `href` luôn giữ nguyên đầy đủ, chỉ chữ hiển thị bị cắt + "…".
 */
export function truncateSegments(segments: TextSegment[], maxLength: number): TextSegment[] {
  let budget = maxLength;
  const out: TextSegment[] = [];
  for (const seg of segments) {
    if (budget <= 0) break;
    if (seg.value.length <= budget) {
      out.push(seg);
      budget -= seg.value.length;
    } else {
      out.push({ ...seg, value: `${seg.value.slice(0, budget)}…` });
      budget = 0;
    }
  }
  return out;
}
