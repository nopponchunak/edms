import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type GiftReceivingStatus = 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';

@Entity({ name: 'gift_hospitality_receivings' })
export class GiftReceivingEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'voucher_no', type: 'varchar', length: 100, unique: true, nullable: true })
  voucherNo!: string | null;

  @Column({ name: 'request_type', type: 'varchar', length: 50 })
  requestType!: string;

  @Column({ name: 'requester_name', type: 'varchar', length: 255 })
  requesterName!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  purpose!: string | null;

  @Column({ name: 'value_amount', type: 'decimal', precision: 15, scale: 2, default: 0 })
  valueAmount!: string;

  @Column({ name: 'company_of_giver', type: 'varchar', length: 255 })
  companyOfGiver!: string;

  @Column({ name: 'receiving_staff', type: 'varchar', length: 255 })
  receivingStaff!: string;

  @Column({ name: 'proposed_date', type: 'date' })
  proposedDate!: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments!: unknown[] | null;

  @Column({ name: 'verify_by', type: 'varchar', length: 100, nullable: true })
  verifyBy!: string | null;
  @Column({ name: 'verify_by_status', type: 'varchar', length: 50, nullable: true })
  verifyByStatus!: string | null;
  @Column({ name: 'verify_by_date', type: 'timestamptz', nullable: true })
  verifyByDate!: Date | null;
  @Column({ name: 'verify_comment', type: 'text', nullable: true })
  verifyComment!: string | null;

  @Column({ name: 'ack1_by', type: 'varchar', length: 100, nullable: true })
  ack1By!: string | null;
  @Column({ name: 'ack1_by_status', type: 'varchar', length: 50, nullable: true })
  ack1ByStatus!: string | null;
  @Column({ name: 'ack1_by_date', type: 'timestamptz', nullable: true })
  ack1ByDate!: Date | null;
  @Column({ name: 'ack1_comment', type: 'text', nullable: true })
  ack1Comment!: string | null;

  @Column({ name: 'approver_by', type: 'varchar', length: 100, nullable: true })
  approverBy!: string | null;
  @Column({ name: 'approver_by_status', type: 'varchar', length: 50, nullable: true })
  approverByStatus!: string | null;
  @Column({ name: 'approver_by_date', type: 'timestamptz', nullable: true })
  approverByDate!: Date | null;
  @Column({ name: 'approver_comment', type: 'text', nullable: true })
  approverComment!: string | null;

  @Column({ name: 'ack2_by', type: 'varchar', length: 100, nullable: true })
  ack2By!: string | null;
  @Column({ name: 'ack2_by_status', type: 'varchar', length: 50, nullable: true })
  ack2ByStatus!: string | null;
  @Column({ name: 'ack2_by_date', type: 'timestamptz', nullable: true })
  ack2ByDate!: Date | null;
  @Column({ name: 'ack2_comment', type: 'text', nullable: true })
  ack2Comment!: string | null;

  /** 0 while a draft; 1 on first submit; +1 each time a rejected request is revised and submitted again. */
  @Column({ type: 'int', default: 0 })
  version!: number;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status!: GiftReceivingStatus;

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

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
