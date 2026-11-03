import { MigrationInterface, QueryRunner } from 'typeorm';

/** Per table: the columns that name a person, each paired with its status column. */
const TABLES: Record<string, string[][]> = {
  expenses_claims: [['verified_by', 'verified_by_status'], ['approved_by', 'approved_by_status']],
  allowance_after_10pm: [['tl_by', 'tl_by_status'], ['di_by', 'di_by_status']],
  charitable_contributions: [['verify_by', 'verify_by_status'], ['ack1_by', 'ack1_by_status'], ['approver_by', 'approver_by_status'], ['approver2_by', 'approver2_by_status'], ['ack2_by', 'ack2_by_status']],
  gift_hospitality_receivings: [['verify_by', 'verify_by_status'], ['ack1_by', 'ack1_by_status'], ['approver_by', 'approver_by_status'], ['ack2_by', 'ack2_by_status']],
  gift_hospitality_offerings: [['verify_by', 'verify_by_status'], ['ack1_by', 'ack1_by_status'], ['approver_by', 'approver_by_status'], ['approver2_by', 'approver2_by_status'], ['ack2_by', 'ack2_by_status']],
  purchase_requisitions: [['verify_is_by', 'verify_is_by_status'], ['verify_by', 'verify_by_status'], ['approver_by', 'approver_by_status'], ['approver2_by', 'approver2_by_status'], ['ack_by', 'ack_by_status'], ['action_by', 'action_by_status']],
};

export class AddFormVersionAndSigners1794240000000 implements MigrationInterface {
  name = 'AddFormVersionAndSigners1794240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, pairs] of Object.entries(TABLES)) {
      // form_version: the layout / flow a document was filed under; finished documents keep opening in that version.
      // signers: name and employee code of each person at the time they signed, so a later deactivation changes nothing.
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "form_version" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "signers" JSONB NOT NULL DEFAULT '{}'`);
      const people = ['t.create_by', ...pairs.map(([by, status]) => `CASE WHEN t.${status} IN ('approved', 'rejected') THEN t.${by} END`)];
      await queryRunner.query(`
        UPDATE "${table}" t SET "signers" = COALESCE((
          SELECT jsonb_object_agg(u.username, jsonb_build_object('name', u.display_name, 'code', u.code))
          FROM users u WHERE LOWER(u.username) = ANY (ARRAY[${people.map((p) => `LOWER(${p})`).join(', ')}])
        ), '{}'::jsonb)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of Object.keys(TABLES)) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "signers", DROP COLUMN "form_version"`);
    }
  }
}
