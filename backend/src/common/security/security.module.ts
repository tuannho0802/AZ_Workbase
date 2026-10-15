import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityConfig } from '../../database/entities/security-config.entity';
import { LoginIpBlock } from '../../database/entities/login-ip-block.entity';
import { LoginIpWhitelist } from '../../database/entities/login-ip-whitelist.entity';
import { LoginIpBlacklist } from '../../database/entities/login-ip-blacklist.entity';
import { IpGeoCache } from '../../database/entities/ip-geo-cache.entity';
import { IpAccessLog } from '../../database/entities/ip-access-log.entity';
import { IpAccessStats } from '../../database/entities/ip-access-stats.entity';
import { IpGeoService } from './ip-geo.service';
import { IpAccessLogService } from './ip-access-log.service';
import { IpAccessApiLogService } from './ip-access-api-log.service';
import { IpAccessApiLogInterceptor } from './ip-access-api-log.interceptor';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { SecurityActivityService } from './security-activity.service';
import { SecurityConfigService } from './security-config.service';
import { LoginIpBlockService } from './login-ip-block.service';
import { LoginIpWhitelistService } from './login-ip-whitelist.service';
import { LoginIpBlacklistService } from './login-ip-blacklist.service';
import { SecurityController } from './security.controller';

// AuditModule và PermissionsModule đều @Global() nên không cần import ở đây.
@Module({
    imports: [TypeOrmModule.forFeature([SecurityConfig, LoginIpBlock, LoginIpWhitelist, LoginIpBlacklist, AuditLog, IpGeoCache, IpAccessLog, IpAccessStats])],
    controllers: [SecurityController],
    providers: [
        SecurityConfigService, LoginIpBlockService, LoginIpWhitelistService, LoginIpBlacklistService, SecurityActivityService, IpGeoService, IpAccessLogService,
        IpAccessApiLogService,
        // 3.6.2: global interceptor log request API đã đăng nhập (gom thùng 1 phút; tắt khẩn cấp bằng security_config.ip_access_log_api_enabled).
        { provide: APP_INTERCEPTOR, useClass: IpAccessApiLogInterceptor },
    ],
    exports: [SecurityConfigService, LoginIpBlockService, LoginIpWhitelistService, LoginIpBlacklistService, IpGeoService, IpAccessLogService],
})
export class SecurityModule { }