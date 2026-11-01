import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'audit_logs' })
export class AuditLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Index('IDX_audit_logs_actor_user_id')
  @Column({ name: 'actor_user_id', type: 'integer', nullable: true })
  actorUserId!: number | null;

  @Column({ name: 'actor_username', type: 'varchar', length: 150 })
  actorUsername!: string;

  @Index('IDX_audit_logs_action')
  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Index('IDX_audit_logs_target_type')
  @Column({ name: 'target_type', type: 'varchar', length: 80 })
  targetType!: string;

  @Column({ name: 'target_id', type: 'integer', nullable: true })
  targetId!: number | null;

  @Column({ name: 'target_label', type: 'varchar', length: 255, nullable: true })
  targetLabel!: string | null;

  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState!: Record<string, unknown> | null;

  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState!: Record<string, unknown> | null;

  @Index('IDX_audit_logs_created_at')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
