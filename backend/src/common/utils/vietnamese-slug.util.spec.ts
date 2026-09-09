import { removeVietnameseDiacritics, toPascalSlug, buildReadableFileName } from './vietnamese-slug.util';

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
});
