<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateProposalContractReviewApprovalsTable extends Migration
{
    public function up()
    {
        Schema::create('proposal_contract_review_approvals', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('proposal_contract_review_id');
            $table->string('stage', 30);
            $table->string('approver_code', 100);
            $table->string('approver_name', 255)->nullable();
            $table->string('approver_email', 255)->nullable();
            $table->string('role', 30);
            $table->unsignedTinyInteger('sequence');
            $table->string('decision', 30)->default('pending');
            $table->decimal('win_probability', 5, 2)->nullable();
            $table->text('comment')->nullable();
            $table->dateTime('acted_at')->nullable();
            $table->string('create_by', 100)->nullable();
            $table->string('update_by', 100)->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('proposal_contract_review_id', 'pcr_approvals_review_id_foreign')
                ->references('id')
                ->on('postman_proposal_contract_reviews')
                ->onDelete('cascade');

            $table->unique([
                'proposal_contract_review_id',
                'stage',
                'approver_code',
            ], 'pcr_approvals_stage_approver_unique');

            $table->index(['stage', 'approver_code', 'decision'], 'pcr_approvals_action_idx');
        });
    }

    public function down()
    {
        Schema::dropIfExists('proposal_contract_review_approvals');
    }
}
