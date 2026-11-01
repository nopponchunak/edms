<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const TABLES = [
        'tender_csa_reviews',
        'tender_csa_verifications',
        'tender_mep_reviews',
        'tender_mep_verifications',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $tableName) {
            if (Schema::hasTable($tableName)) {
                continue;
            }

            Schema::create($tableName, function (Blueprint $table) {
                $table->increments('id');
                $table->string('form_type', 100)->nullable();
                $table->string('project_id', 50)->nullable();
                $table->string('project_name', 255)->nullable();
                $table->string('project_number', 100)->nullable();
                $table->string('prepared_by', 255)->nullable();
                $table->string('department', 255)->nullable();
                $table->string('discipline', 255)->nullable();
                $table->text('document_location')->nullable();
                $table->string('review_method', 50)->nullable();

                // Signature / action-request fields
                $table->string('reviewed_by', 255)->nullable();
                $table->dateTime('reviewed_by_date')->nullable();
                $table->string('reviewed_by_status', 50)->nullable();

                $table->string('responded_by', 255)->nullable();
                $table->dateTime('responded_by_date')->nullable();
                $table->string('responded_by_status', 50)->nullable()->default('pending');

                $table->string('signed_by_vve', 255)->nullable();
                $table->dateTime('signed_by_vve_date')->nullable();
                $table->string('signed_by_vve_status', 50)->nullable()->default('pending');

                $table->string('signed_by_tl', 255)->nullable();
                $table->dateTime('signed_by_tl_date')->nullable();
                $table->string('signed_by_tl_status', 50)->nullable()->default('pending');

                $table->string('acknowledged_by', 255)->nullable();
                $table->dateTime('acknowledged_by_date')->nullable();
                $table->string('acknowledged_by_status', 50)->nullable()->default('pending');

                $table->string('status', 50)->nullable()->default('submitted');
                $table->longText('payload');
                $table->string('create_by', 100)->nullable();
                $table->string('update_by', 100)->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }
    }

    public function down(): void
    {
        foreach (array_reverse(self::TABLES) as $tableName) {
            Schema::dropIfExists($tableName);
        }
    }
};
