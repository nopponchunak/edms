<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('project_review_discussion_topics', function (Blueprint $table) {
            $table->increments('id');
            $table->string('review_type', 100);
            $table->unsignedInteger('review_id');
            $table->unsignedInteger('topic_no')->default(1);
            $table->string('author_code', 100)->nullable();
            $table->string('author_name', 255)->nullable();
            $table->string('author_role', 50)->default('reviewer');
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
    }

    public function down()
    {
        Schema::dropIfExists('project_review_discussion_topics');
    }
};
