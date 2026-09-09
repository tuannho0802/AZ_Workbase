import {
  removeVietnameseDiacritics,
  toPascalSlug,
  buildReadableFileName,
  buildAttachmentFileName,
  formatShortDateVN,
} from './vietnamese-slug.util';

describe('vietnamese-slug.util', () => {
  describe('removeVietnameseDiacritics', () => {
    it('bỏ đúng các dấu thanh + nguyên âm biến thể tiếng Việt', () => {
      expect(removeVietnameseDiacritics('Nguyễn Văn A')).toBe('Nguyen Van A');
      expect(removeVietnameseDiacritics('Phòng Hỗ trợ Kỹ thuật')).toBe('Phong Ho tro Ky thuat');
    });

    it('xử lý riêng đ/Đ (không tự tách được bằng NFD như các dấu khác)', () => {
      expect(removeVietnameseDiacritics('Đặng Đình Đức')).toBe('Dang Dinh Duc');
    });

    it('chuỗi thuần ASCII giữ nguyên', () => {
      expect(removeVietnameseDiacritics('Admin Manager')).toBe('Admin Manager');
    });
  });

  describe('toPascalSlug', () => {
    it('ghép nhiều từ có dấu + khoảng trắng thành PascalCase liền không dấu', () => {
      expect(toPascalSlug('Nguyễn Văn A')).toBe('NguyenVanA');
      expect(toPascalSlug('Phòng Hỗ trợ Kỹ thuật')).toBe('PhongHoTroKyThuat');
    });

    it('role code dạng snake_case (vd role tuỳ chỉnh "mkt_manager") -> PascalCase', () => {
      expect(toPascalSlug('mkt_manager')).toBe('MktManager');
      expect(toPascalSlug('admin')).toBe('Admin');
    });

    it('loại bỏ ký tự đặc biệt (dấu câu, gạch nối...) làm dấu phân cách từ', () => {
      expect(toPascalSlug("O'Brien - Sales/Marketing")).toBe('OBrienSalesMarketing');
    });

    it('chuỗi rỗng hoặc toàn ký tự đặc biệt -> trả về rỗng (không throw)', () => {
      expect(toPascalSlug('')).toBe('');
      expect(toPascalSlug('   ')).toBe('');
      expect(toPascalSlug('---')).toBe('');
    });
  });

  describe('buildReadableFileName', () => {
    it('khớp đúng ví dụ thật: tên NV + phòng ban (có dấu) + role -> PascalCase nối "_"', () => {
      expect(buildReadableFileName(['Abc Xyz', 'Phòng Hỗ trợ Kỹ thuật', 'admin'], 'png')).toBe(
        'AbcXyz_PhongHoTroKyThuat_Admin.png',
      );
    });

    it('bỏ qua phần null/undefined/rỗng, KHÔNG để lại dấu "_" thừa', () => {
      expect(buildReadableFileName(['Nguyen Van A', null, 'employee'], 'jpg')).toBe('NguyenVanA_Employee.jpg');
      expect(buildReadableFileName(['Nguyen Van A', undefined, ''], 'jpg')).toBe('NguyenVanA.jpg');
    });

    it('tất cả phần đều rỗng -> fallback "File.{ext}" thay vì tên file rỗng', () => {
      expect(buildReadableFileName([null, undefined, '   '], 'webp')).toBe('File.webp');
    });
  });

  describe('buildAttachmentFileName (ảnh đính kèm nghỉ phép - có thêm số thứ tự + ngày)', () => {
    it('khớp đúng ví dụ thật: tên NV + role + loại nghỉ phép + N (từ 1) + ngày -> nối "_"', () => {
      expect(buildAttachmentFileName(['Nguyễn Văn A', 'employee', 'Nghỉ ốm'], 1, '8-9-26', 'png')).toBe(
        'NguyenVanA_Employee_NghiOm_1_8-9-26.png',
      );
    });

    it('số thứ tự N tăng dần theo từng ảnh trong CÙNG đơn, giữ nguyên phần còn lại', () => {
      const key2 = buildAttachmentFileName(['Nguyễn Văn A', 'employee', 'Nghỉ ốm'], 2, '8-9-26', 'png');
      expect(key2).toBe('NguyenVanA_Employee_NghiOm_2_8-9-26.png');
    });

    it('ngày KHÔNG bị PascalCase/tách bởi dấu gạch ngang (giữ nguyên định dạng "d-m-yy")', () => {
      expect(buildAttachmentFileName(['A'], 1, '8-9-26', 'png')).toBe('A_1_8-9-26.png');
    });

    it('bỏ qua phần null/undefined/rỗng trong parts, KHÔNG để lại dấu "_" thừa', () => {
      expect(buildAttachmentFileName(['Nguyen Van A', null, 'Nghi om'], 1, '1-1-26', 'jpg')).toBe(
        'NguyenVanA_NghiOm_1_1-1-26.jpg',
      );
    });

    it('tất cả parts rỗng -> fallback "File" (vẫn giữ N + ngày)', () => {
      expect(buildAttachmentFileName([null, undefined], 3, '1-1-26', 'webp')).toBe('File_3_1-1-26.webp');
    });
  });

  describe('formatShortDateVN', () => {
    it('format "d-m-yy" KHÔNG zero-pad - khớp đúng ví dụ thật "8-9-26" (8/9/2026)', () => {
      expect(formatShortDateVN(new Date(2026, 8, 8))).toBe('8-9-26'); // tháng JS 0-index: 8 = tháng 9
    });

    it('ngày/tháng 2 chữ số vẫn KHÔNG zero-pad (vd 25/12/2026 -> "25-12-26")', () => {
      expect(formatShortDateVN(new Date(2026, 11, 25))).toBe('25-12-26');
    });
  });
});