import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApproveExpensesClaimDto {
  @IsNotEmpty()
  @IsIn(['approved', 'rejected'])
  action!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  remark?: string;
}
