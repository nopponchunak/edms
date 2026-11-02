import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCaStepToGiftForms1794067200000 implements MigrationInterface {
  name = 'AddCaStepToGiftForms1794067200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['gift_hospitality_receivings', 'gift_hospitality_offerings']) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN "ack2_by" VARCHAR(100),
          ADD COLUMN "ack2_by_status" VARCHAR(50),
          ADD COLUMN "ack2_by_date" TIMESTAMPTZ,
          ADD COLUMN "ack2_comment" TEXT
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['gift_hospitality_receivings', 'gift_hospitality_offerings']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "ack2_by", DROP COLUMN "ack2_by_status", DROP COLUMN "ack2_by_date", DROP COLUMN "ack2_comment"`);
    }
  }
}
