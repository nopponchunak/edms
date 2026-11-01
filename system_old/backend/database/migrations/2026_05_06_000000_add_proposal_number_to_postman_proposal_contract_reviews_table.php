<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddProposalNumberToPostmanProposalContractReviewsTable extends Migration
{
    public function up()
    {
        if (! Schema::hasColumn('postman_proposal_contract_reviews', 'proposal_number')) {
            Schema::table('postman_proposal_contract_reviews', function (Blueprint $table) {
                $table->string('proposal_number', 100)->nullable()->after('project_no');
            });
        }
    }

    public function down()
    {
        if (Schema::hasColumn('postman_proposal_contract_reviews', 'proposal_number')) {
            Schema::table('postman_proposal_contract_reviews', function (Blueprint $table) {
                $table->dropColumn('proposal_number');
            });
        }
    }
}
