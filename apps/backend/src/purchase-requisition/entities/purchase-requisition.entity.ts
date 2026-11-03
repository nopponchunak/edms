import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type PurchaseRequisitionStatus = 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';

export interface PrItem {
  item: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  needAsset?: boolean;
}

@Entity({ name: 'purchase_requisitions' })
export class PurchaseRequisitionEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'pr_no', type: 'varchar', length: 100, unique: true, nullable: true })
  prNo!: string | null;

  @Column({ type: 'varchar', length: 500 })
  subject!: string;

  @Column({ name: 'to_name', type: 'varchar', length: 255, nullable: true })
  toName!: string | null;

  @Column({ name: 'request_date', type: 'date' })
  requestDate!: string;

  @Column({ name: 'requested_by', type: 'varchar', length: 255 })
  requestedBy!: string;

  @Column({ name: 'recommended_by', type: 'varchar', length: 255, nullable: true })
  recommendedBy!: string | null;

  @Column({ type: 'date', nullable: true })
  deadline!: string | null;

  @Column({ name: 'received_from', type: 'varchar', length: 255, nullable: true })
  receivedFrom!: string | null;

  @Column({ name: 'reasons_for_purchase', type: 'text', nullable: true })
  reasonsForPurchase!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'THB' })
  currency!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  items!: PrItem[];

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  discount!: string;

  @Column({ type: 'boolean', default: false })
  vat!: boolean;

  @Column({ name: 'sub_total', type: 'decimal', precision: 15, scale: 2, default: 0 })
  subTotal!: string;

  @Column({ name: 'vat_value', type: 'decimal', precision: 15, scale: 2, default: 0 })
  vatValue!: string;

  @Column({ name: 'grand_total', type: 'decimal', precision: 15, scale: 2, default: 0 })
  grandTotal!: string;

  @Column({ name: 'payment_term', type: 'varchar', length: 500, nullable: true })
  paymentTerm!: string | null;

  @Column({ name: 'other_conditions', type: 'text', nullable: true })
  otherConditions!: string | null;

  @Column({ name: 'quotation_attached', type: 'boolean', default: false })
  quotationAttached!: boolean;

  /** True when nothing IT related is bought, so the IT verification step is skipped. */
  @Column({ name: 'not_it_equipment', type: 'boolean', default: false })
  notItEquipment!: boolean;

  @Column({ name: 'need_asset_code_registration', type: 'boolean', nullable: true })
  needAssetCodeRegistration!: boolean | null;

  @Column({ type: 'jsonb', nullable: true })
  attachments!: unknown[] | null;

  @Column({ name: 'verify_is_by', type: 'varchar', length: 100, nullable: true })
  verifyIsBy!: string | null;
  @Column({ name: 'verify_is_by_status', type: 'varchar', length: 50, nullable: true })
  verifyIsByStatus!: string | null;
  @Column({ name: 'verify_is_by_date', type: 'timestamptz', nullable: true })
  verifyIsByDate!: Date | null;
  @Column({ name: 'verify_is_comment', type: 'text', nullable: true })
  verifyIsComment!: string | null;

  @Column({ name: 'verify_by', type: 'varchar', length: 100, nullable: true })
  verifyBy!: string | null;
  @Column({ name: 'verify_by_status', type: 'varchar', length: 50, nullable: true })
  verifyByStatus!: string | null;
  @Column({ name: 'verify_by_date', type: 'timestamptz', nullable: true })
  verifyByDate!: Date | null;
  @Column({ name: 'verify_comment', type: 'text', nullable: true })
  verifyComment!: string | null;

  @Column({ name: 'approver_by', type: 'varchar', length: 100, nullable: true })
  approverBy!: string | null;
  @Column({ name: 'approver_by_status', type: 'varchar', length: 50, nullable: true })
  approverByStatus!: string | null;
  @Column({ name: 'approver_by_date', type: 'timestamptz', nullable: true })
  approverByDate!: Date | null;
  @Column({ name: 'approver_comment', type: 'text', nullable: true })
  approverComment!: string | null;

  @Column({ name: 'approver2_by', type: 'varchar', length: 100, nullable: true })
  approver2By!: string | null;
  @Column({ name: 'approver2_by_status', type: 'varchar', length: 50, nullable: true })
  approver2ByStatus!: string | null;
  @Column({ name: 'approver2_by_date', type: 'timestamptz', nullable: true })
  approver2ByDate!: Date | null;
  @Column({ name: 'approver2_comment', type: 'text', nullable: true })
  approver2Comment!: string | null;

  @Column({ name: 'ack_by', type: 'varchar', length: 100, nullable: true })
  ackBy!: string | null;
  @Column({ name: 'ack_by_status', type: 'varchar', length: 50, nullable: true })
  ackByStatus!: string | null;
  @Column({ name: 'ack_by_date', type: 'timestamptz', nullable: true })
  ackByDate!: Date | null;
  @Column({ name: 'ack_comment', type: 'text', nullable: true })
  ackComment!: string | null;

  @Column({ name: 'action_by', type: 'varchar', length: 100, nullable: true })
  actionBy!: string | null;
  @Column({ name: 'action_by_status', type: 'varchar', length: 50, nullable: true })
  actionByStatus!: string | null;
  @Column({ name: 'action_by_date', type: 'timestamptz', nullable: true })
  actionByDate!: Date | null;
  @Column({ name: 'action_comment', type: 'text', nullable: true })
  actionComment!: string | null;

  /** 0 while a draft; 1 on first submit; +1 each time a rejected request is revised and submitted again. */
  @Column({ type: 'int', default: 0 })
  version!: number;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status!: PurchaseRequisitionStatus;

  /** The layout / flow this document was filed under; finished documents keep opening in that version. */
  @Column({ name: 'form_version', type: 'int', default: 1 })
  formVersion!: number;

  /** Name and employee code of the people who signed, as they were when they signed (never overwritten). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  signers!: Record<string, { name: string; code: string | null }>;

  @Column({ name: 'create_by', type: 'varchar', length: 100, nullable: true })
  createBy!: string | null;

  @Column({ name: 'update_by', type: 'varchar', length: 100, nullable: true })
  updateBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt!: Date | null;
}
