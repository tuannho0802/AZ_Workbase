import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityConfig } from '../../database/entities/security-config.entity';
import { LoginIpBlock } from '../../database/entities/login-ip-block.entity';
import { LoginIpWhitelist } from '../../database/entities/login-ip-whitelist.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { SecurityActivityService } from './security-activity.service';
import { SecurityConfigService } from './security-config.service';
import { LoginIpBlockService } from './login-ip-block.service';
import { LoginIpWhitelistService } from './login-ip-whitelist.service';
import { SecurityController } from './security.controller';

// AuditModule và PermissionsModule đều @Global() nên không cần import ở đây.
@Module({
    imports: [TypeOrmModule.forFeature([SecurityConfig, LoginIpBlock, LoginIpWhitelist, AuditLog])],
    controllers: [SecurityController],
    providers: [SecurityConfigService, LoginIpBlockService, LoginIpWhitelistService, SecurityActivityService],
    exports: [SecurityConfigService, LoginIpBlockService, LoginIpWhitelistService],
})
export class SecurityModule { }