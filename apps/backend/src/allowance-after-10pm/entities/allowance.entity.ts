import { Column, CreateDateColumn, DeleteDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AllowanceItemEntity } from './allowance-item.entity';

export type AllowanceStatus = 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';

@Entity({ name: 'allowance_after_10pm' })
export class AllowanceEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ name: 'voucher_no', type: 'varchar', length: 100, unique: true, nullable: true })
  voucherNo!: string | null;

  @Column({ name: 'claimant_name', type: 'varchar', length: 255 })
  claimantName!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  discipline!: string | null;

  @Column({ name: 'request_date', type: 'date' })
  requestDate!: string;

  @Column({ name: 'total_baht', type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalBaht!: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments!: unknown[] | null;

  @Column({ name: 'tl_by', type: 'varchar', length: 100, nullable: true })
  tlBy!: string | null;

  @Column({ name: 'tl_by_status', type: 'varchar', length: 50, nullable: true })
  tlByStatus!: string | null;

  @Column({ name: 'tl_by_date', type: 'timestamptz', nullable: true })
  tlByDate!: Date | null;

  @Column({ name: 'di_by', type: 'varchar', length: 100, nullable: true })
  diBy!: string | null;

  @Column({ name: 'di_by_status', type: 'varchar', length: 50, nullable: true })
  diByStatus!: string | null;

  @Column({ name: 'di_by_date', type: 'timestamptz', nullable: true })
  diByDate!: Date | null;

  @Column({ name: 'notified_user', type: 'varchar', length: 100, nullable: true })
  notifiedUser!: string | null;

  @Column({ name: 'notified_user_status', type: 'varchar', length: 50, nullable: true })
  notifiedUserStatus!: string | null;

  @Column({ name: 'notified_user_date', type: 'timestamptz', nullable: true })
  notifiedUserDate!: Date | null;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status!: AllowanceStatus;

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

  @OneToMany(() => AllowanceItemEntity, (item) => item.allowance, { cascade: true, eager: false })
  items!: AllowanceItemEntity[];
}
