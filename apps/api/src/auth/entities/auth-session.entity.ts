import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'auth_sessions' })
@Check('CHK_auth_sessions_provider', `"provider" IN ('ldap', 'local')`)
export class AuthSessionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Index('IDX_auth_sessions_token_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Index('IDX_auth_sessions_subject')
  @Column({ type: 'varchar', length: 150 })
  subject!: string;

  @Column({ type: 'varchar', length: 150 })
  username!: string;

  @Column({ type: 'varchar', length: 30 })
  provider!: 'ldap' | 'local';

  @Column({ type: 'jsonb' })
  claims!: Record<string, unknown>;

  @Index('IDX_auth_sessions_expires_at')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
