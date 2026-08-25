/**
 * test-connection.ts
 * -----------------------------------------------------------------
 * Script test nhanh kết nối tới máy chấm công Ronald Jack RJ-TX300
 * (nền tảng ZKTeco - giao thức chuẩn qua TCP/IP).
 *
 * Mục đích: xác nhận kết nối, đọc thông tin máy, danh sách user và
 * log chấm công TRƯỚC KHI xây dựng service sync chính thức
 * (ZkDeviceModule / ZkDeviceService trong NestJS).
 *
 * Script này XUẤT THÊM 2 FILE .csv (danh sách user + toàn bộ log chấm
 * công) đọc TRỰC TIẾP từ máy - không qua DB, không qua backend - để đối
 * chiếu tính toàn vẹn dữ liệu (kiểm tra lệch giờ/thiếu log) độc lập với
 * mọi bug có thể có ở tầng ứng dụng. Xem chú thích ở
 * `decode-device-time.util.ts` (import bên dưới) để hiểu vì sao KHÔNG
 * được tin thẳng object Date mà node-zklib trả về - cùng 1 hàm giải mã
 * đó cũng được `ZkDeviceService.syncNow()` dùng, để 2 nơi không bị lệch
 * logic với nhau.
 *
 * Chạy (sau khi npm install ở backend/):
 *   npm run zk:test
 *
 * Có thể override IP/PORT qua biến môi trường (không sửa code):
 *   ZK_IP=192.168.110.230 ZK_PORT=8818 npm run zk:test        (mac/linux)
 *   set ZK_IP=192.168.110.230 && set ZK_PORT=8818 && npm run zk:test   (windows cmd)
 * -----------------------------------------------------------------
 */

import * as fs from 'fs';
import * as path from 'path';

// node-zklib chưa có type definition => import kiểu require, TS coi là "any"
// (tsconfig của project đã bật noImplicitAny: false nên không lỗi build)
import ZKLib = require('node-zklib');
import { decodeDeviceLocalTime } from './decode-device-time.util';

// ====== CẤU HÌNH - LẤY TỪ MENU "Ethernet" TRÊN MÁY THẬT ======
// Máy: Ronald Jack RJ-TX300, SN: 8116250900075
const DEVICE_IP = process.env.ZK_IP || '192.168.110.230'; // Địa chỉ IP trên máy
const DEVICE_PORT = Number(process.env.ZK_PORT || 8818); // ⚠️ Cổng liên kết TCP = 8818 (KHÔNG phải 4370 mặc định!)
const TIMEOUT_MS = 10000; // timeout kết nối
const UDP_IN_PORT = 4000; // cổng phản hồi (giữ mặc định)
// Lưu ý: máy chạy script này phải cùng dải mạng 192.168.110.x
// (Gateway 192.168.110.1, Subnet 255.255.255.0) mới kết nối được.
// ================================================================

// Thư mục xuất file CSV - tạo tại backend/exports (relative tới nơi
// lệnh `npm run zk:test` được gọi, tức thư mục backend/).
const EXPORT_DIR = path.resolve(process.cwd(), 'exports');

function line(): void {
    console.log('-------------------------------------------------------');
}

// ── CSV helpers (không cần cài thêm package - script test độc lập) ─────────

/**
 * Escape 1 giá trị theo chuẩn CSV (RFC 4180): bọc dấu ngoặc kép nếu chứa
 * dấu phẩy/ngoặc kép/xuống dòng, nhân đôi ngoặc kép bên trong.
 */
