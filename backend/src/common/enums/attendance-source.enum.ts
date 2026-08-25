export enum AttendanceSource {
  // Server chủ động kết nối TCP/IP tới máy và kéo log về (polling thủ công,
  // chỉ dùng khi admin bấm "Đồng bộ thủ công" từ cùng LAN/VPN với máy)
  DEVICE_PULL = 'device_pull',
  // Máy tự động đẩy log lên server qua ADMS Push - nguồn dữ liệu chính,
  // tự động real-time, không cần cron/polling từ phía server
  DEVICE_PUSH = 'device_push',
}