<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class UpdatePqaPlansV2 extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // 1. Create Schedules Table
        Schema::create('project_quality_assurance_plan_schedules', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('project_quality_assurance_plan_id');
            $table->string('item_key', 255)->nullable();
            $table->string('item', 255)->nullable();
            $table->dateTime('proposed_schedule')->nullable();
            $table->boolean('review_required_cs')->default(false);
            $table->boolean('review_required_mep')->default(false);
            $table->string('reviewer_cs', 255)->nullable();
            $table->string('reviewer_mep', 255)->nullable();
            $table->string('initial_cs', 255)->nullable();
            $table->string('initial_mep', 255)->nullable();
            $table->dateTime('review_date')->nullable();
            $table->timestamps();

            $table->foreign('project_quality_assurance_plan_id', 'pqa_schedule_pqa_id_foreign')
                  ->references('id')->on('project_quality_assurance_plans')
                  ->onDelete('cascade');
        });

        // 2. Create Documents Table
        Schema::create('project_quality_assurance_plan_documents', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('project_quality_assurance_plan_id');
            $table->string('document', 255)->nullable();
            $table->string('detail', 255)->nullable();
            $table->boolean('required')->default(false);
            $table->string('completion_stage', 255)->nullable();
            $table->string('responsible_personnel', 255)->nullable();
            $table->timestamps();

            $table->foreign('project_quality_assurance_plan_id', 'pqa_document_pqa_id_foreign')
                  ->references('id')->on('project_quality_assurance_plans')
                  ->onDelete('cascade');
        });

        // 3. Update main table
        Schema::table('project_quality_assurance_plans', function (Blueprint $table) {
            // Add missing columns
            if (!Schema::hasColumn('project_quality_assurance_plans', 'team_bm')) {
                $table->string('team_bm', 255)->nullable()->after('team_pm');
            }
            if (!Schema::hasColumn('project_quality_assurance_plans', 'coord_bco')) {
                $table->string('coord_bco', 255)->nullable()->after('coord_transport');
            }
            if (!Schema::hasColumn('project_quality_assurance_plans', 'status')) {
                $table->string('status', 50)->nullable()->default('draft')->after('validation_within_14days_after_docs');
            }

            // Drop deprecated columns (if they exist)
            $deprecatedColumns = [
                'reviewer_cs', 'reviewer_mvac', 'reviewer_facade', 'reviewer_others',
                'reviewer_geotechnical', 'reviewer_electrical', 'reviewer_lighting',
                'reviewer_leed_esd', 'reviewer_sn_fp', 'reviewer_transport',
                'dcr_review', 'dcr_verification', 'dcr_validation',
                'peer_review_review', 'peer_review_verification', 'peer_review_validation',
                'submission_review', 'submission_verification', 'submission_validation',
                'tender_review', 'tender_verification', 'tender_validation',
                'construction_review', 'construction_verification', 'construction_validation',
                'final_design_transport_review', 'final_design_transport_verification', 'final_design_transport_validation',
                'engineering_audit_review', 'engineering_audit_verification', 'engineering_audit_validation'
            ];

            foreach ($deprecatedColumns as $col) {
                if (Schema::hasColumn('project_quality_assurance_plans', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('project_quality_assurance_plan_documents');
        Schema::dropIfExists('project_quality_assurance_plan_schedules');

        Schema::table('project_quality_assurance_plans', function (Blueprint $table) {
            $table->dropColumn(['team_bm', 'coord_bco', 'status']);
        });
    }
}
