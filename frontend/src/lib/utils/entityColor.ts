/**
 * Màu mặc định dùng khi 1 entity (Role/Position/Department/AssignmentGroupConfig)
 * chưa có `color` (không nên xảy ra - BE cột NOT NULL DEFAULT '#1890ff', xem
 * migration AddColorToRbacGroupingTables1781300000000 - đây CHỈ là fallback an
 * toàn cho dữ liệu tham chiếu không đầy đủ, vd object rút gọn từ API cũ).
 *
 * ⚠️ Đây KHÔNG phải "hardcode màu" theo đúng nghĩa bị cấm (1 màu áp cho MỌI
 * dòng dữ liệu) - đây là fallback DUY NHẤT khi thiếu dữ liệu, mọi nơi hiển
 * thị Tag PHẢI ưu tiên đọc `color` thật của record trước (xem `resolveEntityColor`).
 */
export const DEFAULT_ENTITY_COLOR = '#1890ff';

/** Đọc màu thật của 1 entity (Role/Position/Department/AssignmentGroupConfig),
 * fallback về DEFAULT_ENTITY_COLOR CHỈ khi thiếu dữ liệu. */
export function resolveEntityColor(color?: string | null): string {
  return color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : DEFAULT_ENTITY_COLOR;
}

/** Làm TỐI 1 màu hex theo `percent` (0-1, vd 0.4 = tối hơn 40%) - nhân từng
 * kênh RGB với `(1 - percent)` rồi làm tròn, KHÔNG đổi hue (khác pha trộn với
 * đen/trắng theo tỉ lệ khác). Dùng để border Card tối hơn nền/Tag cùng 1 màu
 * gốc (yêu cầu chủ dự án 2026-09-25: border Task Card ở Kanban/Agenda/... lấy
 * đúng `task.color`, tối hơn 40% để vẫn nổi trên nền card trắng). */
export function darkenColor(hex: string, percent: number): string {
  const m = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
  if (!m) return hex;
  const factor = 1 - Math.min(1, Math.max(0, percent));
  const channel = (h: string) => Math.round(parseInt(h, 16) * factor).toString(16).padStart(2, '0');
  return `#${channel(m[1])}${channel(m[2])}${channel(m[3])}`;
}

/** Làm SÁNG 1 màu hex theo `percent` (0-1, vd 0.5 = sáng hơn 50%) - trộn từng
 * kênh RGB với trắng (255) theo tỉ lệ `percent` rồi làm tròn (mirror
 * `darkenColor` ở trên nhưng trộn với trắng thay vì nhân hệ số tối). Dùng để
 * tô nền (background) Task Card cùng tông màu `task.color` (yêu cầu chủ dự án
 * 2026-09-25: BG từng TaskCard dùng đúng màu đó, sáng hơn 50%). */
export function lightenColor(hex: string, percent: number): string {
  const m = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
  if (!m) return hex;
  const factor = Math.min(1, Math.max(0, percent));
  const channel = (h: string) => {
    const v = parseInt(h, 16);
    return Math.round(v + (255 - v) * factor).toString(16).padStart(2, '0');
  };
  return `#${channel(m[1])}${channel(m[2])}${channel(m[3])}`;
}

/** Màu xám gần trắng dùng làm BG Task Card khi `task.color` gốc quá đậm (vd
 * Đen/near-black) - xem JSDoc `getTaskCardBackground` bên dưới để hiểu vì sao
 * cần 1 GIÁ TRỊ CỐ ĐỊNH riêng thay vì tiếp tục `lightenColor` bình thường. */
const NEAR_BLACK_FALLBACK_BG = '#F2F2F2';

/** Ngưỡng độ sáng cảm nhận (perceived luminance, công thức ITU-R BT.601:
 * 0.299*R + 0.587*G + 0.114*B, thang 0-255) để coi 1 màu là "quá đậm". Chọn
 * 60 vì các màu tối thường dùng làm Task color (Đen #000000, Xám than
 * #262626, Navy đậm #061178...) đều rơi dưới ngưỡng này, trong khi các màu
 * "đậm nhưng vẫn có hue rõ" (Đỏ #f5222d ~ luminance 91, Xanh dương đậm
 * #1890ff ~ luminance 130) nằm trên ngưỡng - đúng ý chủ dự án: CHỈ ép về xám
 * khi màu gần như Đen tuyệt đối, không ép luôn các màu đậm khác có hue. */
const DARK_COLOR_LUMINANCE_THRESHOLD = 60;

/** Màu nền (background) dùng cho Task Card, tính từ `task.color` gốc.
 *
 * MỚI (2026-09-25, phản hồi chủ dự án lần 2 - ảnh chụp Kanban cho thấy BG
 * `lightenColor(color, 0.5)` VẪN quá đậm, đọc chữ đen trong Card khó): tăng
 * % sáng lên 0.9 (thay vì 0.5 lượt trước) để BG chỉ còn là 1 lớp "tint" rất
 * nhạt, không lấn át chữ/Tag bên trong Card nữa.
 *
 * MỚI (2026-09-25, phản hồi chủ dự án lần 3 - yêu cầu "sáng hơn 120%"): công
 * thức trộn với trắng (`lightenColor`) GIỚI HẠN toán học ở đúng 100% (channel
 * + (255-channel)*1 = 255 với MỌI channel) - từ 100% trở lên MỌI màu gốc đều
 * ra `#FFFFFF` giống hệt nhau, không còn cách nào "sáng hơn nữa". Đã hỏi lại
 * và chủ dự án chọn KHÔNG muốn trắng thuần (mất khả năng phân biệt màu giữa
 * các Task Card, dù border/pill vẫn còn giữ màu) - chốt 0.95 (thay vì 0.9)
 * làm điểm cân bằng: vẫn còn 1 lớp tint RẤT nhạt để phân biệt được, nhưng
 * sáng hơn hẳn so với 0.9 trước đó.
 *
 * QUY ƯỚC MỚI (yêu cầu chủ dự án cùng lượt): nếu `task.color` gốc quá ĐẬM
 * (vd Đen #000000, Xám than gần đen) thì KHÔNG dùng `lightenColor` bình
 * thường nữa - vì trộn tỉ lệ với trắng trên 1 màu gần-đen-nhưng-không-thuần-
 * xám (vd #1a1a2e navy rất tối) vẫn để lại chút "ám màu" (color cast) ở BG
 * dù đã sáng 90%, KHÔNG cho ra đúng cảm giác "xám gần trắng" thuần như chủ dự
 * án mô tả - phải ép cứng về `NEAR_BLACK_FALLBACK_BG` (xám trung tính, không
 * hue) khi độ sáng cảm nhận (luminance) của màu gốc dưới
 * `DARK_COLOR_LUMINANCE_THRESHOLD`.
 */
export function getTaskCardBackground(hex?: string | null): string {
  const color = resolveEntityColor(hex);
  const m = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(color);
  if (!m) return NEAR_BLACK_FALLBACK_BG;

  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

  if (luminance < DARK_COLOR_LUMINANCE_THRESHOLD) {
    return NEAR_BLACK_FALLBACK_BG;
  }
  return lightenColor(color, 0.96);
}