<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

class ChangeAttachmentsToLongtext extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        DB::statement("ALTER TABLE supplier_assessments MODIFY attachments LONGTEXT NULL");
        DB::statement("ALTER TABLE single_source_justifications MODIFY attachments LONGTEXT NULL");
        DB::statement("ALTER TABLE purchase_orders MODIFY attachments LONGTEXT NULL");
        DB::statement("ALTER TABLE supplier_evaluations MODIFY attachments LONGTEXT NULL");
        DB::statement("ALTER TABLE purchase_requisitions MODIFY attachments LONGTEXT NULL");
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        DB::statement("ALTER TABLE supplier_assessments MODIFY attachments JSON NULL");
        DB::statement("ALTER TABLE single_source_justifications MODIFY attachments JSON NULL");
        DB::statement("ALTER TABLE purchase_orders MODIFY attachments JSON NULL");
        DB::statement("ALTER TABLE supplier_evaluations MODIFY attachments JSON NULL");
        DB::statement("ALTER TABLE purchase_requisitions MODIFY attachments JSON NULL");
    }
}
