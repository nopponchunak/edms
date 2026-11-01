import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpensesClaimCurrency1793458800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE IF EXISTS expenses_claims ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'THB'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE IF EXISTS expenses_claims DROP COLUMN IF EXISTS currency`);
  }
}
