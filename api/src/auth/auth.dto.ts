import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class LoginDto {
  @ApiProperty({ example: 'bruno', description: 'Seed user id' })
  userId!: string;
}

export class PublicUserDto {
  @ApiProperty({ example: 'bruno' })
  id!: string;

  @ApiProperty({ example: 'Bruno' })
  name!: string;

  @ApiProperty({ enum: Role, example: Role.student })
  role!: Role;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  ok!: true;
}
