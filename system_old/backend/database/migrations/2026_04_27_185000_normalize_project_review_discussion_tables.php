<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private string $oldTopicsTable = 'concept_design_review_discussion_topics';
    private string $oldRepliesTable = 'concept_design_review_discussion_replies';
    private string $newTopicsTable = 'project_review_discussion_topics';
    private string $newRepliesTable = 'project_review_discussion_replies';

    public function up()
    {
        $this->normalizeTopicsTable();
        $this->normalizeRepliesTable();
    }

    public function down()
    {
        // Keep this migration non-destructive on rollback because it may have
        // renamed legacy tables that could contain production data.
    }

    private function normalizeTopicsTable(): void
    {
        if (Schema::hasTable($this->oldTopicsTable) && ! Schema::hasTable($this->newTopicsTable)) {
            Schema::rename($this->oldTopicsTable, $this->newTopicsTable);
        }

        if (! Schema::hasTable($this->newTopicsTable)) {
            Schema::create($this->newTopicsTable, function (Blueprint $table) {
                $table->increments('id');
                $table->string('review_type', 100);
                $table->unsignedInteger('review_id');
                $table->string('document_key', 150)->nullable();
                $table->string('document_label', 255)->nullable();
                $table->unsignedInteger('topic_no')->default(1);
                $table->string('author_code', 100)->nullable();
                $table->string('author_name', 255)->nullable();
                $table->string('author_role', 50)->default('reviewer');
                $table->string('workflow_role', 100)->nullable();
                $table->longText('message');
                $table->string('status', 50)->default('open');
                $table->longText('attachments')->nullable();
                $table->string('create_by', 100)->nullable();
                $table->string('update_by', 100)->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->index(['review_type', 'review_id'], 'pr_discussion_topics_review_idx');
                $table->index('topic_no', 'cdr_discussion_topics_no_idx');
            });

            return;
        }

        Schema::table($this->newTopicsTable, function (Blueprint $table) {
            if (! Schema::hasColumn($this->newTopicsTable, 'review_type')) {
                $table->string('review_type', 100)->nullable()->after('id');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'review_id')) {
                $table->unsignedInteger('review_id')->nullable()->after('review_type');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'document_key')) {
                $table->string('document_key', 150)->nullable()->after('review_id');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'document_label')) {
                $table->string('document_label', 255)->nullable()->after('document_key');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'topic_no')) {
                $table->unsignedInteger('topic_no')->default(1)->after('document_label');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'author_code')) {
                $table->string('author_code', 100)->nullable()->after('topic_no');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'author_name')) {
                $table->string('author_name', 255)->nullable()->after('author_code');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'author_role')) {
                $table->string('author_role', 50)->default('reviewer')->after('author_name');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'workflow_role')) {
                $table->string('workflow_role', 100)->nullable()->after('author_role');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'message')) {
                $table->longText('message')->nullable()->after('workflow_role');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'status')) {
                $table->string('status', 50)->default('open')->after('message');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'attachments')) {
                $table->longText('attachments')->nullable()->after('status');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'create_by')) {
                $table->string('create_by', 100)->nullable()->after('attachments');
            }

            if (! Schema::hasColumn($this->newTopicsTable, 'update_by')) {
                $table->string('update_by', 100)->nullable()->after('create_by');
            }
        });
    }

    private function normalizeRepliesTable(): void
    {
        if (Schema::hasTable($this->oldRepliesTable) && ! Schema::hasTable($this->newRepliesTable)) {
            Schema::rename($this->oldRepliesTable, $this->newRepliesTable);
        }

        if (! Schema::hasTable($this->newRepliesTable)) {
            Schema::create($this->newRepliesTable, function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('topic_id');
                $table->string('author_code', 100)->nullable();
                $table->string('author_name', 255)->nullable();
                $table->string('author_role', 50)->default('team');
                $table->string('workflow_role', 100)->nullable();
                $table->longText('message');
                $table->longText('attachments')->nullable();
                $table->string('create_by', 100)->nullable();
                $table->string('update_by', 100)->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->index('topic_id', 'cdr_discussion_replies_topic_idx');
            });

            return;
        }

        Schema::table($this->newRepliesTable, function (Blueprint $table) {
            if (! Schema::hasColumn($this->newRepliesTable, 'topic_id')) {
                $table->unsignedInteger('topic_id')->nullable()->after('id');
            }

            if (! Schema::hasColumn($this->newRepliesTable, 'author_code')) {
                $table->string('author_code', 100)->nullable()->after('topic_id');
            }

            if (! Schema::hasColumn($this->newRepliesTable, 'author_name')) {
                $table->string('author_name', 255)->nullable()->after('author_code');
            }

            if (! Schema::hasColumn($this->newRepliesTable, 'author_role')) {
                $table->string('author_role', 50)->default('team')->after('author_name');
            }

            if (! Schema::hasColumn($this->newRepliesTable, 'workflow_role')) {
                $table->string('workflow_role', 100)->nullable()->after('author_role');
            }

            if (! Schema::hasColumn($this->newRepliesTable, 'message')) {
                $table->longText('message')->nullable()->after('workflow_role');
            }

            if (! Schema::hasColumn($this->newRepliesTable, 'attachments')) {
                $table->longText('attachments')->nullable()->after('message');
            }

            if (! Schema::hasColumn($this->newRepliesTable, 'create_by')) {
                $table->string('create_by', 100)->nullable()->after('attachments');
            }

            if (! Schema::hasColumn($this->newRepliesTable, 'update_by')) {
                $table->string('update_by', 100)->nullable()->after('create_by');
            }
        });
    }
};
