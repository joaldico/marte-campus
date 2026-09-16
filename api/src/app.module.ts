import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { HealthModule } from './health/health.module';
import { PlaybackModule } from './playback/playback.module';
import { PlayerModule } from './player/player.module';
import { PrismaModule } from './prisma/prisma.module';
import { VideosModule } from './videos/videos.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    PlayerModule,
    PlaybackModule,
    VideosModule,
    AdminModule,
  ],
})
export class AppModule {}
