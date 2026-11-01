<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const TABLES = ['charitable_contributions', 'gift_hospitalities', 'gift_hospitality_offerings'];

    public function up(): void
    {
        foreach (self::TABLES as $tableName) {
            if (!Schema::hasTable($tableName)) {
                continue;
            }
            $missingColumns = array_filter(
                ['ims_acknowledged_by', 'ims_acknowledged_by_status', 'ims_acknowledged_by_date'],
                fn (string $column) => !Schema::hasColumn($tableName, $column)
            );
            if ($missingColumns === []) {
                continue;
            }
            Schema::table($tableName, function (Blueprint $table) use ($missingColumns): void {
                foreach ($missingColumns as $column) {
                    if ($column === 'ims_acknowledged_by_date') {
                        $table->dateTime($column)->nullable();
                    } else {
                        $table->string($column)->nullable();
                    }
                }
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $tableName) {
            if (!Schema::hasTable($tableName)) {
                continue;
            }
            $existingColumns = array_values(array_filter(
                ['ims_acknowledged_by', 'ims_acknowledged_by_status', 'ims_acknowledged_by_date'],
                fn (string $column) => Schema::hasColumn($tableName, $column)
            ));
            if ($existingColumns === []) {
                continue;
            }
            Schema::table($tableName, function (Blueprint $table) use ($existingColumns): void {
                $table->dropColumn($existingColumns);
            });
        }
    }
};
