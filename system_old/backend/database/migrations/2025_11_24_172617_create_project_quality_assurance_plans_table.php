<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateProjectQualityAssurancePlansTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('project_quality_assurance_plans', function (Blueprint $table) {
            $table->increments('id');

            // ===== Header Information =====
            $table->string('revision', 50)->charset('utf8');              // Revision*
            $table->date('date');                                         // Date*
            $table->string('prepared_by_tl', 255)->charset('utf8');       // Prepared By (TL)*
            $table->string('approved_by_di', 255)->charset('utf8');       // Approved By (DI)*
            $table->string('acknowledged_by_vve', 255)->charset('utf8');  // Acknowledged by (VVE/Reviewer)*

            // ===== A. Project Details =====
            $table->string('project_name', 255)->charset('utf8');         // Project Name*
            $table->string('project_no', 100)->charset('utf8');           // Project No.*

            // ===== B. Scope of Services (checkboxes) =====
            $table->boolean('scope_cs')->nullable();            // C&S
            $table->boolean('scope_me')->nullable();            // M&E
            $table->boolean('scope_leed_esd')->nullable();      // LEED/ESD
            $table->boolean('scope_facade')->nullable();        // Facade
            $table->boolean('scope_lighting')->nullable();      // Lighting
            $table->boolean('scope_pm')->nullable();            // PM
            $table->boolean('scope_cm')->nullable();            // CM
            $table->boolean('scope_transport')->nullable();     // Transportation
            $table->boolean('scope_geotechnical')->nullable();  // Geotechnical
            $table->boolean('scope_qs')->nullable();            // QS
            $table->boolean('scope_engineering_audit')->nullable(); // Engineering Audit
            $table->boolean('scope_others_flag')->nullable();   // Others (เลือก)
            $table->string('scope_others_text', 255)->charset('utf8')->nullable(); // Others (รายละเอียด)

            // ===== C. Project Team & Coordinator =====
            // Project Team
            $table->string('team_di', 255)->charset('utf8')->nullable();  // DI
            $table->string('team_tl', 255)->charset('utf8')->nullable();  // TL
            $table->string('team_pm', 255)->charset('utf8')->nullable();  // PM
            $table->string('team_cm', 255)->charset('utf8')->nullable();  // CM
            $table->string('team_re', 255)->charset('utf8')->nullable();  // RE

            // Project Coordinator (ตาม discipline)
            $table->string('coord_cs', 255)->charset('utf8')->nullable();        // C&S
            $table->string('coord_facade', 255)->charset('utf8')->nullable();    // Facade
            $table->string('coord_others', 255)->charset('utf8')->nullable();    // Others
            $table->string('coord_me', 255)->charset('utf8')->nullable();        // M&E
            $table->string('coord_lighting', 255)->charset('utf8')->nullable();  // Lighting
            $table->string('coord_leed_esd', 255)->charset('utf8')->nullable();  // LEED/ESD
            $table->string('coord_transport', 255)->charset('utf8')->nullable(); // Transport

            // ===== D. VVE / Reviewer =====
            $table->string('reviewer_cs', 255)->charset('utf8')->nullable();          // C&S
            $table->string('reviewer_mvac', 255)->charset('utf8')->nullable();        // MVAC (M&E)
            $table->string('reviewer_facade', 255)->charset('utf8')->nullable();      // Facade
            $table->string('reviewer_others', 255)->charset('utf8')->nullable();      // Others
            $table->string('reviewer_geotechnical', 255)->charset('utf8')->nullable();// Geotechnical
            $table->string('reviewer_electrical', 255)->charset('utf8')->nullable();  // Electrical
            $table->string('reviewer_lighting', 255)->charset('utf8')->nullable();    // Lighting
            $table->string('reviewer_leed_esd', 255)->charset('utf8')->nullable();    // LEED/ESD
            $table->string('reviewer_sn_fp', 255)->charset('utf8')->nullable();       // SN & FP
            $table->string('reviewer_transport', 255)->charset('utf8')->nullable();   // Transport

            // ===== E. Design Review / Verification / Validation Schedule =====
            // DCR / Design Brief / Conceptual Stage
            $table->boolean('dcr_review')->nullable();
            $table->boolean('dcr_verification')->nullable();
            $table->boolean('dcr_validation')->nullable();

            // Peer Review
            $table->boolean('peer_review_review')->nullable();
            $table->boolean('peer_review_verification')->nullable();
            $table->boolean('peer_review_validation')->nullable();

            // Submission Stage
            $table->boolean('submission_review')->nullable();
            $table->boolean('submission_verification')->nullable();
            $table->boolean('submission_validation')->nullable();

            // Tender Stage
            $table->boolean('tender_review')->nullable();
            $table->boolean('tender_verification')->nullable();
            $table->boolean('tender_validation')->nullable();

            // Construction Stage
            $table->boolean('construction_review')->nullable();
            $table->boolean('construction_verification')->nullable();
            $table->boolean('construction_validation')->nullable();

            // Final Design (for Transportation)
            $table->boolean('final_design_transport_review')->nullable();
            $table->boolean('final_design_transport_verification')->nullable();
            $table->boolean('final_design_transport_validation')->nullable();

            // Engineering Audit / Report
            $table->boolean('engineering_audit_review')->nullable();
            $table->boolean('engineering_audit_verification')->nullable();
            $table->boolean('engineering_audit_validation')->nullable();

            // Construction Stage Documents Validation to be done:
            $table->boolean('validation_before_docs_issued')->nullable();         // Before Documents Issued
            $table->boolean('validation_within_14days_after_docs')->nullable();   // Within 14 Days After Documents Issued

            // ===== Standard fields =====
            $table->string('create_by', 100)->charset('utf8')->nullable();
            $table->string('update_by', 100)->charset('utf8')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('project_quality_assurance_plans');
    }
}
