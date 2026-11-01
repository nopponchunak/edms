<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('project_review_discussion_topics')) {
            return;
        }

        if (Schema::hasColumn('project_review_discussion_topics', 'concept_design_review_id')) {
            // Backfill shared columns from the legacy concept-only column before dropping it.
            DB::statement("
                UPDATE project_review_discussion_topics
                SET review_type = COALESCE(NULLIF(review_type, ''), 'concept_design_review'),
                    review_id = COALESCE(review_id, concept_design_review_id)
                WHERE concept_design_review_id IS NOT NULL
            ");

            DB::statement("
                ALTER TABLE project_review_discussion_topics
                DROP COLUMN concept_design_review_id
            ");
        }
    }

    public function down()
    {
        // Intentionally left non-reversible. Re-adding a dropped legacy column would
        // be misleading and may corrupt the shared discussion schema.
    }
};
