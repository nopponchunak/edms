import { IsIn, IsOptional, IsString } from 'class-validator';

export class ApproveAllowanceDto {
  @IsIn(['approved', 'rejected'])
  action!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  remark?: string;
}
