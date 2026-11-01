<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddProposalProjectReferenceToFeeSheets extends Migration
{
    public function up()
    {
        if (Schema::hasTable('fee_sheets') && ! Schema::hasColumn('fee_sheets', 'proposal_project_reference_id')) {
            Schema::table('fee_sheets', function (Blueprint $table) {
                $table->unsignedInteger('proposal_project_reference_id')->nullable()->after('project_id');
                $table->index('proposal_project_reference_id', 'fee_sheets_project_reference_idx');
                $table->foreign('proposal_project_reference_id', 'fee_sheets_project_reference_fk')
                    ->references('id')
                    ->on('proposal_project_references')
                    ->nullOnDelete();
            });
        }

        if (Schema::hasTable('fee_sheet_revisions') && ! Schema::hasColumn('fee_sheet_revisions', 'proposal_project_reference_id')) {
            Schema::table('fee_sheet_revisions', function (Blueprint $table) {
                $table->unsignedInteger('proposal_project_reference_id')->nullable()->after('project_id');
                $table->index('proposal_project_reference_id', 'fee_sheet_revisions_project_reference_idx');
                $table->foreign('proposal_project_reference_id', 'fee_sheet_revisions_project_reference_fk')
                    ->references('id')
                    ->on('proposal_project_references')
                    ->nullOnDelete();
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('fee_sheet_revisions') && Schema::hasColumn('fee_sheet_revisions', 'proposal_project_reference_id')) {
            Schema::table('fee_sheet_revisions', function (Blueprint $table) {
                $table->dropForeign('fee_sheet_revisions_project_reference_fk');
                $table->dropIndex('fee_sheet_revisions_project_reference_idx');
                $table->dropColumn('proposal_project_reference_id');
            });
        }

        if (Schema::hasTable('fee_sheets') && Schema::hasColumn('fee_sheets', 'proposal_project_reference_id')) {
            Schema::table('fee_sheets', function (Blueprint $table) {
                $table->dropForeign('fee_sheets_project_reference_fk');
                $table->dropIndex('fee_sheets_project_reference_idx');
                $table->dropColumn('proposal_project_reference_id');
            });
        }
    }
}
