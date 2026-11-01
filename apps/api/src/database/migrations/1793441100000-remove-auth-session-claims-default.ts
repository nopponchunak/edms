import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveAuthSessionClaimsDefault1793441100000 implements MigrationInterface {
  name = 'RemoveAuthSessionClaimsDefault1793441100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "auth_sessions" ALTER COLUMN "claims" DROP DEFAULT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "auth_sessions" ALTER COLUMN "claims" SET DEFAULT '{}'::jsonb`);
  }
}
