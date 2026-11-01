<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CreateProposalProjectReferencesTable extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('proposal_project_references')) {
            Schema::create('proposal_project_references', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('proposal_contract_review_id');
                $table->unsignedInteger('proposal_contract_review_project_id')->nullable();
                $table->string('proposal_number', 100)->nullable();
                $table->string('project_number', 100)->nullable();
                $table->string('project_name', 255)->nullable();
                $table->string('status', 50)->default('active');
                $table->json('metadata')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->foreign('proposal_contract_review_id', 'proposal_project_refs_review_fk')
                    ->references('id')
                    ->on('postman_proposal_contract_reviews')
                    ->onDelete('cascade');

                $table->foreign('proposal_contract_review_project_id', 'proposal_project_refs_project_fk')
                    ->references('id')
                    ->on('postman_proposal_contract_review_projects')
                    ->onDelete('set null');

                $table->unique('proposal_contract_review_project_id', 'proposal_project_refs_project_unique');
                $table->unique('project_number', 'proposal_project_refs_project_number_unique');
                $table->index('proposal_contract_review_id', 'proposal_project_refs_review_idx');
                $table->index('proposal_number', 'proposal_project_refs_proposal_number_idx');
                $table->index('status', 'proposal_project_refs_status_idx');
            });
        }

        if (! Schema::hasTable('proposal_project_references')) {
            return;
        }

        DB::table('postman_proposal_contract_reviews')
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->chunkById(100, function ($reviews) {
                foreach ($reviews as $review) {
                    $projects = DB::table('postman_proposal_contract_review_projects')
                        ->where('proposal_contract_review_id', $review->id)
                        ->whereNull('deleted_at')
                        ->orderBy('sequence_no')
                        ->orderBy('id')
                        ->get();

                    if ($projects->isEmpty()) {
                        DB::table('proposal_project_references')->updateOrInsert(
                            [
                                'proposal_contract_review_id' => $review->id,
                                'proposal_contract_review_project_id' => null,
                            ],
                            [
                                'proposal_number' => $review->proposal_number,
                                'project_number' => $review->project_no ?: $review->mt_project_no,
                                'project_name' => $review->project_name,
                                'status' => $review->status ?: 'active',
                                'metadata' => json_encode(['source' => 'proposal_contract_review'], JSON_UNESCAPED_UNICODE),
                                'created_at' => $review->created_at,
                                'updated_at' => now(),
                                'deleted_at' => null,
                            ]
                        );
                        continue;
                    }

                    foreach ($projects as $project) {
                        DB::table('proposal_project_references')->updateOrInsert(
                            ['proposal_contract_review_project_id' => $project->id],
                            [
                                'proposal_contract_review_id' => $review->id,
                                'proposal_number' => $project->proposal_number ?: $review->proposal_number,
                                'project_number' => $project->project_no ?: $project->mt_project_no,
                                'project_name' => $project->project_name ?: $review->project_name,
                                'status' => $project->status ?: ($review->status ?: 'active'),
                                'metadata' => json_encode(['source' => 'proposal_contract_review_project'], JSON_UNESCAPED_UNICODE),
                                'created_at' => $project->created_at,
                                'updated_at' => now(),
                                'deleted_at' => null,
                            ]
                        );
                    }
                }
            });
    }

    public function down()
    {
        Schema::dropIfExists('proposal_project_references');
    }
}
