import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LdapLoginDto {
  @ApiProperty({ example: 'employee.name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  username!: string;

  @ApiProperty({ format: 'password', writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  password!: string;
}
