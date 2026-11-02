import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCharitableContributions1793721600000 implements MigrationInterface {
  name = 'CreateCharitableContributions1793721600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "charitable_contributions" (
        "id" SERIAL PRIMARY KEY,
        "voucher_no" VARCHAR(100) UNIQUE,
        "request_type" VARCHAR(50) NOT NULL,
        "requester_name" VARCHAR(255) NOT NULL,
        "event_description" TEXT,
        "event_purpose" TEXT,
        "organizer_name" VARCHAR(255) NOT NULL,
        "contribution_description" TEXT,
        "value_amount" NUMERIC(15,2) NOT NULL DEFAULT 0,
        "currency" VARCHAR(10) NOT NULL DEFAULT 'THB',
        "proposed_date" DATE NOT NULL,
        "attachments" JSONB,
        "verify_by" VARCHAR(100), "verify_by_status" VARCHAR(50), "verify_by_date" TIMESTAMPTZ,
        "ack1_by" VARCHAR(100), "ack1_by_status" VARCHAR(50), "ack1_by_date" TIMESTAMPTZ,
        "approver_by" VARCHAR(100), "approver_by_status" VARCHAR(50), "approver_by_date" TIMESTAMPTZ,
        "approver2_by" VARCHAR(100), "approver2_by_status" VARCHAR(50), "approver2_by_date" TIMESTAMPTZ,
        "ack2_by" VARCHAR(100), "ack2_by_status" VARCHAR(50), "ack2_by_date" TIMESTAMPTZ,
        "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
        "create_by" VARCHAR(100),
        "update_by" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "name", "description")
      VALUES ('charitable-contribution.view-all', 'Charitable Contribution: View all records', 'See every charitable contribution request, not only those you take part in')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
      WHERE r."code" IN ('super_admin', 'administrator', 'accounting_admins') AND p."code" = 'charitable-contribution.view-all'
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" rp USING "permissions" p WHERE rp."permission_id" = p."id" AND p."code" = 'charitable-contribution.view-all'`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'charitable-contribution.view-all'`);
    await queryRunner.query(`DROP TABLE "charitable_contributions"`);
  }
}
