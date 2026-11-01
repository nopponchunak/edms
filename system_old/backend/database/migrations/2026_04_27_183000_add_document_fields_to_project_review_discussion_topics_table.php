<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('project_review_discussion_topics')) {
            return;
        }

        Schema::table('project_review_discussion_topics', function (Blueprint $table) {
            if (! Schema::hasColumn('project_review_discussion_topics', 'document_key')) {
                $table->string('document_key', 150)->nullable()->after('review_id');
            }

            if (! Schema::hasColumn('project_review_discussion_topics', 'document_label')) {
                $table->string('document_label', 255)->nullable()->after('document_key');
            }
        });
    }

    public function down()
    {
        if (! Schema::hasTable('project_review_discussion_topics')) {
            return;
        }

        Schema::table('project_review_discussion_topics', function (Blueprint $table) {
            $columns = [];

            if (Schema::hasColumn('project_review_discussion_topics', 'document_key')) {
                $columns[] = 'document_key';
            }

            if (Schema::hasColumn('project_review_discussion_topics', 'document_label')) {
                $columns[] = 'document_label';
            }

            if (! empty($columns)) {
                $table->dropColumn($columns);
            }
        });
    }
};
