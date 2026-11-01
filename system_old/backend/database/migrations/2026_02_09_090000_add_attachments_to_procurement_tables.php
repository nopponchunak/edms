<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddAttachmentsToProcurementTables extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('supplier_assessments', function (Blueprint $table) {
            $table->json('attachments')->nullable()->after('remark');
        });

        Schema::table('single_source_justifications', function (Blueprint $table) {
            $table->json('attachments')->nullable()->after('acknowledged_by_comments');
        });

        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->json('attachments')->nullable()->after('comments');
        });

        Schema::table('supplier_evaluations', function (Blueprint $table) {
            $table->json('attachments')->nullable()->after('decision');
        });

        Schema::table('purchase_requisitions', function (Blueprint $table) {
            $table->json('attachments')->nullable()->after('quotation_attached');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('supplier_assessments', function (Blueprint $table) {
            $table->dropColumn('attachments');
        });

        Schema::table('single_source_justifications', function (Blueprint $table) {
            $table->dropColumn('attachments');
        });

        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropColumn('attachments');
        });

        Schema::table('supplier_evaluations', function (Blueprint $table) {
            $table->dropColumn('attachments');
        });

        Schema::table('purchase_requisitions', function (Blueprint $table) {
            $table->dropColumn('attachments');
        });
    }
}
