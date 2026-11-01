import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export const OFFERING_REQUEST_TYPES = ['gift', 'hospitality'] as const;
export const OFFERING_CURRENCIES = ['THB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'MYR', 'AUD', 'CHF', 'HKD', 'KRW', 'INR', 'VND'] as const;

export class SaveGiftOfferingDto {
  @IsIn(OFFERING_REQUEST_TYPES)
  requestType!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  requesterName!: string;

  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() purpose?: string | null;

  @IsNumber()
  @Min(0)
  valueAmount!: number;

  @IsOptional()
  @IsIn(OFFERING_CURRENCIES)
  currency?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  receiverNameCompany!: string;

  @IsDateString()
  proposedDate!: string;

  @IsOptional() @IsString() @MaxLength(100) verifyBy?: string | null;
  @IsOptional() @IsString() @MaxLength(100) ack1By?: string | null;
  @IsOptional() @IsString() @MaxLength(100) approverBy?: string | null;
  @IsOptional() @IsString() @MaxLength(100) ack2By?: string | null;
  @IsOptional() @IsString() @MaxLength(100) approver2By?: string | null;

  @IsOptional()
  @IsArray()
  attachments?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsIn(['draft', 'submitted'])
  action?: 'draft' | 'submitted';
}

export class ApproveGiftOfferingDto {
  @IsNotEmpty()
  @IsIn(['approved', 'rejected'])
  action!: 'approved' | 'rejected';

  /** Required when rejecting; optional otherwise. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export const OFFERING_SORTABLE = ['id', 'voucher_no', 'request_type', 'requester_name', 'description', 'receiver_name_company', 'value_amount', 'proposed_date', 'approver_by', 'status', 'created_at'] as const;

export class ListGiftOfferingsDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsIn(OFFERING_REQUEST_TYPES) requestType?: string;
  @IsOptional() @IsIn(['me']) waiting?: 'me';
  @IsOptional() @IsString() @MaxLength(100) approver?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateTo?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 25;
  @IsOptional() @IsIn(OFFERING_SORTABLE) sort?: string = 'created_at';
  @IsOptional() @IsIn(['asc', 'desc']) dir?: 'asc' | 'desc' = 'desc';
}
