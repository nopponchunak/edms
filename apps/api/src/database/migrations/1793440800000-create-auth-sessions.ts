import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthSessions1793440800000 implements MigrationInterface {
  name = 'CreateAuthSessions1793440800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid PRIMARY KEY,
        "token_hash" char(64) NOT NULL,
        "subject" varchar(150) NOT NULL,
        "username" varchar(150) NOT NULL,
        "provider" varchar(30) NOT NULL,
        "claims" jsonb NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "last_used_at" timestamptz,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_auth_sessions_provider" CHECK ("provider" IN ('ldap', 'local'))
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_auth_sessions_token_hash" ON "auth_sessions" ("token_hash")`);
    await queryRunner.query(`CREATE INDEX "IDX_auth_sessions_subject" ON "auth_sessions" ("subject")`);
    await queryRunner.query(`CREATE INDEX "IDX_auth_sessions_expires_at" ON "auth_sessions" ("expires_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
  }
}
