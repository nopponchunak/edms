<?php

namespace App\Imports;

use App\Models\ProductUnit;
use App\Models\StockTransLine;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;

class ProductImport implements ToCollection
{
    protected $stockTransId;
    protected $createBy;

    public function __construct($stockTransId, $createBy = 'system')
    {
        $this->stockTransId = $stockTransId;
        $this->createBy = $createBy;
    }

    public function collection(Collection $rows)
    {
        foreach ($rows as $index => $row) {
            if ($index === 0) continue; // skip header

            $productId = $row[0];
            $unitId = $row[1];
            $qty = $row[2];

            // เพิ่ม stock_trans_line
            StockTransLine::create([
                'inout_id' => $this->stockTransId,
                'product_id' => $productId,
                'unit_id' => $unitId,
                'qty' => $qty,
                'status' => 'Y',
                'create_by' => $this->createBy
            ]);

            // เพิ่ม/อัปเดตใน product_units
            $unit = ProductUnit::where('product_id', $productId)
                               ->where('unit_id', $unitId)
                               ->first();

            if ($unit) {
                $unit->qty += $qty;
                $unit->save();
            } else {
                ProductUnit::create([
                    'product_id' => $productId,
                    'unit_id' => $unitId,
                    'qty' => $qty,
                    'create_by' => $this->createBy
                ]);
            }
        }
    }
}
