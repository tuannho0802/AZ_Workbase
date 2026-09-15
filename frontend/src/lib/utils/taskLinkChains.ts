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
 * Thứ tự thành viên trong mỗi nhóm dùng DFS pre-order (topological, tie-break
 * theo ID tăng dần) dựa trên chiều `parentTaskId -> childTaskId` thật của
 * cạnh - nhóm có nhiều cha (multi-parent, xem PLAN mục 2.2) vẫn cho ra 1 thứ
 * tự hợp lệ (không duy nhất, nhưng ổn định). DFS (thay vì Kahn/BFS theo
 * tầng) để đảm bảo hậu duệ của 1 node luôn LIỀN KHỐI ngay sau nó - cần thiết
 * cho `getChainRunFlags()` vẽ đúng cây phân cấp thật (2026-09-15: fix bug 2
 * Task "Ngày" cùng cha "Tuần" bị vẽ lồng vào nhau thay vì cùng cấp).
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

    // DFS pre-order (KHÔNG dùng Kahn/BFS theo tầng như trước) - cha luôn
    // đứng ngay trước, và TOÀN BỘ hậu duệ của 1 node luôn nằm LIỀN NHAU
    // ngay sau nó trước khi sang nhánh kế tiếp. Bắt buộc phải vậy để
    // `getChainRunFlags()` vẽ đúng cây phân cấp thật: Kahn cũ xử lý theo
    // TỪNG TẦNG (mọi node hết in-degree được đẩy chung 1 hàng đợi, tie-break
    // theo ID) nên cháu của nhánh A có ID nhỏ có thể bị xen vào TRƯỚC con
    // của nhánh B - phá vỡ tính liền khối theo nhánh mà thuật toán vẽ
    // connector (elbow/pass-through) cần.
    const ordered: number[] = [];
    const roots = members.filter((m) => (inDegree.get(m) ?? 0) === 0).sort((a, b) => a - b);
    const visited = new Set<number>();
    const visit = (nodeId: number) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      ordered.push(nodeId);
      const children = (adjacency.get(nodeId) ?? []).sort((a, b) => a - b);
      for (const child of children) visit(child);
    };
    for (const root of roots) visit(root);
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
  /** Cấp trong CÂY PHÂN CẤP THẬT (0 = gốc của nhánh đang hiển thị) - tính
   * bằng khoảng cách thật (số cạnh) tới gốc qua quan hệ `parentTaskId ->
   * childTaskId`, KHÔNG phải theo vị trí hiển thị và KHÔNG suy trực tiếp từ
   * `PERIOD_RANK` (để vẫn đúng với liên kết skip-level, vd Daily nối thẳng
   * lên Monthly bỏ qua Weekly - lúc đó Daily vẫn chỉ cách gốc Monthly đúng 1
   * cấp, không phải 2). 2026-09-15 fix: bản trước dùng vị trí (index) trong
   * "run" đang hiển thị làm depth -> 2 Task CÙNG cấp (vd 2 Task "Ngày" cùng
   * 1 cha "Tuần") bị gán depth khác nhau, vẽ lồng vào nhau như quan hệ
   * cha-con thay vì anh em cùng cấp. */
  depth: number;
  /** true nếu Task này KHÔNG có cha nào khác đang hiển thị trong cùng run -
   * là gốc của 1 nhánh (thường là gốc của cả chuỗi). Gốc không vẽ đoạn nối
   * đi vào từ phía trên. */
  isRoot: boolean;
  /** true nếu đây là con CUỐI CÙNG (theo thứ tự hiển thị) trong danh sách
   * con của cha - quyết định trục của CHA có cần vẽ tiếp xuống dưới điểm bẻ
   * góc của dòng này hay dừng lại (chỉ 1 chấm nếu là con cuối). */
  isLastChild: boolean;
  /** true nếu Task này có ít nhất 1 con đang hiển thị NGAY SAU nó trong
   * `tasks` - cần vẽ trục CHÍNH của dòng này (khác trục của cha) tiếp tục
   * xuống dòng dưới. */
  hasVisibleChildren: boolean;
  /** Các cấp TỔ TIÊN (nhỏ hơn `depth`, KHÔNG tính cấp của cha trực tiếp -
   * cấp đó dùng `isLastChild` riêng) mà tổ tiên ở cấp đó CHƯA phải con cuối
   * của CHA của chính tổ tiên đó (tức còn nhánh anh em khác của tổ tiên sẽ
   * xuất hiện ở các dòng phía dưới) - Caller vẽ 1 gạch dọc XUYÊN SUỐT cả
   * chiều cao dòng này tại đúng cấp đó để đường nối của tổ tiên không bị đứt
   * đoạn khi có nhánh khác chen giữa (cây phân cấp nhiều tầng, nhiều con). */
  passThroughDepths: number[];
}

