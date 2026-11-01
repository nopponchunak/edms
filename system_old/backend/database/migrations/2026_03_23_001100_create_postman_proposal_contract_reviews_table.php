<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreatePostmanProposalContractReviewsTable extends Migration
{
    public function up()
    {
        Schema::create('postman_proposal_contract_reviews', function (Blueprint $table) {
            $table->increments('id');
            $table->string('project_name', 255)->nullable();
            $table->string('project_no', 100)->nullable();
            $table->string('proposal_number', 100)->nullable();
            $table->string('client_name', 255)->nullable();
            $table->string('city', 100)->nullable();
            $table->string('country', 100)->nullable();
            $table->string('filled_in_by', 100)->nullable();
            $table->string('proposal_to_be_submitted', 50)->nullable();
            $table->string('contract_agreed_to_proceed', 50)->nullable();
            $table->string('status', 50)->nullable()->default('submitted');
            $table->longText('payload');
            $table->string('create_by', 100)->nullable();
            $table->string('update_by', 100)->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down()
    {
        Schema::dropIfExists('postman_proposal_contract_reviews');
    }
}