function csvEscape(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
    const lines = [headers.map(csvEscape).join(',')];
    for (const row of rows) {
        lines.push(row.map(csvEscape).join(','));
    }
    // Thêm BOM \uFEFF ở đầu để Excel mở file tự nhận đúng UTF-8
    // (không có BOM, Excel hay hiển thị sai tiếng Việt có dấu).
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function writeCsvFile(filename: string, headers: string[], rows: Array<Array<unknown>>): string {
    if (!fs.existsSync(EXPORT_DIR)) {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }
    const fullPath = path.join(EXPORT_DIR, filename);
    fs.writeFileSync(fullPath, toCsv(headers, rows), 'utf-8');
    return fullPath;
}

function timestampForFilename(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main(): Promise<void> {
    console.log('== TEST KẾT NỐI MÁY CHẤM CÔNG (RJ-TX300 / ZKTeco protocol) ==');
    console.log(`Đang kết nối tới ${DEVICE_IP}:${DEVICE_PORT} ...`);
    console.log(`Múi giờ tiến trình đang chạy script này: UTC${new Date().getTimezoneOffset() <= 0 ? '+' : '-'}${Math.abs(new Date().getTimezoneOffset() / 60)} (chỉ để tham khảo - xem giải thích ở decode-device-time.util.ts nếu số liệu có vẻ lệch).`);

    const zkInstance = new ZKLib(DEVICE_IP, DEVICE_PORT, TIMEOUT_MS, UDP_IN_PORT, 0, 'tcp');

    try {
        // Bước 1: Tạo socket / kết nối tới máy
        await zkInstance.createSocket();
        console.log('✅ Kết nối thành công!');
        line();

        // Bước 2: Thông tin tổng quan của máy (số user, số log, dung lượng)
        try {
            const info = await zkInstance.getInfo();
            console.log('THÔNG TIN MÁY:');
            console.log(info);
        } catch (e: any) {
            console.log('⚠️  Không lấy được getInfo():', e.message);
        }
        line();

        // Bước 3: [ĐÃ BỎ] node-zklib bản đang cài (v1.3.0) không có hàm
        // getTime() - kiểm tra lại node_modules/node-zklib/zklib.js xác
        // nhận chỉ có: getInfo, getUsers, getAttendances, getRealTimeLogs,
        // disconnect, freeData. Gọi getTime() ở đây trước đây luôn báo lỗi
        // "not a function", không phải lỗi kết nối thật - đã bỏ bước này.
        line();

        // Bước 4: Danh sách user đã đăng ký vân tay/thẻ -> xuất CSV
        let deviceUsersCount = 0;
        try {
            const users = await zkInstance.getUsers();
            const list: any[] = users?.data ?? [];
            deviceUsersCount = list.length;
            console.log(`DANH SÁCH USER (tổng: ${deviceUsersCount}):`);
            console.log(JSON.stringify(list.slice(0, 10), null, 2));
            if (deviceUsersCount > 10) {
                console.log(`... còn ${deviceUsersCount - 10} user khác (đã ẩn bớt để log gọn, đầy đủ đã có trong CSV)`);
            }

            const usersCsvPath = writeCsvFile(
                `zk-device-users-${timestampForFilename()}.csv`,
                ['uid', 'deviceUserId (PIN)', 'name', 'role', 'cardno'],
                list.map((u) => [u.uid, u.userId, u.name, u.role, u.cardno]),
            );
            console.log(`📄 Đã xuất CSV danh sách user: ${usersCsvPath}`);
        } catch (e: any) {
            console.log('⚠️  Không lấy được getUsers():', e.message);
        }
        line();

        // Bước 5: Toàn bộ log chấm công -> xuất CSV (có thể mất vài giây nếu log nhiều)
        try {
            console.log('Đang tải log chấm công (attendance logs)...');
            const logs = await zkInstance.getAttendances((received: number, total: number) => {
                process.stdout.write(`\r  Tiến độ tải: ${received}/${total}`);
            });
            console.log();
            const records: any[] = logs?.data ?? [];
            const totalLogs = records.length;
            console.log(`TỔNG SỐ LOG CHẤM CÔNG: ${totalLogs}`);
            console.log('5 log gần nhất (nếu có):');
            console.log(JSON.stringify(records.slice(-5), null, 2));

            let invalidCount = 0;
            const logsCsvPath = writeCsvFile(
                `zk-attendance-logs-${timestampForFilename()}.csv`,
                [
                    'userSn',
                    'deviceUserId (PIN)',
                    'ip',
                    'gio_may_ghi_VN (SU THAT - se luu NGUYEN VAN vao DB, khong quy doi)',
                    'raw_date_iso_tu_node-zklib (CHI DE DEBUG - KHONG dung lam can cu, xem decode-device-time.util.ts)',
                ],
                records.map((r) => {
                    try {
                        const decoded = decodeDeviceLocalTime(r.recordTime as Date);
                        return [
                            r.userSn,
                            r.deviceUserId,
                            r.ip,
                            decoded.vnLocalDisplay,
                            (r.recordTime as Date).toISOString(),
                        ];
                    } catch (decodeErr: any) {
                        // ⚠️ KHÔNG được để 1 dòng hỏng làm crash cả file CSV - vẫn ghi
                        // dòng này ra kèm cờ INVALID để biết chính xác có bao nhiêu
                        // dòng log bị hỏng ở tầng giao thức (phục vụ đúng mục đích
                        // kiểm tra toàn vẹn dữ liệu, không phải để giấu đi).
                        invalidCount++;
                        return [r.userSn, r.deviceUserId, r.ip, 'INVALID', String(decodeErr?.message ?? decodeErr)];
                    }
                }),
            );
            console.log(`📄 Đã xuất CSV log chấm công: ${logsCsvPath}`);
            if (invalidCount > 0) {
                console.log(`⚠️  Có ${invalidCount}/${totalLogs} dòng log KHÔNG giải mã được giờ (đánh dấu INVALID trong CSV) - nên kiểm tra riêng các dòng này.`);
            }
            console.log(
                "   -> Mở cột 'gio_may_ghi_VN' để đối chiếu với giờ quẹt thẻ THẬT (vd hỏi trực tiếp nhân viên hoặc xem camera).",
            );
            console.log(
                "   -> Giá trị này được ghi NGUYÊN VĂN vào cột record_time (DATETIME) trong DB - không quy đổi UTC/offset nào. Cột cuối chỉ còn để debug/đối chiếu lịch sử.",
            );
        } catch (e: any) {
            console.log('⚠️  Không lấy được getAttendances():', e.message);
        }
        line();

        console.log('== HOÀN TẤT TEST. Ngắt kết nối... ==');
    } catch (err: any) {
        console.error('❌ KHÔNG KẾT NỐI ĐƯỢC TỚI MÁY.');
        console.error('Chi tiết lỗi:', err?.message ?? err);
        console.error('\nGợi ý kiểm tra:');
        console.error(' 1. Máy tính chạy script có cùng dải mạng 192.168.110.x với máy chấm công không?');
        console.error(`    (Máy đang dùng IP tĩnh ${DEVICE_IP}, Gateway 192.168.110.1, Subnet 255.255.255.0)`);
        console.error(` 2. Cổng ${DEVICE_PORT} đúng chưa? (Đây là "Cổng liên kết TCP" ghi trong menu Ethernet - KHÔNG phải 4370 mặc định)`);
        console.error(' 3. Thử ping tới IP máy: ping ' + DEVICE_IP);
        console.error(' 4. Máy chấm công có đang bị phần mềm hãng khác (Paradise HR, ...) giữ kết nối độc quyền không?');
        console.error(' 5. Firewall trên máy tính có chặn cổng ' + DEVICE_PORT + ' không?');
        console.error(' 6. Nếu máy tính không cùng subnet 192.168.110.0/24, cần đấu cùng switch/router hoặc cấu hình routing/VPN.');
    } finally {
        try {
            await zkInstance.disconnect();
        } catch {
            // bỏ qua lỗi khi disconnect
        }
    }
}

main();