/**
 * getChainRunFlags - Phase 8 (yêu cầu chủ dự án 2026-09-15: đồng bộ đường nối
 * ở Bảng giống Agenda; fix cùng ngày: dựng ĐÚNG cây phân cấp thật theo cạnh
 * thay vì suy depth từ vị trí hiển thị). Bảng render mỗi Task thành 1 `<tr>`
 * riêng (không có 1 khối DOM chung để vẽ đường kẻ liên tục như
 * `TaskChainGroupedList`), nên hàm này gắn cờ cho từng Task thuộc 1 "run"
 * (nhóm Task LIỀN NHAU cùng 1 chuỗi trong `tasks` ĐÃ sắp qua
 * `sortTasksByChain()`, vốn đã dùng DFS pre-order nên hậu duệ của 1 Task
 * luôn liền khối ngay sau nó) - Caller (mỗi `<tr>` tự vẽ nửa đoạn kẻ trên/
 * dưới + gạch xuyên suốt + chấm tròn dựa vào cờ này) rồi các nửa đoạn của
 * các dòng liền kề khớp lại thành đường liên tục qua mắt nhìn, dù DOM không
 * liền khối.
 * Task không thuộc run nào (không có chuỗi, hoặc run chỉ có 1 thành viên) ->
 * KHÔNG có mặt trong map trả về (coi như "không vẽ connector" ở dòng đó).
 *
 * `edges` CHỈ dùng cạnh có CẢ 2 đầu đang hiển thị trong CÙNG 1 run để chọn
 * cha - Task có cha KHÔNG hiển thị (bị lọc/khác trang) được coi là gốc tại
 * chỗ, tránh vẽ nối tới 1 dòng không tồn tại trên màn hình. Với Task có
 * nhiều cha hợp lệ cùng hiển thị (multi-parent, xem `PeriodicTaskLink`), chỉ
 * dùng ĐÚNG 1 cha để vẽ (mục đích ở đây là hiển thị trực quan 1 cây, không
 * phải vẽ lại toàn bộ DAG) - ưu tiên cha đứng GẦN NHẤT ngay phía trước trong
 * thứ tự hiển thị hiện tại.
 */
export function getChainRunFlags(
  tasks: PeriodicTask[],
  chains: Map<number, TaskChainInfo>,
  edges: TaskLinkEdge[],
): Map<number, ChainRunFlag> {
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
    const idSet = new Set(run.ids);
    const indexOf = new Map(run.ids.map((id, idx) => [id, idx]));

    // 1. Cha thật (đã lọc chỉ trong run) của mỗi Task - xem JSDoc phía trên
    //    về cách chọn 1 cha khi multi-parent.
    const parentOf = new Map<number, number>();
    for (const e of edges) {
      if (!idSet.has(e.childTaskId) || !idSet.has(e.parentTaskId)) continue;
      const childIdx = indexOf.get(e.childTaskId) as number;
      const parentIdx = indexOf.get(e.parentTaskId) as number;
      if (parentIdx >= childIdx) continue; // an toàn - cha luôn đứng trước con (DFS pre-order)
      const currentParent = parentOf.get(e.childTaskId);
      const currentParentIdx = currentParent === undefined ? -1 : (indexOf.get(currentParent) as number);
      if (parentIdx > currentParentIdx) parentOf.set(e.childTaskId, e.parentTaskId);
    }

    // 2. Depth = khoảng cách thật tới gốc qua `parentOf` (KHÔNG phải vị trí
    //    hiển thị - xem JSDoc field `depth`).
    const depthOf = new Map<number, number>();
    const getDepth = (id: number): number => {
      const cached = depthOf.get(id);
      if (cached !== undefined) return cached;
      const parent = parentOf.get(id);
      const depth = parent === undefined ? 0 : getDepth(parent) + 1;
      depthOf.set(id, depth);
      return depth;
    };

    // 3. Danh sách con (theo đúng thứ tự hiển thị) của mỗi Task -> suy ra
    //    `isLastChild` / `hasVisibleChildren`.
    const childrenOf = new Map<number, number[]>();
    run.ids.forEach((id) => {
      const parent = parentOf.get(id);
      if (parent === undefined) return;
      const list = childrenOf.get(parent) ?? [];
      list.push(id);
      childrenOf.set(parent, list);
    });
    const isLastChild = new Map<number, boolean>();
    run.ids.forEach((id) => {
      const parent = parentOf.get(id);
      if (parent === undefined) {
        isLastChild.set(id, true); // gốc: không có cha nên không cần kéo trục cha xuống
        return;
      }
      const siblings = childrenOf.get(parent) ?? [];
      isLastChild.set(id, siblings[siblings.length - 1] === id);
    });

    // 4. `passThroughDepths` - đi ngược chuỗi tổ tiên (bỏ qua cha trực tiếp,
    //    cấp đó dùng `isLastChild` riêng), cấp nào tổ tiên CHƯA phải con
    //    cuối của cha nó -> cần gạch xuyên suốt dòng này tại cấp đó.
    const getAncestorChain = (id: number): number[] => {
      const chain: number[] = [];
      let cur = parentOf.get(id);
      while (cur !== undefined) {
        chain.unshift(cur);
        cur = parentOf.get(cur);
      }
      return chain; // [gốc, ..., cha trực tiếp]
    };

    run.ids.forEach((id) => {
      const depth = getDepth(id);
      const ancestors = getAncestorChain(id);
      const passThroughDepths: number[] = [];
      for (let i = 0; i < ancestors.length - 1; i++) {
        if (!isLastChild.get(ancestors[i])) passThroughDepths.push(i);
      }
      result.set(id, {
        color: run.color,
        depth,
        isRoot: parentOf.get(id) === undefined,
        isLastChild: isLastChild.get(id) ?? true,
        hasVisibleChildren: (childrenOf.get(id) ?? []).length > 0,
        passThroughDepths,
      });
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