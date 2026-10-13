import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import { attachDbConnectionTiming, formatDbConnTiming, isDbConnectionTimingEnabled } from './db-connection-timing';

describe('db-connection-timing (13B)', () => {
    const OLD = process.env.CPU_TIMING;
    const makeLogger = () => ({ log: jest.fn() }) as unknown as Logger & { log: jest.Mock };
    afterEach(() => {
        if (OLD === undefined) delete process.env.CPU_TIMING;
        else process.env.CPU_TIMING = OLD;
    });

    it('chỉ bật khi CPU_TIMING=true', () => {
        delete process.env.CPU_TIMING;
        expect(isDbConnectionTimingEnabled()).toBe(false);
        process.env.CPU_TIMING = 'true';
        expect(isDbConnectionTimingEnabled()).toBe(true);
    });

    it('cờ TẮT -> không đăng ký listener nào, không log', () => {
        delete process.env.CPU_TIMING;
        const pool = new EventEmitter();
        const logger = makeLogger();
        expect(attachDbConnectionTiming(pool, logger)).toBe(false);
        expect(pool.listenerCount('connection')).toBe(0);
        pool.emit('connection', {});
        expect(logger.log).not.toHaveBeenCalled();
    });

    it('cờ BẬT -> mỗi sự kiện connection tăng bộ đếm đúng 1 và log đúng 1 dòng', () => {
        process.env.CPU_TIMING = 'true';
        const pool = new EventEmitter();
        const logger = makeLogger();
        expect(attachDbConnectionTiming(pool, logger)).toBe(true);
        expect(pool.listenerCount('connection')).toBe(1);
        pool.emit('connection', {});
        pool.emit('connection', {});
        pool.emit('connection', {});
        expect(logger.log).toHaveBeenCalledTimes(3);
        expect(logger.log.mock.calls[0][0]).toMatch(/^new connection #1 up=\d+s sinceLast=\d+s$/);
        expect(logger.log.mock.calls[2][0]).toMatch(/^new connection #3 /);
    });

    it('gắn nhiều lần lên cùng 1 pool chỉ đăng ký 1 listener (không đếm đôi)', () => {
        process.env.CPU_TIMING = 'true';
        const pool = new EventEmitter();
        const logger = makeLogger();
        expect(attachDbConnectionTiming(pool, logger)).toBe(true);
        expect(attachDbConnectionTiming(pool, logger)).toBe(false);
        pool.emit('connection', {});
        expect(pool.listenerCount('connection')).toBe(1);
        expect(logger.log).toHaveBeenCalledTimes(1);
    });

    it('thiếu pool / pool không có .on -> trả false, không throw', () => {
        process.env.CPU_TIMING = 'true';
        expect(attachDbConnectionTiming(undefined)).toBe(false);
        expect(attachDbConnectionTiming(null)).toBe(false);
        expect(attachDbConnectionTiming({} as any)).toBe(false);
    });

    it('lỗi khi ghi log không lan ra luồng kết nối', () => {
        process.env.CPU_TIMING = 'true';
        const pool = new EventEmitter();
        const logger = makeLogger();
        logger.log.mockImplementation(() => {
            throw new Error('log fail');
        });
        attachDbConnectionTiming(pool, logger);
        expect(() => pool.emit('connection', {})).not.toThrow();
    });

    it('dòng log đúng định dạng, không chứa thông tin nhạy cảm', () => {
        const line = formatDbConnTiming(4, 125.6, 31.2);
        expect(line).toBe('new connection #4 up=126s sinceLast=31s');
        expect(line).not.toMatch(/host|user|password|token|@/i);
    });
});
