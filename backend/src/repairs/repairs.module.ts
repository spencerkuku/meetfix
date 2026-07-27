import { Module } from '@nestjs/common';
import { RepairsController } from './repairs.controller';
import { RepairCategoriesController } from './repair-categories.controller';
import { RepairsService } from './repairs.service';

@Module({
  controllers: [RepairsController, RepairCategoriesController],
  providers: [RepairsService],
})
export class RepairsModule {}
