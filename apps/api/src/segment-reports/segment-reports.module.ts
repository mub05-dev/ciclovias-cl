import { Module } from '@nestjs/common';
import { SegmentReportsController } from './segment-reports.controller';
import { SegmentReportsService } from './segment-reports.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SegmentReportsController],
  providers: [SegmentReportsService],
})
export class SegmentReportsModule {}
