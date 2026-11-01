<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddWorkflowFieldsToPostmanProposalContractReviewsTable extends Migration
{
    public function up()
    {
        Schema::table('postman_proposal_contract_reviews', function (Blueprint $table) {
            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'primary_discipline')) {
                $table->string('primary_discipline', 50)->nullable()->after('proposal_number');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'mt_project_no')) {
                $table->string('mt_project_no', 100)->nullable()->after('primary_discipline');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'project_type')) {
                $table->string('project_type', 100)->nullable()->after('client_name');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'currency')) {
                $table->string('currency', 10)->nullable()->after('project_type');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'estimated_total_fees')) {
                $table->decimal('estimated_total_fees', 18, 2)->nullable()->after('currency');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'proposal_decision')) {
                $table->string('proposal_decision', 50)->nullable()->after('proposal_to_be_submitted');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'win_probability')) {
                $table->decimal('win_probability', 5, 2)->nullable()->after('proposal_decision');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'contract_decision')) {
                $table->string('contract_decision', 50)->nullable()->after('contract_agreed_to_proceed');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'need_quality_plan_pqp')) {
                $table->string('need_quality_plan_pqp', 10)->nullable()->after('contract_decision');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'submitted_at')) {
                $table->dateTime('submitted_at')->nullable()->after('status');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'proposal_reviewed_at')) {
                $table->dateTime('proposal_reviewed_at')->nullable()->after('submitted_at');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'contract_reviewed_at')) {
                $table->dateTime('contract_reviewed_at')->nullable()->after('proposal_reviewed_at');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'completed_at')) {
                $table->dateTime('completed_at')->nullable()->after('contract_reviewed_at');
            }
        });

        Schema::table('postman_proposal_contract_reviews', function (Blueprint $table) {
            $table->index(['status'], 'pcr_status_idx');
            $table->index(['proposal_number'], 'pcr_proposal_number_idx');
            $table->index(['mt_project_no'], 'pcr_mt_project_no_idx');
            $table->index(['primary_discipline'], 'pcr_primary_discipline_idx');
        });
    }

    public function down()
    {
        Schema::table('postman_proposal_contract_reviews', function (Blueprint $table) {
            $table->dropIndex('pcr_status_idx');
            $table->dropIndex('pcr_proposal_number_idx');
            $table->dropIndex('pcr_mt_project_no_idx');
            $table->dropIndex('pcr_primary_discipline_idx');
        });

        Schema::table('postman_proposal_contract_reviews', function (Blueprint $table) {
            foreach ([
                'primary_discipline',
                'mt_project_no',
                'project_type',
                'currency',
                'estimated_total_fees',
                'proposal_decision',
                'win_probability',
                'contract_decision',
                'need_quality_plan_pqp',
                'submitted_at',
                'proposal_reviewed_at',
                'contract_reviewed_at',
                'completed_at',
            ] as $column) {
                if (Schema::hasColumn('postman_proposal_contract_reviews', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
}
