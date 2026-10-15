/** Mã quốc gia ISO-3166 alpha-2 hợp lệ (loại mã "user-assigned" như BE `isValidCountryCode`). */
function isAssignable(code: string): boolean {
    return !(code === 'AA' || code === 'ZZ' || /^X[A-Z]$/.test(code) || /^Q[M-Z]$/.test(code));
}

let _names: Intl.DisplayNames | null = null;
function names(): Intl.DisplayNames | null {
    if (_names) return _names;
    try {
        _names = new Intl.DisplayNames(['vi'], { type: 'region' });
    } catch {
        _names = null;
    }
    return _names;
}

/** Tên quốc gia tiếng Việt; không biết -> trả lại mã. */
export function countryName(code: string | null | undefined): string {
    if (!code) return '';
    const n = names()?.of(code.toUpperCase());
    return n && n !== code ? n : code;
}

let _options: Array<{ value: string; label: string }> | null = null;
/** Danh sách cho Select: "VN — Việt Nam", sắp theo tên. Tính 1 lần (676 mã, lọc theo Intl). */
export function countryOptions(): Array<{ value: string; label: string }> {
    if (_options) return _options;
    const out: Array<{ value: string; label: string }> = [];
    for (let a = 65; a <= 90; a++) {
        for (let b = 65; b <= 90; b++) {
            const code = String.fromCharCode(a, b);
            if (!isAssignable(code)) continue;
            const n = names()?.of(code);
            if (n && n !== code) out.push({ value: code, label: `${code} — ${n}` });
        }
    }
    out.sort((x, y) => x.label.slice(5).localeCompare(y.label.slice(5), 'vi'));
    _options = out;
    return out;
}
