import { PeriodicTask } from '@/lib/api/periodic-tasks.api';

export interface TaskLinkEdge {
  parentTaskId: number;
  childTaskId: number;
}

export interface TaskChainInfo {
  /** ID ổn định của cả nhóm - dùng ID nhỏ nhất trong nhóm (KHÔNG đổi dù
   * thành viên có được thêm/bớt giữa các lần tải, miễn thành viên nhỏ nhất
   * còn tồn tại) - dùng làm seed để chọn màu ổn định qua nhiều lần render. */
  chainId: number;
  /** Màu accent riêng của nhóm (khác `task.color`/`status.color`) - CHỈ
   * dùng cho viền/gạch nối thể hiện "cùng 1 chuỗi liên kết", lấy từ bảng màu
   * cố định theo `chainId % palette.length` (xem `CHAIN_COLOR_PALETTE`). */
  color: string;
  /** Toàn bộ ID Task trong nhóm, đã sắp topological (cha trước con) - dùng
   * để hiển thị Tooltip "Liên kết với: ..." theo đúng thứ tự chuỗi. */
  memberIds: number[];
  /** Vị trí (0-based) của chính Task này trong `memberIds`. */
  index: number;
  /** true nếu ĐANG là điểm nối với thành viên NGAY TRƯỚC trong danh sách
   * đang hiển thị hiện tại (2 dòng/card liền kề CÙNG 1 nhóm) - dùng vẽ đoạn
   * nối phía TRÊN. Tính riêng theo từng view (`connectPrev`/`connectNext`
   * do CALLER tự gắn sau khi đã `sortTasksByChain()`, KHÔNG tính sẵn ở đây
   * vì phụ thuộc thứ tự hiển thị thực tế của từng view, không phải thứ tự
   * topological cố định).
   */
}

/** Bảng màu accent cho connector - cố tình KHÁC hẳn dải màu mặc định của
 * Tag trạng thái/phòng ban (đỏ/cam/lục/lam tươi) để không gây nhầm lẫn với
 * ý nghĩa nghiệp vụ (trạng thái/phòng ban), chỉ mang tính PHÂN BIỆT trực
 * quan giữa các chuỗi liên kết khác nhau. */
const CHAIN_COLOR_PALETTE = [
  '#9254de', // tím
  '#36cfc9', // ngọc
  '#ff85c0', // hồng
  '#ffc069', // cam nhạt
  '#5cdbd3', // xanh ngọc nhạt
  '#b37feb', // tím nhạt
  '#95de64', // lục nhạt
  '#ff9c6e', // cam đất
];

/**
 * buildTaskLinkChains - Phase 8 (PLAN mục Phase 8): gộp `edges` (đã lọc RBAC
 * ở BE, xem `getLinksAmong()`) thành các "chuỗi liên kết" (connected
 * component, coi cạnh là VÔ HƯỚNG dù bản chất cha-con có hướng - mục đích ở
 * đây là NHÓM trực quan, không phải hiển thị lại cây phân cấp) rồi trả về
 * `Map<taskId, TaskChainInfo>` - Task KHÔNG có cạnh nào sẽ KHÔNG có mặt
 * trong map (caller coi `undefined` = "không thuộc chuỗi nào cả", không vẽ
 * connector).
 *
 * Thứ tự thành viên trong mỗi nhóm dùng Kahn's algorithm (topological sort)
 * dựa trên chiều `parentTaskId -> childTaskId` thật của cạnh - nhóm có nhiều
 * cha (multi-parent, xem PLAN mục 2.2) vẫn cho ra 1 thứ tự hợp lệ (không
 * duy nhất, nhưng ổn định vì tie-break theo ID tăng dần).
 */
