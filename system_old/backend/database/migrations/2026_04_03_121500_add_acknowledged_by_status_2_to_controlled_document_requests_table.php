<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddAcknowledgedByStatus2ToControlledDocumentRequestsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('controlled_document_requests', function (Blueprint $table) {
            $table->string('acknowledged_by_status_2')->nullable()->after('acknowledged_by_status');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('controlled_document_requests', function (Blueprint $table) {
            $table->dropColumn('acknowledged_by_status_2');
        });
    }
}
