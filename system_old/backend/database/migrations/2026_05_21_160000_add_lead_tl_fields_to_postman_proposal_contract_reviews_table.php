<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddLeadTlFieldsToPostmanProposalContractReviewsTable extends Migration
{
    public function up(): void
    {
        Schema::table('postman_proposal_contract_reviews', function (Blueprint $table) {
            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'lead_tl')) {
                $table->string('lead_tl', 255)->nullable()->after('contract_decision');
            }

            if (! Schema::hasColumn('postman_proposal_contract_reviews', 'tl_name')) {
                $table->string('tl_name', 255)->nullable()->after('lead_tl');
            }
        });
    }

    public function down(): void
    {
        Schema::table('postman_proposal_contract_reviews', function (Blueprint $table) {
            if (Schema::hasColumn('postman_proposal_contract_reviews', 'tl_name')) {
                $table->dropColumn('tl_name');
            }

            if (Schema::hasColumn('postman_proposal_contract_reviews', 'lead_tl')) {
                $table->dropColumn('lead_tl');
            }
        });
    }
}
