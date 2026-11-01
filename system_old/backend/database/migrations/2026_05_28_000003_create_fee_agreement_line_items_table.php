<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('fee_agreement_line_items')) {
            return;
        }

        Schema::create('fee_agreement_line_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fee_agreement_id')->constrained('fee_agreements')->cascadeOnDelete();
            $table->string('category', 40);
            $table->string('name')->nullable();
            $table->decimal('amount', 15, 2)->default(0);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['fee_agreement_id', 'category', 'sort_order'], 'fee_agreement_items_lookup_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fee_agreement_line_items');
    }
};
