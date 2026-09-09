import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting } from '../../database/entities/setting.entity';
import { User } from '../../database/entities/user.entity';
import { LeaveRequestAttachment } from '../../database/entities/leave-request-attachment.entity';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

@Module({
  // ⚠️ FIX BUG THẬT: StorageService constructor cần UserRepository (dọn
  // users.avatar_url khi xoá bucket avatars) + LeaveRequestAttachmentRepository
  // (dọn leave_request_attachments khi xoá bucket leave-attachments) - trước
  // đây module chỉ đăng ký Setting, thiếu 2 entity này -> Nest báo
  // UnknownDependenciesException lúc bootstrap thật (unit test không bắt được
  // vì test tự mock provider thủ công, không đi qua module wiring thật).
  imports: [TypeOrmModule.forFeature([Setting, User, LeaveRequestAttachment])],
  controllers: [StorageController],
  providers: [StorageService],
})
export class StorageModule { }