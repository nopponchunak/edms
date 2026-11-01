<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateLegacyDesignReviewMigrationTables extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('legacy_design_review_sync_records')) {
            Schema::create('legacy_design_review_sync_records', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('source_system', 50);
                $table->string('source_database', 100);
                $table->string('source_stage', 100);
                $table->string('source_table', 100);
                $table->string('source_id', 100);
                $table->string('project_no', 100)->nullable();
                $table->string('project_name', 255)->nullable();
                $table->string('discipline', 255)->nullable();
                $table->integer('legacy_status_code')->nullable();
                $table->string('legacy_status_label', 100)->nullable();
                $table->string('target_module', 100)->nullable();
                $table->string('target_table', 100)->nullable();
                $table->string('target_route', 150)->nullable();
                $table->string('sync_status', 50)->default('synced');
                $table->string('user_mapping_status', 50)->default('pending');
                $table->string('generate_status', 50)->default('pending');
                $table->unsignedBigInteger('generated_id')->nullable();
                $table->string('generated_table', 100)->nullable();
                $table->json('raw_payload')->nullable();
                $table->json('mapped_payload')->nullable();
                $table->timestamp('synced_at')->nullable();
                $table->timestamp('generated_at')->nullable();
                $table->timestamps();

                $table->unique(['source_database', 'source_table', 'source_id'], 'legacy_dr_sync_source_unique');
                $table->index(['source_stage', 'target_module'], 'legacy_dr_sync_stage_module_idx');
                $table->index(['generate_status', 'user_mapping_status'], 'legacy_dr_sync_status_idx');
            });
        }

        if (! Schema::hasTable('legacy_design_review_user_mappings')) {
            Schema::create('legacy_design_review_user_mappings', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('source_database', 100);
                $table->integer('legacy_user_id');
                $table->string('legacy_username', 100)->nullable();
                $table->string('legacy_fullname', 255)->nullable();
                $table->string('legacy_email', 255)->nullable();
                $table->string('normalized_email', 255)->nullable();
                $table->unsignedInteger('employee_id')->nullable();
                $table->string('employee_code', 100)->nullable();
                $table->string('employee_name', 255)->nullable();
                $table->string('employee_email', 255)->nullable();
                $table->string('mapping_status', 50)->default('unmatched');
                $table->string('match_method', 50)->nullable();
                $table->integer('match_count')->default(0);
                $table->integer('usage_count')->default(0);
                $table->timestamp('verified_at')->nullable();
                $table->timestamps();

                $table->unique(['source_database', 'legacy_user_id'], 'legacy_dr_user_source_unique');
                $table->index(['mapping_status', 'normalized_email'], 'legacy_dr_user_status_email_idx');
                $table->index('employee_code', 'legacy_dr_user_employee_code_idx');
            });
        }
    }

    public function down()
    {
        Schema::dropIfExists('legacy_design_review_user_mappings');
        Schema::dropIfExists('legacy_design_review_sync_records');
    }
}
