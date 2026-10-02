/**
 * guides-sync.ts - đồng bộ `guides-content/*.md` (ở gốc repo) vào bảng `guides`.
 *
 *   npm run guides:sync                       # CHẠY THỬ (mặc định): chỉ in ra sẽ làm gì, KHÔNG ghi DB
 *   npm run guides:sync -- --apply            # ghi thật (bài mới + bài file đã đổi mà DB chưa bị sửa tay)
 *   npm run guides:sync -- --apply --force    # ghi đè cả bài đang XUNG ĐỘT (DB đã bị sửa tay trên UI)
 *   npm run guides:sync -- --only=khach-hang,chia-data
 *   npm run guides:sync -- --dir=../guides-content --user=1
 *
 * Mã thoát 1 nếu có file lỗi / bài lỗi / xung đột chưa xử lý. KHÔNG bao giờ xoá bài (bài có trong DB mà không có file chỉ được liệt kê).
 * DB đích = biến môi trường DB_* (xem data-source.ts) - lệnh --apply lên production do BẠN tự chạy và xác nhận.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AppDataSource } from '../src/database/data-source';
import { Guide } from '../src/database/entities/guide.entity';
import { User } from '../src/database/entities/user.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Setting } from '../src/database/entities/setting.entity';
import { RoleEntity } from '../src/database/entities/role.entity';
import { Position } from '../src/database/entities/position.entity';
import { Department } from '../src/database/entities/department.entity';
import { Permission } from '../src/database/entities/permission.entity';
import { AuditService } from '../src/modules/audit/audit.service';
import { GuidesService, GuideCaller } from '../src/modules/guides/guides.service';
import { GuideFileError, GuideSpec, parseGuideFile } from '../src/modules/guides/sync/guide-file.parser';
import { executeSync } from '../src/modules/guides/sync/guide-sync.executor';
import { TypeOrmSyncStore } from '../src/modules/guides/sync/typeorm-sync.store';

interface Args {
  apply: boolean;
  force: boolean;
  dir: string;
  user?: number;
  only: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, force: false, dir: path.resolve(process.cwd(), '..', 'guides-content'), only: [] };
  for (const a of argv) {
    if (a === '--apply') args.apply = true;
    else if (a === '--force') args.force = true;
    else if (a.startsWith('--dir=')) args.dir = path.resolve(process.cwd(), a.slice(6));
    else if (a.startsWith('--user=')) args.user = Number(a.slice(7));
    else if (a.startsWith('--only=')) args.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else throw new Error(`Tham số lạ: ${a}`);
  }
  if (args.user !== undefined && !Number.isInteger(args.user)) throw new Error('--user phải là id số nguyên');
  return args;
}

/** Đọc mọi `*.md` trong thư mục (bỏ file bắt đầu bằng `_`, vd `_template.md`, và README). Lỗi từng file được gom lại, không dừng cả mẻ. */
function readFiles(dir: string): { specs: GuideSpec[]; errors: string[] } {
  if (!fs.existsSync(dir)) throw new Error(`Không thấy thư mục nội dung: ${dir}`);
  const specs: GuideSpec[] = [];
  const errors: string[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.md') || name.startsWith('_') || name.toLowerCase() === 'readme.md') continue;
    try {
      specs.push(parseGuideFile(name, fs.readFileSync(path.join(dir, name), 'utf8')));
    } catch (e) {
      errors.push(e instanceof GuideFileError ? e.message : `${name}: ${(e as Error).message}`);
    }
  }
  return { specs, errors };
}

