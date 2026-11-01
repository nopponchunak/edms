<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddRevisionFieldsToFeeAgreements extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        if (!Schema::hasColumn('fee_sheet_revisions', 'status')) {
            Schema::table('fee_sheet_revisions', function (Blueprint $table) {
                $table->string('status')->default('draft');
            });
        }

        Schema::table('fee_agreements', function (Blueprint $table) {
            if (!Schema::hasColumn('fee_agreements', 'revision_no')) {
                $table->integer('revision_no')->default(0);
            }
            if (!Schema::hasColumn('fee_agreements', 'revision_label')) {
                $table->string('revision_label')->nullable();
            }
            if (!Schema::hasColumn('fee_agreements', 'revision_name')) {
                $table->string('revision_name')->nullable();
            }
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('fee_sheet_revisions', function (Blueprint $table) {
            $table->dropColumn('status');
        });

        Schema::table('fee_agreements', function (Blueprint $table) {
            $table->dropColumn(['revision_label', 'revision_name']);
        });
    }
}
