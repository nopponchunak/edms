import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export const PR_CURRENCIES = ['THB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'MYR', 'AUD', 'CHF', 'HKD', 'KRW', 'INR', 'VND'] as const;

export class PrItemDto {
  @IsOptional() @IsString() @MaxLength(255) item?: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @IsBoolean() needAsset?: boolean;
}

export class SavePurchaseRequisitionDto {
  @IsNotEmpty() @IsString() @MaxLength(500) subject!: string;
  @IsOptional() @IsString() @MaxLength(255) toName?: string | null;
  @IsDateString() requestDate!: string;
  @IsNotEmpty() @IsString() @MaxLength(255) requestedBy!: string;
  @IsOptional() @IsString() @MaxLength(255) recommendedBy?: string | null;
  @IsOptional() @IsDateString() deadline?: string | null;
  @IsOptional() @IsString() @MaxLength(255) receivedFrom?: string | null;
  @IsOptional() @IsString() reasonsForPurchase?: string | null;

  @IsOptional() @IsIn(PR_CURRENCIES) currency?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PrItemDto) items?: PrItemDto[];
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsBoolean() vat?: boolean;

  @IsOptional() @IsString() @MaxLength(500) paymentTerm?: string | null;
  @IsOptional() @IsString() otherConditions?: string | null;
  @IsOptional() @IsBoolean() quotationAttached?: boolean;
  @IsOptional() @IsBoolean() notItEquipment?: boolean;

  @IsOptional() @IsString() @MaxLength(100) verifyIsBy?: string | null;
  @IsOptional() @IsString() @MaxLength(100) verifyBy?: string | null;
  @IsOptional() @IsString() @MaxLength(100) approverBy?: string | null;
  @IsOptional() @IsString() @MaxLength(100) approver2By?: string | null;
  @IsOptional() @IsString() @MaxLength(100) ackBy?: string | null;
  @IsOptional() @IsString() @MaxLength(100) actionBy?: string | null;

  @IsOptional() @IsArray() attachments?: Record<string, unknown>[] | null;

  @IsOptional() @IsIn(['draft', 'submitted']) action?: 'draft' | 'submitted';
}

export class ApprovePurchaseRequisitionDto {
  @IsNotEmpty() @IsIn(['approved', 'rejected']) action!: 'approved' | 'rejected';

  /** Required when rejecting; optional otherwise. */
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;

  /** Only read at the Acknowledge (CA) step. */
  @IsOptional() @IsBoolean() needAssetCodeRegistration?: boolean;
  @IsOptional() @IsArray() @IsBoolean({ each: true }) itemAssetFlags?: boolean[];
}

export const PR_SORTABLE = ['id', 'pr_no', 'subject', 'requested_by', 'request_date', 'grand_total', 'approver_by', 'status', 'created_at'] as const;

export class ListPurchaseRequisitionsDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsIn(['me']) waiting?: 'me';
  @IsOptional() @IsString() @MaxLength(100) approver?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateTo?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 25;
  @IsOptional() @IsIn(PR_SORTABLE) sort?: string = 'created_at';
  @IsOptional() @IsIn(['asc', 'desc']) dir?: 'asc' | 'desc' = 'desc';
}
