<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ChangeCdrReasonDescriptionToText extends Migration
{
    private const TABLE = 'controlled_document_requests';
    private const COLUMN = 'reason_description';

    public function up()
    {
        if (!Schema::hasTable(self::TABLE) || !Schema::hasColumn(self::TABLE, self::COLUMN)) {
            return;
        }

        $this->changeColumnType('TEXT');
    }

    public function down()
    {
        if (!Schema::hasTable(self::TABLE) || !Schema::hasColumn(self::TABLE, self::COLUMN)) {
            return;
        }

        $this->changeColumnType('VARCHAR(255)');
    }

    private function changeColumnType(string $type): void
    {
        $driver = DB::connection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement(sprintf(
                'ALTER TABLE `%s` MODIFY `%s` %s NULL',
                self::TABLE,
                self::COLUMN,
                $type
            ));
            return;
        }

        if ($driver === 'pgsql') {
            DB::statement(sprintf(
                'ALTER TABLE "%s" ALTER COLUMN "%s" TYPE %s',
                self::TABLE,
                self::COLUMN,
                $type === 'TEXT' ? 'TEXT' : 'VARCHAR(255)'
            ));
            return;
        }

        if ($driver === 'sqlsrv') {
            DB::statement(sprintf(
                'ALTER TABLE [%s] ALTER COLUMN [%s] %s NULL',
                self::TABLE,
                self::COLUMN,
                $type === 'TEXT' ? 'NVARCHAR(MAX)' : 'NVARCHAR(255)'
            ));
        }

        // SQLite does not enforce VARCHAR length, so no schema rewrite is needed.
    }
}
