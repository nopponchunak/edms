import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from './user.entity';

@Entity({ name: 'employees' })
export class EmployeeEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  code!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  username!: string | null;

  @Column({ name: 'firstname', type: 'varchar', length: 255 })
  firstName!: string;

  @Column({ name: 'lastname', type: 'varchar', length: 255 })
  lastName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'department_id', type: 'integer', nullable: true })
  departmentId!: number | null;

  @Column({ name: 'department_name', type: 'varchar', length: 255, nullable: true })
  departmentName!: string | null;

  @Column({ name: 'title_name', type: 'varchar', length: 255, nullable: true })
  titleName!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  initial!: string | null;

  @Column({ name: 'level_name', type: 'varchar', length: 255, nullable: true })
  levelName!: string | null;

  @Column({ name: 'employee_status', type: 'varchar', length: 50, nullable: true })
  employeeStatus!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  active!: string | null;

  @Column({ name: 'is_approver', type: 'boolean', default: false })
  isApprover!: boolean;

  @Column({ name: 'hris_updated_at', type: 'timestamptz', nullable: true })
  hrisUpdatedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToOne(() => UserEntity, (user) => user.employee)
  user?: UserEntity;
}
