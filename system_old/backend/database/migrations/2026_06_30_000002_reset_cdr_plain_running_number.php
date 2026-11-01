<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ResetCdrPlainRunningNumber extends Migration
{
    private const TABLE = 'controlled_document_requests';
    private const SEQUENCE_TABLE = 'controlled_document_request_number_sequences';
    private const SEQUENCE_PREFIX = 'cdr_';
    private const START_YEAR = 2026;
    private const START_SEQUENCE = 3;
    private const SEQUENCE_PRIMARY_INDEX = 'cdr_number_sequences_pk';
    private const UNIQUE_INDEX = 'controlled_document_requests_cdr_no_unique';

    public function up()
    {
        if (!Schema::hasTable(self::TABLE) || !Schema::hasColumn(self::TABLE, 'cdr_no')) {
            return;
        }

        $this->createSequenceTable();
        $this->clearControlledDocumentRequests();
        $this->clearSequenceTable();
        $this->seedSequence();
        $this->ensureUniqueIndex();
    }

    public function down()
    {
        // This is a destructive reset migration; old CDR rows cannot be restored safely.
    }

    private function createSequenceTable(): void
    {
        if (Schema::hasTable(self::SEQUENCE_TABLE)) {
            $this->ensureSequencePrimaryKey();
            return;
        }

        Schema::create(self::SEQUENCE_TABLE, function (Blueprint $table) {
            $table->string('document_key', 50);
            $table->unsignedInteger('last_number')->default(0);
            $table->timestamps();
            $table->primary('document_key', self::SEQUENCE_PRIMARY_INDEX);
        });
    }

    private function ensureSequencePrimaryKey(): void
    {
        if ($this->indexExists(self::SEQUENCE_TABLE, 'PRIMARY')) {
            return;
        }

        Schema::table(self::SEQUENCE_TABLE, function (Blueprint $table) {
            $table->primary('document_key', self::SEQUENCE_PRIMARY_INDEX);
        });
    }

    private function clearControlledDocumentRequests(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            DB::table(self::TABLE)->truncate();
            return;
        }

        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        try {
            DB::table(self::TABLE)->truncate();
        } finally {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }
    }

    private function clearSequenceTable(): void
    {
        DB::table(self::SEQUENCE_TABLE)->truncate();
    }

    private function seedSequence(): void
    {
        DB::table(self::SEQUENCE_TABLE)->updateOrInsert(
            ['document_key' => self::SEQUENCE_PREFIX . self::START_YEAR],
            [
                'last_number' => self::START_SEQUENCE - 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    private function ensureUniqueIndex(): void
    {
        if ($this->indexExists(self::TABLE, self::UNIQUE_INDEX)) {
            return;
        }

        Schema::table(self::TABLE, function (Blueprint $table) {
            $table->unique('cdr_no', self::UNIQUE_INDEX);
        });
    }

    private function indexExists(string $table, string $index): bool
    {
        if (!Schema::hasTable($table) || DB::connection()->getDriverName() !== 'mysql') {
            return false;
        }

        $result = DB::select(
            'SHOW INDEX FROM `' . $table . '` WHERE Key_name = ?',
            [$index]
        );

        return !empty($result);
    }
}
