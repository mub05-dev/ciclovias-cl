import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RoutingModule } from './routing/routing.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot(), RoutingModule, PrismaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
