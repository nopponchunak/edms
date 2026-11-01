<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddAttachmentsToCdrAndGiftTables extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('controlled_document_requests', function (Blueprint $table) {
            $table->longText('attachments')->nullable()->after('attach_document_note');
        });

        Schema::table('gift_hospitalities', function (Blueprint $table) {
            $table->longText('attachments')->nullable()->after('proposed_date');
        });

        Schema::table('gift_hospitality_offerings', function (Blueprint $table) {
            $table->longText('attachments')->nullable()->after('proposed_date');
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
            $table->dropColumn('attachments');
        });

        Schema::table('gift_hospitalities', function (Blueprint $table) {
            $table->dropColumn('attachments');
        });

        Schema::table('gift_hospitality_offerings', function (Blueprint $table) {
            $table->dropColumn('attachments');
        });
    }
}
