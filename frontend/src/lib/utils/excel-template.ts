import * as XLSX from 'xlsx';

export const generateTemplateFile = () => {
  const headers = [
    'Họ và Tên',
    'Số điện thoại',
    'Email',
    'Nguồn',
    'Chiến dịch',
    'Trạng thái',
    'Broker',
    'Ngày nhập data',
    'Ngày chốt',
    'Ghi chú'
  ];

  const exampleData = [
    'Nguyễn Văn Excel',
    '0912345678',
    'excel@example.com',
    'Facebook',
    'Sale Mùa Hè',
    'pending',
    'Vndirect',
    '10/08/2026',
    '15/08/2026',
    'Khách từ file mẫu'
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, exampleData]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'KhachHang');

  XLSX.writeFile(wb, 'AZWorkbase_Template_KhachHang.xlsx');
};
