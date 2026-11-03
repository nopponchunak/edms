import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type DesignReviewStatus = 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';

export interface ChecklistAnswer {
  id: string;
  answer: 'yes' | 'no' | 'na' | null;
}

@Entity({ name: 'design_reviews' })
export class DesignReviewEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Which review form this is (mtdd01 = Concept Design Review); see design-review.config.ts. */
  @Column({ name: 'form_type', type: 'varchar', length: 20, default: 'mtdd01' })
  formType!: string;

  @Column({ name: 'voucher_no', type: 'varchar', length: 100, unique: true, nullable: true })
  voucherNo!: string | null;

  @Column({ name: 'project_id', type: 'int', nullable: true })
  projectId!: number | null;

  @Column({ name: 'project_no', type: 'varchar', length: 100, nullable: true })
  projectNo!: string | null;

  @Column({ name: 'project_name', type: 'varchar', length: 500, nullable: true })
  projectName!: string | null;

  @Column({ name: 'prepared_by', type: 'varchar', length: 255 })
  preparedBy!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  discipline!: string | null;

  @Column({ name: 'discipline_other', type: 'varchar', length: 255, nullable: true })
  disciplineOther!: string | null;

  /** Shown as "Detail" on the form. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  stage!: string | null;

  @Column({ name: 'document_types', type: 'jsonb', default: () => "'[]'" })
  documentTypes!: string[];

  @Column({ name: 'document_types_other', type: 'varchar', length: 255, nullable: true })
  documentTypesOther!: string | null;

  @Column({ name: 'document_location', type: 'varchar', length: 500, nullable: true })
  documentLocation!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  checklist!: ChecklistAnswer[];

  @Column({ type: 'text', nullable: true })
  comments!: string | null;

  @Column({ name: 'recommended_actions', type: 'text', nullable: true })
  recommendedActions!: string | null;

  @Column({ name: 'actions_taken', type: 'boolean', nullable: true })
  actionsTaken!: boolean | null;

  @Column({ name: 'action_note', type: 'text', nullable: true })
  actionNote!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  attachments!: unknown[] | null;

  @Column({ name: 'review_by', type: 'varchar', length: 100, nullable: true })
  reviewBy!: string | null;
  @Column({ name: 'review_by_status', type: 'varchar', length: 50, nullable: true })
  reviewByStatus!: string | null;
  @Column({ name: 'review_by_date', type: 'timestamptz', nullable: true })
  reviewByDate!: Date | null;
  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment!: string | null;

  @Column({ name: 'respond_by', type: 'varchar', length: 100, nullable: true })
  respondBy!: string | null;
  @Column({ name: 'respond_by_status', type: 'varchar', length: 50, nullable: true })
  respondByStatus!: string | null;
  @Column({ name: 'respond_by_date', type: 'timestamptz', nullable: true })
  respondByDate!: Date | null;
  @Column({ name: 'respond_comment', type: 'text', nullable: true })
  respondComment!: string | null;

  @Column({ name: 'tl_by', type: 'varchar', length: 100, nullable: true })
  tlBy!: string | null;
  @Column({ name: 'tl_by_status', type: 'varchar', length: 50, nullable: true })
  tlByStatus!: string | null;
  @Column({ name: 'tl_by_date', type: 'timestamptz', nullable: true })
  tlByDate!: Date | null;
  @Column({ name: 'tl_comment', type: 'text', nullable: true })
  tlComment!: string | null;

  @Column({ name: 'tl2_by', type: 'varchar', length: 100, nullable: true })
  tl2By!: string | null;
  @Column({ name: 'tl2_by_status', type: 'varchar', length: 50, nullable: true })
  tl2ByStatus!: string | null;
  @Column({ name: 'tl2_by_date', type: 'timestamptz', nullable: true })
  tl2ByDate!: Date | null;
  @Column({ name: 'tl2_comment', type: 'text', nullable: true })
  tl2Comment!: string | null;

  @Column({ name: 'ack_by', type: 'varchar', length: 100, nullable: true })
  ackBy!: string | null;
  @Column({ name: 'ack_by_status', type: 'varchar', length: 50, nullable: true })
  ackByStatus!: string | null;
  @Column({ name: 'ack_by_date', type: 'timestamptz', nullable: true })
  ackByDate!: Date | null;
  @Column({ name: 'ack_comment', type: 'text', nullable: true })
  ackComment!: string | null;

  /** 0 while a draft; 1 on first submit; +1 each time a rejected review is revised and submitted again. */
  @Column({ type: 'int', default: 0 })
  version!: number;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status!: DesignReviewStatus;

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
