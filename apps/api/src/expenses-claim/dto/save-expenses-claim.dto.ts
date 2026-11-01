import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ExpensesClaimItemDto {
  @IsOptional()
  @IsNumber()
  seq?: number;

  @IsDateString()
  itemDate!: string;

  @IsOptional()
  @IsNumber()
  projectDetailId?: number | null;

  @IsOptional()
  @IsString()
  projectCode?: string | null;

  @IsOptional()
  @IsString()
  projectName?: string | null;

  @IsNotEmpty()
  @IsString()
  details!: string;

  @IsNumber()
  baht!: number;
}

export class SaveExpensesClaimDto {
  @IsNotEmpty()
  @IsString()
  claimantName!: string;

  @IsDateString()
  claimDate!: string;

  @IsOptional()
  @IsIn(['THB', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'CNY', 'AUD', 'HKD', 'MYR'])
  currency?: string;

  @IsOptional()
  @IsString()
  verifiedBy?: string | null;

  @IsOptional()
  @IsString()
  approvedBy?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpensesClaimItemDto)
  items!: ExpensesClaimItemDto[];

  @IsOptional()
  @IsArray()
  attachments?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsIn(['draft', 'submitted'])
  action?: 'draft' | 'submitted' = 'draft';
}
