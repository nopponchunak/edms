<?php

namespace App\Imports;

use App\Models\Clients;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Illuminate\Support\Str;

class ClientsImport implements ToCollection
{
    public function collection(Collection $rows)
    {
        foreach ($rows as $index => $row) {
            if ($index < 1) continue; // ข้ามหัวตาราง

            $address = $row[2] ?? '';
            [$house_no, $subdistrict, $district, $province] = $this->extractAddress($address);

            Clients::create([
                'code' => $row[0],
                'name' => $row[1],
                'address' => $address,
                'phone' => $row[3],
                'subdistrict' => $row[4] ?? null,
                'district' => $row[5] ?? null,
                'province' => $row[6] ?? null,
                'note' => $row[7] ?? null,
                'postal_code'  => null, // แนะนำให้ใช้ API เติมภายหลัง
                'create_by'    => auth()->user()->name ?? 'import',
            ]);
        }
    }

    private function extractAddress($address)
    {
        $house_no = null;
        $subdistrict = null;
        $district = null;
        $province = null;

        if (preg_match('/ต\.(.*?)\s/', $address, $matches)) {
            $subdistrict = trim($matches[1]);
        }

        if (preg_match('/อ\.(.*?)\s/', $address, $matches)) {
            $district = trim($matches[1]);
        }

        if (preg_match('/จ\.(.*?)$/', $address, $matches)) {
            $province = trim($matches[1]);
        }

        if (preg_match('/^\s*(\d+\/?\d*)/', $address, $matches)) {
            $house_no = trim($matches[1]);
        }

        return [$house_no, $subdistrict, $district, $province];
    }
}
