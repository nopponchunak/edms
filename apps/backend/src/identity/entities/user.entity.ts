import { Check, Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, JoinTable, ManyToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { EmployeeEntity } from './employee.entity';
import { RoleEntity } from './role.entity';

@Entity({ name: 'users' })
@Check('CHK_users_auth_provider', `"auth_provider" IN ('ldap', 'local')`)
@Check('CHK_users_status', `"status" IN ('active', 'inactive', 'pending')`)
export class UserEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  username!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  code!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 255 })
  displayName!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash!: string | null;

  @Column({ name: 'auth_provider', type: 'varchar', length: 30, default: 'ldap' })
  authProvider!: 'ldap' | 'local';

  @Column({ type: 'varchar', length: 30, default: 'active' })
  status!: 'active' | 'inactive' | 'pending';

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ name: 'is_super_admin', type: 'boolean', default: false })
  isSuperAdmin!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'employee_id', type: 'integer', nullable: true, unique: true })
  employeeId!: number | null;

  @OneToOne(() => EmployeeEntity, (employee) => employee.user, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_id' })
  employee?: EmployeeEntity | null;

  @ManyToMany(() => RoleEntity, (role) => role.users)
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles?: RoleEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
