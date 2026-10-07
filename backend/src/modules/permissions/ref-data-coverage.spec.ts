import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { Department } from '../../database/entities/department.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { Position } from '../../database/entities/position.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { RolePermission } from '../../database/entities/role-permission.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { LeaveType } from '../../database/entities/leave-type.entity';
import { MediaSource } from '../../database/entities/media-source.entity';
import { User } from '../../database/entities/user.entity';
import { REF_DATA_DOMAINS } from './permissions-version.service';
import { REF_DATA_TABLE_DOMAINS, USER_COLUMNS_AFFECTING_DEPARTMENTS } from './ref-data-change.subscriber';

/**
 * [9D-2] Chống "sót bump": danh mục nào FE cache lâu thì BẢNG của nó PHẢI nằm trong REF_DATA_TABLE_DOMAINS
 * (RefDataChangeSubscriber bắt mọi lần ghi). Thêm danh mục mới mà quên đăng ký -> test này fail.
 */
describe('Phủ bump danh mục ít đổi (9D)', () => {
    const tableOf = (target: Function) => getMetadataArgsStorage().tables.find((t) => t.target === target)?.name;

    const CATALOG_ENTITIES: [string, Function][] = [
        ['Department', Department],
        ['DepartmentManager', DepartmentManager],
        ['Position', Position],
        ['RoleEntity', RoleEntity],
        ['RolePermission', RolePermission],
        ['CustomerStatus', CustomerStatus],
        ['PeriodicTaskStatus', PeriodicTaskStatus],
        ['LeaveType', LeaveType],
        ['MediaSource', MediaSource],
    ];

    it.each(CATALOG_ENTITIES)('bảng của entity %s nằm trong bản đồ bump', (_name, entity) => {
        const table = tableOf(entity);
        expect(table).toBeDefined();
        expect(Object.keys(REF_DATA_TABLE_DOMAINS)).toContain(table);
    });

    it('mọi domain đều có ít nhất 1 bảng làm bump (không có domain "mồ côi" FE chờ mãi)', () => {
        const produced = new Set(Object.values(REF_DATA_TABLE_DOMAINS).flat());
        for (const d of REF_DATA_DOMAINS) expect(produced.has(d)).toBe(true);
    });

    it('bản đồ chỉ trỏ tới domain hợp lệ', () => {
        const valid = new Set<string>(REF_DATA_DOMAINS);
        for (const domains of Object.values(REF_DATA_TABLE_DOMAINS)) for (const d of domains) expect(valid.has(d)).toBe(true);
    });

    it('cột user dùng để bump có thật trên entity User (đổi tên cột sẽ làm bump im lặng hỏng)', () => {
        const props = new Set(getMetadataArgsStorage().columns.filter((c) => c.target === User).map((c) => c.propertyName));
        const relations = new Set(getMetadataArgsStorage().relations.filter((r) => r.target === User).map((r) => r.propertyName));
        for (const c of USER_COLUMNS_AFFECTING_DEPARTMENTS) expect(props.has(c) || relations.has(c)).toBe(true);
    });
});