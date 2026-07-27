import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarService } from './calendar.service';

@Module({
  imports: [AuthModule],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
