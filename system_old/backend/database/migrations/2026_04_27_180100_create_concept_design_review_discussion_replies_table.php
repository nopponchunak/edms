<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('project_review_discussion_replies', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('topic_id');
            $table->string('author_code', 100)->nullable();
            $table->string('author_name', 255)->nullable();
            $table->string('author_role', 50)->default('team');
            $table->longText('message');
            $table->longText('attachments')->nullable();
            $table->string('create_by', 100)->nullable();
            $table->string('update_by', 100)->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('topic_id', 'cdr_discussion_replies_topic_idx');
        });
    }

    public function down()
    {
        Schema::dropIfExists('project_review_discussion_replies');
    }
};
