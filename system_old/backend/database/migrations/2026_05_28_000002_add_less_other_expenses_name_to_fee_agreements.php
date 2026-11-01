<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fee_agreements', function (Blueprint $table) {
            if (! Schema::hasColumn('fee_agreements', 'less_other_expenses_name')) {
                $table->string('less_other_expenses_name')->nullable()->after('less_subconsultants_number');
            }
        });
    }

    public function down(): void
    {
        Schema::table('fee_agreements', function (Blueprint $table) {
            if (Schema::hasColumn('fee_agreements', 'less_other_expenses_name')) {
                $table->dropColumn('less_other_expenses_name');
            }
        });
    }
};
