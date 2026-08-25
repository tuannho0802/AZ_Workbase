export enum AttendanceSource {
  // Server chủ động kết nối TCP/IP tới máy và kéo log về (polling)
  DEVICE_PULL = 'device_pull',
  // Máy tự động đẩy log lên server qua ADMS (chưa dùng ở giai đoạn này,
  // để sẵn cho việc mở rộng sau)
  DEVICE_PUSH = 'device_push',
}
