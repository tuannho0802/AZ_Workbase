/**
 * test-b2-presign.ts
 * -----------------------------------------------------------------
 * Script test nhanh: tạo Presigned PUT URL + Presigned GET URL lên
 * Backblaze B2 (qua S3-compatible API), rồi tự upload 1 file test và
 * tải lại để xác nhận toàn bộ chuỗi credentials + CORS + bucket hoạt
 * động đúng TRƯỚC KHI xây dựng module `uploads` chính thức trong NestJS.
 *
 * Theo đúng mục 9.2 việc #8 của
 * `AZ-Workbase Skills/PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md`.
 *
 * Script này KHÔNG chạy qua NestJS (không có ConfigModule), nên tự đọc
 * `.env.development` bằng `dotenv` (đã có sẵn qua @nestjs/config, không
 * cần cài thêm).
 *
 * Chạy (sau khi npm install ở backend/ và đã điền B2_* vào .env.development):
 *   npm run b2:test-presign
 *
 * Có thể chỉ định bucket khác mặc định (mặc định dùng B2_BUCKET_AVATARS):
 *   B2_TEST_BUCKET=leave npm run b2:test-presign   (dùng B2_BUCKET_LEAVE_ATTACHMENTS)
 * -----------------------------------------------------------------
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Load .env.development (script chạy độc lập, không qua NestJS ConfigModule)
dotenv.config({ path: path.resolve(process.cwd(), '.env.development') });

function line(): void {
    console.log('-------------------------------------------------------');
}

// ====== ĐỌC ENV - BẮT BUỘC PHẢI CÓ ĐỦ, KHÔNG DÙNG GIÁ TRỊ MẶC ĐỊNH ======
const B2_ENDPOINT = process.env.B2_ENDPOINT;
const B2_REGION = process.env.B2_REGION;
const B2_ACCESS_KEY_ID = process.env.B2_ACCESS_KEY_ID;
const B2_SECRET_ACCESS_KEY = process.env.B2_SECRET_ACCESS_KEY;

// Chọn bucket để test: mặc định avatars, đổi qua B2_TEST_BUCKET=leave để test bucket kia
const useLeaveBucket = process.env.B2_TEST_BUCKET === 'leave';
const TEST_BUCKET = useLeaveBucket ? process.env.B2_BUCKET_LEAVE_ATTACHMENTS : process.env.B2_BUCKET_AVATARS;

const missing: string[] = [];
if (!B2_ENDPOINT) missing.push('B2_ENDPOINT');
if (!B2_REGION) missing.push('B2_REGION');
if (!B2_ACCESS_KEY_ID) missing.push('B2_ACCESS_KEY_ID');
if (!B2_SECRET_ACCESS_KEY) missing.push('B2_SECRET_ACCESS_KEY');
if (!TEST_BUCKET) missing.push(useLeaveBucket ? 'B2_BUCKET_LEAVE_ATTACHMENTS' : 'B2_BUCKET_AVATARS');

if (missing.length > 0) {
    console.error('❌ THIẾU BIẾN MÔI TRƯỜNG trong backend/.env.development:');
    missing.forEach((k) => console.error(`   - ${k}`));
    console.error('\nXem mẫu đầy đủ ở backend/.env.development.example (mục Backblaze B2).');
    process.exit(1);
}

const s3 = new S3Client({
    region: B2_REGION,
    endpoint: B2_ENDPOINT,
    credentials: {
        accessKeyId: B2_ACCESS_KEY_ID as string,
        secretAccessKey: B2_SECRET_ACCESS_KEY as string,
    },
});

async function main(): Promise<void> {
    console.log('== TEST PRESIGNED URL - BACKBLAZE B2 (S3-compatible) ==');
    console.log(`Bucket đang test: ${TEST_BUCKET}`);
    console.log(`Endpoint: ${B2_ENDPOINT} | Region: ${B2_REGION}`);
    line();

    const testKey = `test-uploads/presign-test-${Date.now()}.txt`;
    const testContent = `AZWorkbase B2 presign test - ${new Date().toISOString()}`;

    // ── Bước 1: Tạo Presigned PUT URL ──────────────────────────────
    console.log('Bước 1: Tạo Presigned PUT URL...');
    let putUrl: string;
    try {
        putUrl = await getSignedUrl(
            s3,
            new PutObjectCommand({
                Bucket: TEST_BUCKET as string,
                Key: testKey,
                ContentType: 'text/plain',
            }),
            { expiresIn: 300 }, // 5 phút
        );
        console.log('✅ Đã tạo Presigned PUT URL:');
        console.log(putUrl);
    } catch (err: any) {
        console.error('❌ KHÔNG tạo được Presigned PUT URL. Kiểm tra lại B2_ACCESS_KEY_ID/B2_SECRET_ACCESS_KEY.');
        console.error('Chi tiết lỗi:', err?.message ?? err);
        process.exit(1);
    }
    line();

    // ── Bước 2: PUT thật bằng chính presigned URL vừa tạo (giả lập browser upload) ──
    console.log('Bước 2: Upload file test bằng PUT (giả lập browser)...');
    try {
        const putResponse = await fetch(putUrl!, {
            method: 'PUT',
            headers: { 'Content-Type': 'text/plain' },
            body: testContent,
        });
        if (!putResponse.ok) {
            const bodyText = await putResponse.text().catch(() => '');
            throw new Error(`HTTP ${putResponse.status} ${putResponse.statusText} - ${bodyText}`);
        }
        console.log(`✅ Upload thành công (HTTP ${putResponse.status}). Key: ${testKey}`);
    } catch (err: any) {
        console.error('❌ UPLOAD THẤT BẠI khi PUT vào presigned URL.');
        console.error('Chi tiết lỗi:', err?.message ?? err);
        console.error('\nGợi ý kiểm tra:');
        console.error(' 1. CORS Rules đã áp đúng cho bucket này chưa? (b2 bucket get <bucket>, xem field corsRules)');
        console.error(' 2. allowedOperations trong CORS có "s3_put" chưa?');
        console.error(' 3. B2_BUCKET_* trong .env có đúng tên bucket thật không (phân biệt hoa/thường)?');
        process.exit(1);
    }
    line();

    // ── Bước 3: Tạo Presigned GET URL và tải lại để xác nhận nội dung khớp ──
    console.log('Bước 3: Tạo Presigned GET URL và tải lại file vừa upload...');
    try {
        const getUrl = await getSignedUrl(
            s3,
            new GetObjectCommand({ Bucket: TEST_BUCKET as string, Key: testKey }),
            { expiresIn: 300 },
        );
        console.log('✅ Đã tạo Presigned GET URL:');
        console.log(getUrl);

        const getResponse = await fetch(getUrl);
        if (!getResponse.ok) {
            throw new Error(`HTTP ${getResponse.status} ${getResponse.statusText}`);
        }
        const downloaded = await getResponse.text();
        if (downloaded === testContent) {
            console.log('✅ Nội dung tải về KHỚP với nội dung đã upload. Chuỗi presign PUT + GET hoạt động đúng.');
        } else {
            console.warn('⚠️  Nội dung tải về KHÔNG khớp nội dung gốc - kiểm tra lại thủ công.');
            console.warn('Gốc:', testContent);
            console.warn('Tải về:', downloaded);
        }
    } catch (err: any) {
        console.error('❌ KHÔNG tải lại được file qua Presigned GET URL.');
        console.error('Chi tiết lỗi:', err?.message ?? err);
        console.error('Kiểm tra: allowedOperations trong CORS có "s3_get" chưa?');
        process.exit(1);
    }
    line();

    // ── Bước 4: Dọn dẹp - xoá file test khỏi bucket ────────────────
    console.log('Bước 4: Dọn dẹp - xoá file test khỏi bucket...');
    try {
        await s3.send(new DeleteObjectCommand({ Bucket: TEST_BUCKET as string, Key: testKey }));
        console.log('✅ Đã xoá file test. Bucket sạch, không để lại rác.');
    } catch (err: any) {
        console.warn('⚠️  Không tự xoá được file test (không nghiêm trọng, có thể xoá tay qua B2 console).');
        console.warn(`   Key: ${testKey}`);
        console.warn('Chi tiết lỗi:', err?.message ?? err);
    }
    line();

    console.log('== HOÀN TẤT. Nếu tất cả bước trên đều ✅, credentials + CORS + bucket đã sẵn sàng để code module uploads thật. ==');
}

main();
