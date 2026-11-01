import { Column, CreateDateColumn, DeleteDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ExpensesClaimItemEntity } from './expenses-claim-item.entity';

export type ExpensesClaimStatus = 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';

@Entity({ name: 'expenses_claims' })
export class ExpensesClaimEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ name: 'voucher_no', type: 'varchar', length: 100, unique: true, nullable: true })
  voucherNo!: string | null;

  @Column({ name: 'claimant_name', type: 'varchar', length: 255 })
  claimantName!: string;

  @Column({ name: 'claim_date', type: 'date' })
  claimDate!: string;

  @Column({ type: 'varchar', length: 10, default: 'THB' })
  currency!: string;

  @Column({ name: 'total_baht', type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalBaht!: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments!: unknown[] | null;

  @Column({ name: 'verified_by', type: 'varchar', length: 100, nullable: true })
  verifiedBy!: string | null;

  @Column({ name: 'verified_by_status', type: 'varchar', length: 50, nullable: true })
  verifiedByStatus!: string | null;

  @Column({ name: 'verified_by_date', type: 'timestamptz', nullable: true })
  verifiedByDate!: Date | null;

  @Column({ name: 'approved_by', type: 'varchar', length: 100, nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_by_status', type: 'varchar', length: 50, nullable: true })
  approvedByStatus!: string | null;

  @Column({ name: 'approved_by_date', type: 'timestamptz', nullable: true })
  approvedByDate!: Date | null;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status!: ExpensesClaimStatus;

  @Column({ name: 'draft_payload', type: 'jsonb', nullable: true })
  draftPayload!: unknown | null;

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

  @OneToMany(() => ExpensesClaimItemEntity, (item) => item.claim, { cascade: true, eager: false })
  items!: ExpensesClaimItemEntity[];
}
