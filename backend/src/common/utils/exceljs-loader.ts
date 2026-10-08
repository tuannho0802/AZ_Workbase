import type * as ExcelJSTypes from 'exceljs';

/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 12C] `exceljs` tốn ~165 ms CPU chỉ để `require` (đo trong sandbox, không phải số prod)
 * nhưng chỉ dùng khi export/import Excel. Nạp lười lần đầu cần tới thay vì mỗi cold start (Node tự cache `require`).
 *
 * Dùng `require` trong hàm thay vì `await import('exceljs')`: `import()` native không chạy trong Jest
 * (cần --experimental-vm-modules) và `require` với chuỗi cố định vẫn được bundler Vercel (nft) đóng gói.
 * Kiểu (`ExcelJS.Fill`, `ExcelJS.Row`...) dùng `import type` ở từng file - không tốn runtime.
 */
export function loadExcelJS(): typeof ExcelJSTypes {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('exceljs') as typeof ExcelJSTypes;
}