import type * as S3SdkTypes from '@aws-sdk/client-s3';
import type * as S3PresignerTypes from '@aws-sdk/s3-request-presigner';

/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 12G] `@aws-sdk/client-s3` (+ `@smithy/core`) tốn ~200 ms CPU chỉ để `require`
 * (đo trong sandbox bằng hook `Module._load`, không phải số prod) nhưng chỉ dùng khi presign/xoá/liệt kê file B2.
 * Nạp lười lần đầu cần tới thay vì mỗi cold start (Node tự cache `require` nên các lần sau gần như miễn phí).
 *
 * Cùng mẫu với `loadExcelJS()`: `require` trong hàm (không dùng `import()` vì Jest không chạy được; chuỗi cố định
 * vẫn được bundler Vercel đóng gói). Kiểu (`S3Client`, ...) dùng `import type` ở từng file - không tốn runtime.
 */
export function loadS3Sdk(): typeof S3SdkTypes {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@aws-sdk/client-s3') as typeof S3SdkTypes;
}

export function loadS3Presigner(): typeof S3PresignerTypes {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@aws-sdk/s3-request-presigner') as typeof S3PresignerTypes;
}