export function buildTaskLinkChains(edges: TaskLinkEdge[]): Map<number, TaskChainInfo> {
  const result = new Map<number, TaskChainInfo>();
  if (edges.length === 0) return result;

  // 1. Union-Find để gom nhóm (connected component) - đơn giản, đủ nhanh
  //    cho quy mô edge hiện tại (vài chục).
  const parentOf = new Map<number, number>();
  const find = (x: number): number => {
    if (!parentOf.has(x)) parentOf.set(x, x);
    let root = x;
    while (parentOf.get(root) !== root) root = parentOf.get(root) as number;
    parentOf.set(x, root);
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parentOf.set(ra, rb);
  };
  for (const e of edges) {
    union(e.parentTaskId, e.childTaskId);
  }

  const groups = new Map<number, Set<number>>();
  for (const id of parentOf.keys()) {
    const root = find(id);
    const set = groups.get(root) ?? new Set<number>();
    set.add(id);
    groups.set(root, set);
  }

  // 2. Với mỗi nhóm >= 2 thành viên: topological sort (Kahn) + gán màu.
  for (const memberSet of groups.values()) {
    if (memberSet.size < 2) continue; // an toàn - không xảy ra thực tế vì mọi id ở đây đều có >= 1 cạnh
    const members = Array.from(memberSet);
    const chainId = Math.min(...members);
    const color = CHAIN_COLOR_PALETTE[chainId % CHAIN_COLOR_PALETTE.length];

    const inDegree = new Map<number, number>(members.map((m) => [m, 0]));
    const adjacency = new Map<number, number[]>(members.map((m) => [m, []]));
    for (const e of edges) {
      if (!memberSet.has(e.parentTaskId) || !memberSet.has(e.childTaskId)) continue;
      adjacency.get(e.parentTaskId)?.push(e.childTaskId);
      inDegree.set(e.childTaskId, (inDegree.get(e.childTaskId) ?? 0) + 1);
    }

    const ordered: number[] = [];
    let frontier = members.filter((m) => (inDegree.get(m) ?? 0) === 0).sort((a, b) => a - b);
    const visited = new Set<number>();
    while (frontier.length > 0) {
      const next = frontier.shift() as number;
      if (visited.has(next)) continue;
      visited.add(next);
      ordered.push(next);
      const children = (adjacency.get(next) ?? []).sort((a, b) => a - b);
      for (const child of children) {
        inDegree.set(child, (inDegree.get(child) ?? 1) - 1);
        if ((inDegree.get(child) ?? 0) <= 0 && !visited.has(child)) {
          frontier.push(child);
          frontier.sort((a, b) => a - b);
        }
      }
    }
    // Phòng hờ cycle lọt qua (không nên xảy ra - BE đã chặn cycle lúc tạo
    // cạnh, xem `wouldCreateCycle()`) - thành viên còn sót được thêm cuối
    // theo ID tăng dần, không để mất khỏi Tooltip.
    for (const m of members) {
      if (!visited.has(m)) ordered.push(m);
    }

    ordered.forEach((taskId, index) => {
      result.set(taskId, { chainId, color, memberIds: ordered, index });
    });
  }

  return result;
}

export interface ChainRunFlag {
  color: string;
  isFirst: boolean;
  isLast: boolean;
  /** Vị trí (0-based) của Task trong "run" đang hiển thị - phản hồi chủ dự
   * án 2026-09-15 (bản tree view "chưa đủ dài/rõ ràng"): Bảng cần giá trị
   * này để thụt lề TĂNG DẦN theo từng cấp (staircase, giống Agenda) thay vì
   * mọi Task trong 1 chuỗi thụt CÙNG 1 mức như bản trước - xem cách dùng ở
   * cột "Công việc" (`page.tsx`). KHÔNG trùng với `TaskChainInfo.index`
   * (thứ tự topological cố định toàn chuỗi, kể cả thành viên KHÔNG hiển thị
   * liền kề trong danh sách hiện tại) - đây là vị trí trong "run" ĐANG THẤY. */
  depth: number;
}

