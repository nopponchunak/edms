<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddRevisionFieldsToPostmanProposalContractReviewsTable extends Migration
{
    public function up()
    {
        Schema::table('postman_proposal_contract_reviews', function (Blueprint $table) {
            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'root_review_id')) {
                $table->unsignedInteger('root_review_id')->nullable()->after('id');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'revision_no')) {
                $table->unsignedInteger('revision_no')->default(0)->after('root_review_id');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'revision_label')) {
                $table->string('revision_label', 50)->nullable()->after('revision_no');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'revision_reason')) {
                $table->text('revision_reason')->nullable()->after('revision_label');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'revision_summary')) {
                $table->text('revision_summary')->nullable()->after('revision_reason');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'revised_from_id')) {
                $table->unsignedInteger('revised_from_id')->nullable()->after('revision_summary');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'is_latest_revision')) {
                $table->boolean('is_latest_revision')->default(true)->after('revised_from_id');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'locked_at')) {
                $table->dateTime('locked_at')->nullable()->after('is_latest_revision');
            }
        });

        DB::table('postman_proposal_contract_reviews')
            ->whereNull('root_review_id')
            ->update([
                'root_review_id' => DB::raw('id'),
                'revision_no' => 0,
                'revision_label' => 'Rev.0',
                'is_latest_revision' => true,
            ]);

        Schema::table('postman_proposal_contract_reviews', function (Blueprint $table) {
            $table->index(['root_review_id', 'revision_no'], 'pcr_revision_root_no_idx');
            $table->index(['root_review_id', 'is_latest_revision'], 'pcr_revision_latest_idx');
            $table->index(['revised_from_id'], 'pcr_revised_from_idx');
        });
    }

    public function down()
    {
        Schema::table('postman_proposal_contract_reviews', function (Blueprint $table) {
            $table->dropIndex('pcr_revision_root_no_idx');
            $table->dropIndex('pcr_revision_latest_idx');
            $table->dropIndex('pcr_revised_from_idx');
        });

        Schema::table('postman_proposal_contract_reviews', function (Blueprint $table) {
            foreach ([
                'root_review_id',
                'revision_no',
                'revision_label',
                'revision_reason',
                'revision_summary',
                'revised_from_id',
                'is_latest_revision',
                'locked_at',
            ] as $column) {
                if (Schema::hasColumn('postman_proposal_contract_reviews', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
}
