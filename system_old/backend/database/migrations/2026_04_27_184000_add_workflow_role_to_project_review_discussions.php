<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (Schema::hasTable('project_review_discussion_topics')) {
            Schema::table('project_review_discussion_topics', function (Blueprint $table) {
                if (! Schema::hasColumn('project_review_discussion_topics', 'workflow_role')) {
                    $table->string('workflow_role', 100)->nullable()->after('author_role');
                }
            });
        }

        if (Schema::hasTable('project_review_discussion_replies')) {
            Schema::table('project_review_discussion_replies', function (Blueprint $table) {
                if (! Schema::hasColumn('project_review_discussion_replies', 'workflow_role')) {
                    $table->string('workflow_role', 100)->nullable()->after('author_role');
                }
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('project_review_discussion_topics')) {
            Schema::table('project_review_discussion_topics', function (Blueprint $table) {
                if (Schema::hasColumn('project_review_discussion_topics', 'workflow_role')) {
                    $table->dropColumn('workflow_role');
                }
            });
        }

        if (Schema::hasTable('project_review_discussion_replies')) {
            Schema::table('project_review_discussion_replies', function (Blueprint $table) {
                if (Schema::hasColumn('project_review_discussion_replies', 'workflow_role')) {
                    $table->dropColumn('workflow_role');
                }
            });
        }
    }
};
