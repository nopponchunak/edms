<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CreatePostmanProposalContractReviewProjectsTable extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('postman_proposal_contract_review_projects')) {
            Schema::create('postman_proposal_contract_review_projects', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('proposal_contract_review_id');
                $table->string('proposal_number', 100)->nullable();
                $table->string('mt_project_no', 100);
                $table->string('project_no', 100)->nullable();
                $table->string('project_name', 255)->nullable();
                $table->string('primary_discipline', 50)->nullable();
                $table->string('project_type', 100)->nullable();
                $table->string('currency', 10)->nullable();
                $table->decimal('estimated_total_fees', 18, 2)->nullable();
                $table->unsignedInteger('sequence_no')->default(1);
                $table->string('status', 50)->default('active');
                $table->dateTime('converted_at')->nullable();
                $table->json('metadata')->nullable();
                $table->string('create_by', 100)->nullable();
                $table->string('update_by', 100)->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->foreign('proposal_contract_review_id', 'pcr_projects_review_id_foreign')
                    ->references('id')
                    ->on('postman_proposal_contract_reviews')
                    ->onDelete('cascade');

                $table->unique('mt_project_no', 'pcr_projects_mt_project_no_unique');
                $table->index(['proposal_contract_review_id'], 'pcr_projects_review_id_idx');
                $table->index(['proposal_number'], 'pcr_projects_proposal_number_idx');
                $table->index(['project_no'], 'pcr_projects_project_no_idx');
            });
        }

        if (Schema::hasTable('postman_proposal_contract_review_projects')) {
            $existing = DB::table('postman_proposal_contract_reviews')
                ->whereNotNull('mt_project_no')
                ->where('mt_project_no', '!=', '')
                ->where(function ($query) {
                    $query->where('contract_decision', 'proceed')
                        ->orWhere('contract_agreed_to_proceed', 'Yes');
                })
                ->get();

            foreach ($existing as $review) {
                $exists = DB::table('postman_proposal_contract_review_projects')
                    ->where('mt_project_no', $review->mt_project_no)
                    ->exists();

                if ($exists) {
                    continue;
                }

                DB::table('postman_proposal_contract_review_projects')->insert([
                    'proposal_contract_review_id' => $review->id,
                    'proposal_number' => $review->proposal_number,
                    'mt_project_no' => $review->mt_project_no,
                    'project_no' => $review->project_no ?: $review->mt_project_no,
                    'project_name' => $review->project_name,
                    'primary_discipline' => $review->primary_discipline,
                    'project_type' => $review->project_type,
                    'currency' => $review->currency,
                    'estimated_total_fees' => $review->estimated_total_fees,
                    'sequence_no' => 1,
                    'status' => 'active',
                    'converted_at' => $review->contract_reviewed_at ?: $review->completed_at,
                    'metadata' => null,
                    'create_by' => $review->create_by,
                    'update_by' => $review->update_by,
                    'created_at' => $review->created_at,
                    'updated_at' => $review->updated_at,
                    'deleted_at' => null,
                ]);
            }
        }
    }

    public function down()
    {
        Schema::dropIfExists('postman_proposal_contract_review_projects');
    }
}
