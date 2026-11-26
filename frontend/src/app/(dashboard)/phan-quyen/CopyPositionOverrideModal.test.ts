import { describe, expect, it } from 'vitest';
import { buildCopyTargets } from './CopyPositionOverrideModal';

describe('buildCopyTargets', () => {
  const source = { roleId: 1, positionId: 3 };

  it('ghép Role × Vị trí và bỏ chính nguồn', () => {
    expect(buildCopyTargets([1, 2], [3, 4], source)).toEqual([
      { roleId: 1, positionId: 4 },
      { roleId: 2, positionId: 3 },
      { roleId: 2, positionId: 4 },
    ]);
  });

  it('chưa chọn Vị trí đích thì rỗng', () => {
    expect(buildCopyTargets([1], [], source)).toEqual([]);
  });
});
