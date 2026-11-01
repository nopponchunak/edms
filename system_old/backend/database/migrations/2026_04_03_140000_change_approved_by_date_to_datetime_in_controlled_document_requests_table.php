<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ChangeApprovedByDateToDatetimeInControlledDocumentRequestsTable extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('controlled_document_requests')) {
            return;
        }

        // Use raw SQL to avoid requiring doctrine/dbal for column changes.
        DB::statement("ALTER TABLE `controlled_document_requests` MODIFY `approved_by_date` DATETIME NULL");
    }

    public function down()
    {
        if (!Schema::hasTable('controlled_document_requests')) {
            return;
        }

        DB::statement("ALTER TABLE `controlled_document_requests` MODIFY `approved_by_date` DATE NULL");
    }
}

