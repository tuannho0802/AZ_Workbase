import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityConfig } from '../../database/entities/security-config.entity';
import { LoginIpBlock } from '../../database/entities/login-ip-block.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { SecurityActivityService } from './security-activity.service';
import { SecurityConfigService } from './security-config.service';
import { LoginIpBlockService } from './login-ip-block.service';
import { SecurityController } from './security.controller';

// AuditModule và PermissionsModule đều @Global() nên không cần import ở đây.
@Module({
    imports: [TypeOrmModule.forFeature([SecurityConfig, LoginIpBlock, AuditLog])],
    controllers: [SecurityController],
    providers: [SecurityConfigService, LoginIpBlockService, SecurityActivityService],
    exports: [SecurityConfigService, LoginIpBlockService],
})
export class SecurityModule { }