const ICON: Record<string, string> = {
  create: '+ TẠO MỚI ',
  update: '~ CẬP NHẬT',
  forced: '! GHI ĐÈ   ',
  unchanged: '= không đổi',
  adopt: '= không đổi (ghi hash gốc)',
  conflict: '× XUNG ĐỘT ',
  error: '× LỖI      ',
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { specs, errors: fileErrors } = readFiles(args.dir);
  console.log(`Thư mục nội dung: ${args.dir} (${specs.length} bài hợp lệ, ${fileErrors.length} file lỗi)`);
  for (const e of fileErrors) console.error(`  × ${e}`);

  await AppDataSource.initialize();
  try {
    console.log(`DB đích: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_DATABASE}`);
    console.log(args.apply ? (args.force ? 'CHẾ ĐỘ: --apply --force (có ghi đè xung đột)' : 'CHẾ ĐỘ: --apply (ghi thật)') : 'CHẾ ĐỘ: chạy thử (không ghi) - thêm --apply để ghi');

    const userRepo = AppDataSource.getRepository(User);
    const actorUser = args.user
      ? await userRepo.findOne({ where: { id: args.user } })
      : await userRepo.findOne({ where: { role: 'admin', isRootAdmin: true }, order: { id: 'ASC' } });
    if (!actorUser) throw new Error(args.user ? `Không thấy user id=${args.user}` : 'Không thấy Root Admin nào để ghi created_by/audit - dùng --user=<id>');
    const actor: GuideCaller = { id: actorUser.id, role: actorUser.role, isRootAdmin: !!actorUser.isRootAdmin };
    console.log(`Người thực hiện (created_by/updated_by/audit): #${actorUser.id} ${actorUser.name}`);

    // AuditService thật nhưng `logActionAsync` được chờ xong trước khi đóng kết nối (script ngắn hạn, không có waitUntil của Vercel).
    const realAudit = new AuditService(AppDataSource.getRepository(AuditLog), AppDataSource.getRepository(Setting));
    const pending: Promise<unknown>[] = [];
    const audit = {
      logActionAsync: (...a: Parameters<AuditService['logAction']>) => {
        pending.push(realAudit.logAction(...a).catch((e: Error) => console.error(`  (audit lỗi: ${e.message})`)));
      },
    } as unknown as AuditService;

    // PermissionsService chỉ dùng cho nhánh ĐỌC (canManage/viewerOf) - create/update không đụng tới.
    const guides = new GuidesService(
      AppDataSource.getRepository(Guide),
      AppDataSource.getRepository(RoleEntity),
      AppDataSource.getRepository(Position),
      AppDataSource.getRepository(Department),
      userRepo,
      AppDataSource.getRepository(Permission),
      AppDataSource,
      null as never,
      audit,
    );

    const report = await executeSync(specs, new TypeOrmSyncStore(AppDataSource, guides, actor), {
      apply: args.apply,
      force: args.force,
      only: args.only,
    });
    await Promise.all(pending);

    console.log('');
    for (const i of report.items) {
      console.log(`  ${ICON[i.status] ?? i.status}  ${i.slug}${i.detail ? `  - ${i.detail}` : ''}`);
    }
    if (report.orphans.length) {
      console.log('\nBài có trong DB nhưng KHÔNG có file (giữ nguyên, không xoá):');
      for (const o of report.orphans) console.log(`  · ${o.slug} (#${o.id}) "${o.title}"`);
    }
    const count = (s: string) => report.items.filter((i) => i.status === s).length;
    console.log(
      `\nTổng: tạo ${count('create')}, cập nhật ${count('update')}, ghi đè ${count('forced')}, không đổi ${count('unchanged') + count('adopt')}, ` +
        `xung đột ${count('conflict')}, lỗi ${count('error')}, file lỗi ${fileErrors.length}.`,
    );
    if (!args.apply) console.log('(Chạy thử - chưa ghi gì. Thêm --apply để áp dụng.)');
    if (count('conflict')) console.log('Xung đột: so sánh bài trên UI với file, rồi sửa cho khớp hoặc chạy lại với --force để file thắng.');
    if (report.hasProblems || fileErrors.length) process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(`guides:sync thất bại: ${(e as Error).message}`);
  process.exitCode = 1;
});
