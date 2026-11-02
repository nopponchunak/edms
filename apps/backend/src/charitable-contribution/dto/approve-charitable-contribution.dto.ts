import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveCharitableContributionDto {
  @IsNotEmpty()
  @IsIn(['approved', 'rejected'])
  action!: 'approved' | 'rejected';

  /** Required when rejecting; optional otherwise. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
