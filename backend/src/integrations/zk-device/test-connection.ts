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
 * Chạy (sau khi npm install ở backend/):
 *   npm run zk:test
 *
 * Có thể override IP/PORT qua biến môi trường (không sửa code):
 *   ZK_IP=192.168.110.230 ZK_PORT=8818 npm run zk:test        (mac/linux)
 *   set ZK_IP=192.168.110.230 && set ZK_PORT=8818 && npm run zk:test   (windows cmd)
 * -----------------------------------------------------------------
 */

// node-zklib chưa có type definition => import kiểu require, TS coi là "any"
// (tsconfig của project đã bật noImplicitAny: false nên không lỗi build)
import ZKLib = require('node-zklib');

// ====== CẤU HÌNH - LẤY TỪ MENU "Ethernet" TRÊN MÁY THẬT ======
// Máy: Ronald Jack RJ-TX300, SN: 8116250900075
const DEVICE_IP = process.env.ZK_IP || '192.168.110.231'; // Địa chỉ IP trên máy
const DEVICE_PORT = Number(process.env.ZK_PORT || 8812); // ⚠️ Cổng liên kết TCP = 8818 (KHÔNG phải 4370 mặc định!)
const TIMEOUT_MS = 10000; // timeout kết nối
const UDP_IN_PORT = 4000; // cổng phản hồi (giữ mặc định)
// Lưu ý: máy chạy script này phải cùng dải mạng 192.168.110.x
// (Gateway 192.168.110.1, Subnet 255.255.255.0) mới kết nối được.
// ================================================================

function line(): void {
    console.log('-------------------------------------------------------');
}

async function main(): Promise<void> {
    console.log('== TEST KẾT NỐI MÁY CHẤM CÔNG (RJ-TX300 / ZKTeco protocol) ==');
    console.log(`Đang kết nối tới ${DEVICE_IP}:${DEVICE_PORT} ...`);

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

        // Bước 3: Thời gian hiện tại trên máy (kiểm tra lệch giờ)
        try {
            const time = await zkInstance.getTime();
            console.log('THỜI GIAN TRÊN MÁY:', time);
        } catch (e: any) {
            console.log('⚠️  Không lấy được getTime():', e.message);
        }
        line();

        // Bước 4: Danh sách user đã đăng ký vân tay/thẻ
        try {
            const users = await zkInstance.getUsers();
            const total = users?.data?.length ?? 0;
            console.log(`DANH SÁCH USER (tổng: ${total}):`);
            console.log(JSON.stringify(users?.data?.slice(0, 10) ?? users, null, 2));
            if (total > 10) {
                console.log(`... còn ${total - 10} user khác (đã ẩn bớt để log gọn)`);
            }
        } catch (e: any) {
            console.log('⚠️  Không lấy được getUsers():', e.message);
        }
        line();

        // Bước 5: Toàn bộ log chấm công (có thể mất vài giây nếu log nhiều)
        try {
            console.log('Đang tải log chấm công (attendance logs)...');
            const logs = await zkInstance.getAttendances((received: number, total: number) => {
                process.stdout.write(`\r  Tiến độ tải: ${received}/${total}`);
            });
            console.log();
            const totalLogs = logs?.data?.length ?? 0;
            console.log(`TỔNG SỐ LOG CHẤM CÔNG: ${totalLogs}`);
            console.log('5 log gần nhất (nếu có):');
            const recent = (logs?.data ?? []).slice(-5);
            console.log(JSON.stringify(recent, null, 2));
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