<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class LinkPqaPlansToProposalContractReviews extends Migration
{
    public function up()
    {
        Schema::table('project_quality_assurance_plans', function (Blueprint $table) {
            if (! Schema::hasColumn('project_quality_assurance_plans', 'proposal_contract_review_id')) {
                $table->unsignedInteger('proposal_contract_review_id')->nullable()->after('id');
            }

            if (! Schema::hasColumn('project_quality_assurance_plans', 'proposal_number')) {
                $table->string('proposal_number', 100)->nullable()->after('project_no');
            }

            if (! Schema::hasColumn('project_quality_assurance_plans', 'source_contract_decision')) {
                $table->string('source_contract_decision', 50)->nullable()->after('proposal_number');
            }
        });

        Schema::table('project_quality_assurance_plans', function (Blueprint $table) {
            $table->foreign('proposal_contract_review_id', 'pqa_pcr_id_foreign')
                ->references('id')
                ->on('postman_proposal_contract_reviews')
                ->onDelete('set null');

            $table->index(['proposal_contract_review_id'], 'pqa_pcr_id_idx');
            $table->index(['proposal_number'], 'pqa_proposal_number_idx');
        });
    }

    public function down()
    {
        Schema::table('project_quality_assurance_plans', function (Blueprint $table) {
            $table->dropForeign('pqa_pcr_id_foreign');
            $table->dropIndex('pqa_pcr_id_idx');
            $table->dropIndex('pqa_proposal_number_idx');
        });

        Schema::table('project_quality_assurance_plans', function (Blueprint $table) {
            foreach ([
                'proposal_contract_review_id',
                'proposal_number',
                'source_contract_decision',
            ] as $column) {
                if (Schema::hasColumn('project_quality_assurance_plans', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
}
