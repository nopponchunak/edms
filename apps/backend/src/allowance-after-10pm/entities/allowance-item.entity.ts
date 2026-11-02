import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AllowanceEntity } from './allowance.entity';

@Entity({ name: 'allowance_after_10pm_items' })
export class AllowanceItemEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ name: 'allowance_after_10pm_id', type: 'int', unsigned: true })
  allowanceId!: number;

  @ManyToOne(() => AllowanceEntity, (a) => a.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'allowance_after_10pm_id' })
  allowance!: AllowanceEntity;

  @Column({ type: 'smallint', nullable: true })
  seq!: number | null;

  @Column({ name: 'work_date', type: 'date' })
  workDate!: string;

  @Column({ name: 'project_detail_id', type: 'int', unsigned: true, nullable: true })
  projectDetailId!: number | null;

  @Column({ name: 'project_code', type: 'varchar', length: 100, nullable: true })
  projectCode!: string | null;

  @Column({ name: 'project_name', type: 'varchar', length: 255, nullable: true })
  projectName!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'time_from', type: 'varchar', length: 10, nullable: true })
  timeFrom!: string | null;

  @Column({ name: 'time_to', type: 'varchar', length: 10, nullable: true })
  timeTo!: string | null;

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
