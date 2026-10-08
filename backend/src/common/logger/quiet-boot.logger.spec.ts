import { ConsoleLogger } from '@nestjs/common';
import { QuietBootLogger } from './quiet-boot.logger';

describe('QuietBootLogger', () => {
    let superLog: jest.SpyInstance;
    const OLD_ENV = process.env.NEST_BOOT_LOG;

    beforeEach(() => {
        superLog = jest.spyOn(ConsoleLogger.prototype, 'log').mockImplementation(() => undefined);
        delete process.env.NEST_BOOT_LOG;
    });

    afterEach(() => {
        superLog.mockRestore();
        if (OLD_ENV === undefined) delete process.env.NEST_BOOT_LOG;
        else process.env.NEST_BOOT_LOG = OLD_ENV;
    });

    it.each(['InstanceLoader', 'RouterExplorer', 'RoutesResolver', 'NestFactory', 'NestApplication'])(
        'bỏ qua log của context khởi động %s',
        (ctx) => {
            new QuietBootLogger().log('Mapped {/api/x, GET} route', ctx);
            expect(superLog).not.toHaveBeenCalled();
        },
    );

    it('vẫn in log nghiệp vụ (context khác)', () => {
        new QuietBootLogger().log('User signed in', 'AuthService');
        expect(superLog).toHaveBeenCalledWith('User signed in', 'AuthService');
    });

    it('vẫn in log không có context', () => {
        new QuietBootLogger().log('plain message');
        expect(superLog).toHaveBeenCalledWith('plain message');
    });

    it('NEST_BOOT_LOG=true bật lại log khởi động', () => {
        process.env.NEST_BOOT_LOG = 'true';
        new QuietBootLogger().log('Mapped {/api/x, GET} route', 'RouterExplorer');
        expect(superLog).toHaveBeenCalledTimes(1);
    });

    it('không chặn warn/error của context khởi động', () => {
        const warn = jest.spyOn(ConsoleLogger.prototype, 'warn').mockImplementation(() => undefined);
        new QuietBootLogger().warn('cảnh báo', 'InstanceLoader');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});