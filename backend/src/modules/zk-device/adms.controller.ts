import { Controller, Get, Post, Query, Req, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ZkDeviceService } from './zk-device.service';

/**
 * Endpoint ADMS Push — máy chấm công tự động gọi tới đây, KHÔNG phải người
 * dùng hệ thống gọi. Vì vậy:
 *
 * - KHÔNG có JwtAuthGuard/RolesGuard (máy không có bearer token, đây là giới
 *   hạn của giao thức ADMS gốc do ZKTeco thiết kế, không phải thiếu sót).
 * - Response BẮT BUỘC là plain text đúng định dạng ("OK", hoặc danh sách
 *   config dạng key=value). Sai định dạng (kể cả JSON-wrap "OK" thành "\"OK\"")
 *   sẽ khiến máy hiểu là lỗi và gửi lại log liên tục, có thể gây trùng lặp
 *   hoặc treo hàng đợi gửi dữ liệu của máy.
 * - Route thật là /iclock/... (KHÔNG có prefix /api - đã loại trừ riêng
 *   trong main.ts vì máy gọi cứng đường dẫn này, không cấu hình được prefix).
 *
 * Tham khảo giao thức chính thức: "Attendance PUSH Communication Protocol"
 * (ZKTeco), 3 endpoint chuẩn: GET/POST /iclock/cdata, GET /iclock/getrequest.
 */
@ApiTags('ADMS (Máy chấm công tự đẩy dữ liệu)')
@ApiExcludeController() // ẩn khỏi Swagger UI - đây không phải API cho người dùng hệ thống gọi
@Controller('iclock')
export class AdmsController {
  private readonly logger = new Logger(AdmsController.name);

  constructor(private readonly zkDeviceService: ZkDeviceService) {}

  /**
   * Máy gọi GET /iclock/cdata khi khởi động / định kỳ để "đăng ký" với server
   * và xin cấu hình (chu kỳ gửi log, có bật realtime không...).
   * Server BẮT BUỘC trả về đúng định dạng key=value, mỗi dòng cách nhau CRLF.
   */
  @Get('cdata')
  handshake(@Query('SN') sn: string, @Res() res: Response) {
    this.logger.log(`[ADMS] Handshake từ SN=${sn ?? '(không có)'}`);

    const lines = [
      'GET OPTION FROM: ' + (sn ?? ''),
      'ATTLOGStamp=None', // None = luôn gửi log mới, không cần lọc theo mốc thời gian
      'OPERLOGStamp=9999',
      'ATTPHOTOStamp=None',
      'ErrorDelay=30',
      'Delay=10', // giây giữa các lần thử gửi log tiếp theo
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=TransData AttLog OpLog', // chỉ cần AttLog, không cần đồng bộ user/ảnh qua ADMS
      'TimeZone=7', // GMT+7 (Việt Nam)
      'Realtime=1', // bật đẩy log ngay khi có, không gộp theo lô
      'Encrypt=None',
    ];

    // text/plain thuần, KHÔNG qua JSON serializer của Nest (@Res() ghi thẳng)
    res.status(200).type('text/plain').send(lines.join('\r\n') + '\r\n');
  }

  /**
   * Máy gọi POST /iclock/cdata?table=ATTLOG để đẩy log chấm công thật.
   * Cũng có thể nhận table=OPERLOG/USER/... (log thao tác, đồng bộ user...) -
   * hiện tại hệ thống chỉ cần ATTLOG nên các table khác chỉ ACK, không xử lý.
   *
   * ⚠️ LUÔN trả "OK" kể cả khi có lỗi parse/lỗi DB — trả lỗi HTTP sẽ khiến máy
   * coi là chưa nhận được và gửi lại log y hệt liên tục (đúng theo giao thức).
   * Lỗi thật (nếu có) chỉ log ra server để admin tự kiểm tra, không phản hồi
   * cho máy biết.
   */
  @Post('cdata')
  async pushData(
    @Query('SN') sn: string,
    @Query('table') table: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      if (table === 'ATTLOG') {
        if (!this.zkDeviceService.isKnownDeviceSerial(sn)) {
          // SN lạ (không khớp máy đã cấu hình) - không ghi vào DB nhưng vẫn
          // ACK "OK" để không làm thiết bị lạ/kẻ dò quét hiểu nhầm là lỗi.
          this.logger.warn(`[ADMS] Bỏ qua ATTLOG từ SN lạ: ${sn ?? '(không có)'}`);
        } else {
          const rawBody = this.extractRawBody(req);
          await this.zkDeviceService.ingestPushAttendance(sn, rawBody);
        }
      }
      // table khác (OPERLOG, USER, OPTIONS...) - chỉ ACK, chưa xử lý.
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[ADMS] Lỗi xử lý push (SN=${sn}, table=${table}): ${message}`,
      );
      // Không throw - vẫn ACK OK bên dưới để tránh máy gửi lại vô hạn.
    }

    res.status(200).type('text/plain').send('OK');
  }

  /**
   * Máy định kỳ gọi GET /iclock/getrequest để hỏi "có lệnh gì cho tôi không"
   * (vd: thêm user, đổi cấu hình...). Hệ thống hiện chưa gửi lệnh chủ động nào
   * xuống máy, nên luôn trả "OK" (nghĩa là "không có lệnh gì").
   */
  @Get('getrequest')
  getRequest(@Query('SN') sn: string, @Res() res: Response) {
    res.status(200).type('text/plain').send('OK');
  }

  /**
   * Đọc raw text body của request. Body-parser mặc định của Nest/Express chỉ
   * hiểu application/json và x-www-form-urlencoded; máy gửi Content-Type:
   * text/plain (hoặc đôi khi thiếu hẳn header này) nên cần middleware riêng
   * (đăng ký trong main.ts) parse mọi content-type thành text cho đúng route
   * này. Hàm này chỉ chuẩn hoá lại thành string dù middleware trả về gì.
   */
  private extractRawBody(req: Request): string {
    const body = req.body;
    if (typeof body === 'string') return body;
    if (Buffer.isBuffer(body)) return body.toString('utf-8');
    return '';
  }
}