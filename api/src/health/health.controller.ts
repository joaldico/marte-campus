import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { HealthResponseDto } from './health.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and database ping' })
  @ApiOkResponse({ type: HealthResponseDto })
  async getHealth(): Promise<{ status: 'ok'; db: 'ok' | 'unavailable' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'ok' };
    } catch {
      return { status: 'ok', db: 'unavailable' };
    }
  }
}
