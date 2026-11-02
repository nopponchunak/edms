import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class AllowanceItemDto {
  @IsOptional()
  @IsNumber()
  seq?: number;

  @IsDateString()
  workDate!: string;

  @IsOptional()
  @IsNumber()
  projectDetailId?: number | null;

  @IsOptional()
  @IsString()
  projectCode?: string | null;

  @IsOptional()
  @IsString()
  projectName?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  timeFrom?: string | null;

  @IsOptional()
  @IsString()
  timeTo?: string | null;

  @IsNumber()
  baht!: number;
}

export class SaveAllowanceDto {
  @IsNotEmpty()
  @IsString()
  claimantName!: string;

  @IsOptional()
  @IsString()
  discipline?: string | null;

  @IsDateString()
  requestDate!: string;

  @IsOptional()
  @IsString()
  tlBy?: string | null;

  @IsOptional()
  @IsString()
  diBy?: string | null;

  @IsOptional()
  @IsString()
  notifiedUser?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllowanceItemDto)
  items!: AllowanceItemDto[];

  @IsOptional()
  @IsArray()
  attachments?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsIn(['draft', 'submitted'])
  action?: 'draft' | 'submitted' = 'draft';
}
