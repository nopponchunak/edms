<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class RepairFeeSheetRevisionWorkflowColumns extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('fee_sheet_revisions')) {
            return;
        }

        $missingStatus = ! Schema::hasColumn('fee_sheet_revisions', 'status');
        $missingApprovalStatus = ! Schema::hasColumn('fee_sheet_revisions', 'approved_by_ch_status');

        if (! $missingStatus && ! $missingApprovalStatus) {
            return;
        }

        Schema::table('fee_sheet_revisions', function (Blueprint $table) use ($missingStatus, $missingApprovalStatus) {
            if ($missingStatus) {
                $table->string('status')->nullable()->default('draft');
            }

            if ($missingApprovalStatus) {
                $table->string('approved_by_ch_status')->nullable();
            }
        });
    }

    public function down()
    {
        // Intentionally non-destructive. These workflow columns may already be owned
        // by an older migration in environments that do not have production drift.
    }
}