/**
 * getChainRunFlags - Phase 8 (yêu cầu chủ dự án 2026-09-15: đồng bộ đường nối
 * ở Bảng giống Agenda). Bảng render mỗi Task thành 1 `<tr>` riêng (không có
 * 1 khối DOM chung để vẽ đường kẻ liên tục như `TaskChainGroupedList`), nên
 * thay vì trả về "khối", hàm này gắn cờ `isFirst`/`isLast` cho từng Task
 * thuộc 1 "run" (nhóm Task LIỀN NHAU cùng 1 chuỗi trong `tasks` ĐÃ sắp qua
 * `sortTasksByChain()`) - Caller (mỗi `<tr>` tự vẽ NỬA đoạn kẻ trên/dưới +
 * chấm tròn dựa vào cờ này) rồi các nửa đoạn của 2 dòng liền kề sẽ khớp lại
 * thành 1 đường liên tục qua mắt nhìn, dù DOM không liền khối.
 * Task không thuộc run nào (không có chuỗi, hoặc run chỉ có 1 thành viên) ->
 * KHÔNG có mặt trong map trả về (coi như "không vẽ connector" ở dòng đó).
 */
export function getChainRunFlags(tasks: PeriodicTask[], chains: Map<number, TaskChainInfo>): Map<number, ChainRunFlag> {
  const result = new Map<number, ChainRunFlag>();
  const runs: Array<{ color: string; ids: number[] }> = [];
  for (const task of tasks) {
    const chain = chains.get(task.id);
    const last = runs[runs.length - 1];
    if (chain && last && last.color === chain.color) {
      last.ids.push(task.id);
    } else {
      runs.push({ color: chain?.color ?? '', ids: [task.id] });
    }
  }
  for (const run of runs) {
    if (!run.color || run.ids.length < 2) continue;
    run.ids.forEach((id, idx) => {
      result.set(id, { color: run.color, isFirst: idx === 0, isLast: idx === run.ids.length - 1, depth: idx });
    });
  }
  return result;
}
/**
 * sortTasksByChain - sắp lại `tasks` sao cho thành viên CÙNG 1 chuỗi đứng
 * LIỀN NHAU ("xếp hàng" theo đúng yêu cầu) - giữ NGUYÊN thứ tự tương đối
 * ban đầu cho phần còn lại (stable sort: nhóm nào xuất hiện đầu tiên ở vị
 * trí nào trong `tasks` gốc thì cả nhóm "trồi" lên đúng vị trí đó, không
 * xáo trộn các Task không thuộc chuỗi nào).
 */
export function sortTasksByChain(tasks: PeriodicTask[], chains: Map<number, TaskChainInfo>): PeriodicTask[] {
  if (chains.size === 0) return tasks;

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const firstSeenAt = new Map<number, number>(); // chainId -> index đầu tiên gặp trong `tasks` gốc
  tasks.forEach((t, i) => {
    const chain = chains.get(t.id);
    if (chain && !firstSeenAt.has(chain.chainId)) firstSeenAt.set(chain.chainId, i);
  });

  const seen = new Set<number>();
  const out: PeriodicTask[] = [];
  tasks.forEach((t, i) => {
    if (seen.has(t.id)) return;
    const chain = chains.get(t.id);
    if (!chain) {
      out.push(t);
      seen.add(t.id);
      return;
    }
    // Gặp thành viên ĐẦU TIÊN của chuỗi trong `tasks` gốc -> chèn NGUYÊN cả
    // chuỗi (theo đúng `memberIds` đã topological sort) tại đây, rồi đánh
    // dấu `seen` cho mọi thành viên để bỏ qua khi lặp tới lượt chúng.
    if (firstSeenAt.get(chain.chainId) === i) {
      for (const memberId of chain.memberIds) {
        const member = byId.get(memberId);
        if (member && !seen.has(memberId)) {
          out.push(member);
          seen.add(memberId);
        }
      }
    }
  });

  return out;
}