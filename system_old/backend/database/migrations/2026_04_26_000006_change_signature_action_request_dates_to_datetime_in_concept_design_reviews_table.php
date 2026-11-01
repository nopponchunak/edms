<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ChangeSignatureActionRequestDatesToDatetimeInConceptDesignReviewsTable extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('concept_design_reviews')) {
            return;
        }

        DB::statement('ALTER TABLE concept_design_reviews MODIFY reviewed_by_date DATETIME NULL');
        DB::statement('ALTER TABLE concept_design_reviews MODIFY responded_by_date DATETIME NULL');
        DB::statement('ALTER TABLE concept_design_reviews MODIFY signed_by_tl_date DATETIME NULL');
        DB::statement('ALTER TABLE concept_design_reviews MODIFY signed_by_tl2_date DATETIME NULL');
        DB::statement('ALTER TABLE concept_design_reviews MODIFY acknowledged_by_date DATETIME NULL');
    }

    public function down()
    {
        if (!Schema::hasTable('concept_design_reviews')) {
            return;
        }

        DB::statement('ALTER TABLE concept_design_reviews MODIFY reviewed_by_date DATE NULL');
        DB::statement('ALTER TABLE concept_design_reviews MODIFY responded_by_date DATE NULL');
        DB::statement('ALTER TABLE concept_design_reviews MODIFY signed_by_tl_date DATE NULL');
        DB::statement('ALTER TABLE concept_design_reviews MODIFY signed_by_tl2_date DATE NULL');
        DB::statement('ALTER TABLE concept_design_reviews MODIFY acknowledged_by_date DATE NULL');
    }
}
