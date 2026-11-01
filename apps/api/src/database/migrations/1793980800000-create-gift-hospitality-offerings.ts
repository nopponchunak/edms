import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGiftHospitalityOfferings1793980800000 implements MigrationInterface {
  name = 'CreateGiftHospitalityOfferings1793980800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gift_hospitality_offerings" (
        "id" SERIAL PRIMARY KEY,
        "voucher_no" VARCHAR(100) UNIQUE,
        "request_type" VARCHAR(50) NOT NULL,
        "requester_name" VARCHAR(255) NOT NULL,
        "description" TEXT,
        "purpose" TEXT,
        "value_amount" NUMERIC(15,2) NOT NULL DEFAULT 0,
        "currency" VARCHAR(10) NOT NULL DEFAULT 'THB',
        "receiver_name_company" VARCHAR(500) NOT NULL,
        "proposed_date" DATE NOT NULL,
        "attachments" JSONB,
        "verify_by" VARCHAR(100), "verify_by_status" VARCHAR(50), "verify_by_date" TIMESTAMPTZ, "verify_comment" TEXT,
        "ack1_by" VARCHAR(100), "ack1_by_status" VARCHAR(50), "ack1_by_date" TIMESTAMPTZ, "ack1_comment" TEXT,
        "approver_by" VARCHAR(100), "approver_by_status" VARCHAR(50), "approver_by_date" TIMESTAMPTZ, "approver_comment" TEXT,
        "approver2_by" VARCHAR(100), "approver2_by_status" VARCHAR(50), "approver2_by_date" TIMESTAMPTZ, "approver2_comment" TEXT,
        "version" INTEGER NOT NULL DEFAULT 0,
        "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
        "create_by" VARCHAR(100),
        "update_by" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "gift_hospitality_offering_events" (
        "id" SERIAL PRIMARY KEY,
        "record_id" INTEGER NOT NULL REFERENCES "gift_hospitality_offerings"("id") ON DELETE CASCADE,
        "version" INTEGER NOT NULL,
        "action" VARCHAR(30) NOT NULL,
        "step" VARCHAR(20),
        "actor" VARCHAR(100) NOT NULL,
        "comment" TEXT,
        "snapshot" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_gho_events_record" ON "gift_hospitality_offering_events" ("record_id", "created_at")`);
    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "name", "description")
      VALUES ('gift-hospitality-offering.view-all', 'Gift/Hospitality Offering: View all records', 'See every offering request, not only those you take part in')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
      WHERE r."code" IN ('super_admin', 'administrator', 'accounting_admins') AND p."code" = 'gift-hospitality-offering.view-all'
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" rp USING "permissions" p WHERE rp."permission_id" = p."id" AND p."code" = 'gift-hospitality-offering.view-all'`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'gift-hospitality-offering.view-all'`);
    await queryRunner.query(`DROP TABLE "gift_hospitality_offering_events"`);
    await queryRunner.query(`DROP TABLE "gift_hospitality_offerings"`);
  }
}
