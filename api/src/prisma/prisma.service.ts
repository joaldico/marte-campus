import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ??
            'postgresql://campus:campus@127.0.0.1:5432/campus',
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    if (!process.env.DATABASE_URL) {
      return;
    }
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
