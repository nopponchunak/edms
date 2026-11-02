import { MigrationInterface, QueryRunner } from 'typeorm';

const STEPS = ['verify_is', 'verify', 'approver', 'approver2', 'ack', 'action'];

export class CreatePurchaseRequisitions1794153600000 implements MigrationInterface {
  name = 'CreatePurchaseRequisitions1794153600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const stepColumns = STEPS.map((s) => `"${s}_by" VARCHAR(100), "${s}_by_status" VARCHAR(50), "${s}_by_date" TIMESTAMPTZ, "${s}_comment" TEXT`).join(',\n        ');
    await queryRunner.query(`
      CREATE TABLE "purchase_requisitions" (
        "id" SERIAL PRIMARY KEY,
        "pr_no" VARCHAR(100) UNIQUE,
        "subject" VARCHAR(500) NOT NULL,
        "to_name" VARCHAR(255),
        "request_date" DATE NOT NULL,
        "requested_by" VARCHAR(255) NOT NULL,
        "recommended_by" VARCHAR(255),
        "deadline" DATE,
        "received_from" VARCHAR(255),
        "reasons_for_purchase" TEXT,
        "currency" VARCHAR(10) NOT NULL DEFAULT 'THB',
        "items" JSONB NOT NULL DEFAULT '[]',
        "discount" NUMERIC(15,2) NOT NULL DEFAULT 0,
        "vat" BOOLEAN NOT NULL DEFAULT false,
        "sub_total" NUMERIC(15,2) NOT NULL DEFAULT 0,
        "vat_value" NUMERIC(15,2) NOT NULL DEFAULT 0,
        "grand_total" NUMERIC(15,2) NOT NULL DEFAULT 0,
        "payment_term" VARCHAR(500),
        "other_conditions" TEXT,
        "quotation_attached" BOOLEAN NOT NULL DEFAULT false,
        "not_it_equipment" BOOLEAN NOT NULL DEFAULT false,
        "need_asset_code_registration" BOOLEAN,
        "attachments" JSONB,
        ${stepColumns},
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
      CREATE TABLE "purchase_requisition_events" (
        "id" SERIAL PRIMARY KEY,
        "record_id" INTEGER NOT NULL REFERENCES "purchase_requisitions"("id") ON DELETE CASCADE,
        "version" INTEGER NOT NULL,
        "action" VARCHAR(30) NOT NULL,
        "step" VARCHAR(20),
        "actor" VARCHAR(100) NOT NULL,
        "comment" TEXT,
        "snapshot" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_pr_events_record" ON "purchase_requisition_events" ("record_id", "created_at")`);
    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "name", "description")
      VALUES ('purchase-requisition.view-all', 'Purchase Requisition: View all records', 'See every purchase requisition, not only those you take part in')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
      WHERE r."code" IN ('super_admin', 'administrator', 'accounting_admins') AND p."code" = 'purchase-requisition.view-all'
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" rp USING "permissions" p WHERE rp."permission_id" = p."id" AND p."code" = 'purchase-requisition.view-all'`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'purchase-requisition.view-all'`);
    await queryRunner.query(`DROP TABLE "purchase_requisition_events"`);
    await queryRunner.query(`DROP TABLE "purchase_requisitions"`);
  }
}
