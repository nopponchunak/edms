import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { DESIGN_REVIEW_FORM_TYPES } from '../design-review.config';

export class ChecklistAnswerDto {
  @IsString() @MaxLength(10) id!: string;
  @IsOptional() @IsIn(['yes', 'no', 'na']) answer?: 'yes' | 'no' | 'na' | null;
}

export class SaveDesignReviewDto {
  @IsOptional() @IsIn(DESIGN_REVIEW_FORM_TYPES) formType?: string;

  @IsOptional() @IsInt() projectId?: number | null;
  @IsString() @MaxLength(255) preparedBy!: string;
  @IsOptional() @IsString() @MaxLength(100) discipline?: string | null;
  @IsOptional() @IsString() @MaxLength(255) disciplineOther?: string | null;
  @IsOptional() @IsString() @MaxLength(255) stage?: string | null;

  @IsOptional() @IsArray() @IsString({ each: true }) documentTypes?: string[];
  @IsOptional() @IsString() @MaxLength(255) documentTypesOther?: string | null;
  @IsOptional() @IsString() @MaxLength(500) documentLocation?: string | null;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChecklistAnswerDto) checklist?: ChecklistAnswerDto[];
  @IsOptional() @IsString() comments?: string | null;
  @IsOptional() @IsString() recommendedActions?: string | null;
  @IsOptional() @IsBoolean() actionsTaken?: boolean | null;
  @IsOptional() @IsString() actionNote?: string | null;

  @IsOptional() @IsString() @MaxLength(100) reviewBy?: string | null;
  @IsOptional() @IsString() @MaxLength(100) respondBy?: string | null;
  @IsOptional() @IsString() @MaxLength(100) tlBy?: string | null;
  @IsOptional() @IsString() @MaxLength(100) tl2By?: string | null;
  @IsOptional() @IsString() @MaxLength(100) ackBy?: string | null;

  @IsOptional() @IsArray() attachments?: Record<string, unknown>[] | null;

  @IsOptional() @IsIn(['draft', 'submitted']) action?: 'draft' | 'submitted';
}

export class ApproveDesignReviewDto {
  @IsIn(['approved', 'rejected']) action!: 'approved' | 'rejected';

  /** Required when rejecting; optional otherwise. */
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export const DESIGN_REVIEW_SORTABLE = ['id', 'voucher_no', 'project_no', 'project_name', 'discipline', 'prepared_by', 'status', 'created_at'] as const;

export class ListDesignReviewsDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsIn(DESIGN_REVIEW_FORM_TYPES) formType?: string;
  @IsOptional() @IsIn(['me']) waiting?: 'me';
  @IsOptional() @IsString() @MaxLength(100) approver?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateTo?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 25;
  @IsOptional() @IsIn(DESIGN_REVIEW_SORTABLE) sort?: string = 'created_at';
  @IsOptional() @IsIn(['asc', 'desc']) dir?: 'asc' | 'desc' = 'desc';
}
