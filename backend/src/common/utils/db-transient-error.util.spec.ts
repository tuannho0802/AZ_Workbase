import { isTransientDbError, withDbRetry } from './db-transient-error.util';

describe('db-transient-error.util', () => {
  const resetErr = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });

  it('nhận diện ECONNRESET (cả khi bọc trong driverError của TypeORM)', () => {
    expect(isTransientDbError(resetErr)).toBe(true);
    expect(isTransientDbError({ message: 'x', driverError: { code: 'ECONNRESET' } })).toBe(true);
    expect(isTransientDbError(new Error('ER_DUP_ENTRY'))).toBe(false);
  });

  it('withDbRetry thử lại 1 lần rồi thành công', async () => {
    const fn = jest.fn().mockRejectedValueOnce(resetErr).mockResolvedValueOnce('ok');
    await expect(withDbRetry(fn, 1, 0)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('không retry lỗi không phải tạm thời', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('syntax'));
    await expect(withDbRetry(fn, 1, 0)).rejects.toThrow('syntax');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('hết lượt retry thì ném lỗi gốc', async () => {
    const fn = jest.fn().mockRejectedValue(resetErr);
    await expect(withDbRetry(fn, 1, 0)).rejects.toBe(resetErr);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
