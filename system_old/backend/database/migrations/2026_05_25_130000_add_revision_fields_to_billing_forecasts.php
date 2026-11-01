<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('billing_forecasts', function (Blueprint $table) {
            if (!Schema::hasColumn('billing_forecasts', 'revision_no')) {
                $table->integer('revision_no')->default(0)->after('revision_id');
            }
            if (!Schema::hasColumn('billing_forecasts', 'revision_label')) {
                $table->string('revision_label')->nullable()->after('revision_no');
            }
        });

        // Set default revision_label for existing rows
        DB::table('billing_forecasts')
            ->whereNull('revision_label')
            ->update(['revision_label' => 'Original', 'revision_no' => 0]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('billing_forecasts', function (Blueprint $table) {
            if (Schema::hasColumn('billing_forecasts', 'revision_no')) {
                $table->dropColumn('revision_no');
            }
            if (Schema::hasColumn('billing_forecasts', 'revision_label')) {
                $table->dropColumn('revision_label');
            }
        });
    }
};
