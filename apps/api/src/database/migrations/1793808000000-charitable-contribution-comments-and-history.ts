import { MigrationInterface, QueryRunner } from 'typeorm';

export class CharitableContributionCommentsAndHistory1793808000000 implements MigrationInterface {
  name = 'CharitableContributionCommentsAndHistory1793808000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "charitable_contributions"
        ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN "verify_comment" TEXT,
        ADD COLUMN "ack1_comment" TEXT,
        ADD COLUMN "approver_comment" TEXT,
        ADD COLUMN "approver2_comment" TEXT,
        ADD COLUMN "ack2_comment" TEXT
    `);
    // Requests that were already submitted before versioning start at version 1.
    await queryRunner.query(`UPDATE "charitable_contributions" SET "version" = 1 WHERE "status" <> 'draft'`);
    await queryRunner.query(`
      CREATE TABLE "charitable_contribution_events" (
        "id" SERIAL PRIMARY KEY,
        "record_id" INTEGER NOT NULL REFERENCES "charitable_contributions"("id") ON DELETE CASCADE,
        "version" INTEGER NOT NULL,
        "action" VARCHAR(30) NOT NULL,
        "step" VARCHAR(20),
        "actor" VARCHAR(100) NOT NULL,
        "comment" TEXT,
        "snapshot" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_cc_events_record" ON "charitable_contribution_events" ("record_id", "created_at")`);
    // Give already submitted requests a first "submitted" entry so their history is not empty.
    await queryRunner.query(`
      INSERT INTO "charitable_contribution_events" ("record_id", "version", "action", "actor", "created_at")
      SELECT "id", 1, 'submitted', COALESCE("create_by", 'unknown'), "created_at"
      FROM "charitable_contributions" WHERE "status" <> 'draft'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "charitable_contribution_events"`);
    await queryRunner.query(`
      ALTER TABLE "charitable_contributions"
        DROP COLUMN "version", DROP COLUMN "verify_comment", DROP COLUMN "ack1_comment",
        DROP COLUMN "approver_comment", DROP COLUMN "approver2_comment", DROP COLUMN "ack2_comment"
    `);
  }
}
