import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RepairsController } from './repairs.controller';
import { RepairCategoriesController } from './repair-categories.controller';
import { RepairsService } from './repairs.service';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [RepairsController, RepairCategoriesController],
  providers: [RepairsService],
})
export class RepairsModule {}
