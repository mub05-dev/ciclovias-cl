import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RoutingModule } from './routing/routing.module';
import { PrismaModule } from './prisma/prisma.module';
import { SegmentReportsModule } from './segment-reports/segment-reports.module';

@Module({
  imports: [ConfigModule.forRoot(), RoutingModule, PrismaModule, SegmentReportsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
