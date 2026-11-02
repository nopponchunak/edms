import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ExpensesClaimEntity } from './expenses-claim.entity';

@Entity({ name: 'expenses_claim_items' })
export class ExpensesClaimItemEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ name: 'expenses_claim_id', type: 'int', unsigned: true })
  expensesClaimId!: number;

  @ManyToOne(() => ExpensesClaimEntity, (claim) => claim.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expenses_claim_id' })
  claim!: ExpensesClaimEntity;

  @Column({ type: 'smallint', nullable: true })
  seq!: number | null;

  @Column({ name: 'item_date', type: 'date' })
  itemDate!: string;

  @Column({ name: 'project_detail_id', type: 'int', unsigned: true, nullable: true })
  projectDetailId!: number | null;

  @Column({ name: 'project_code', type: 'varchar', length: 100, nullable: true })
  projectCode!: string | null;

  @Column({ name: 'project_name', type: 'varchar', length: 255, nullable: true })
  projectName!: string | null;

  @Column({ type: 'text' })
  details!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  baht!: string;

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
