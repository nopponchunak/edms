<?php

namespace App\Http\Controllers;

use App\Models\Upload;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Maatwebsite\Excel\Facades\Excel;
use Illuminate\Http\Request;
use App\Models\Clients;
use App\Exports\ProductExport;
use App\Models\CategoryProduct;
use App\Models\Channel;
use App\Models\Floor;
use App\Models\ProductImages;
use App\Models\Products;
use App\Models\Promotion;
use App\Models\Shelf;
use App\Models\SubCategoryProduct;
use App\Models\Area;
use App\Models\ProductRaw;
use App\Models\ProductUnit;
use App\Models\StockTransLine;
use App\Models\Supplier;
use Carbon\Carbon;
use Haruncpi\LaravelIdGenerator\IdGenerator;


class UploadController extends Controller
{
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */
    public function index()
    {
        //
    }

    /**
     * Show the form for creating a new resource.
     *
     * @return \Illuminate\Http\Response
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\Response
     */
    public function store(Request $request)
    {
        //
    }

    /**
     * Display the specified resource.
     *
     * @param  \App\Models\Upload  $upload
     * @return \Illuminate\Http\Response
     */
    public function show(Upload $upload)
    {
        //
    }

    /**
     * Show the form for editing the specified resource.
     *
     * @param  \App\Models\Upload  $upload
     * @return \Illuminate\Http\Response
     */
    public function edit(Upload $upload)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \App\Models\Upload  $upload
     * @return \Illuminate\Http\Response
     */
    public function update(Request $request, Upload $upload)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     *
     * @param  \App\Models\Upload  $upload
     * @return \Illuminate\Http\Response
     */
    public function destroy(Upload $upload)
    {
        //
    }

    public function uploadFile(Request $request)
    {

        try {

            if ($request->hasFile('file')) {

                $files = $request->file('file');
                $filePath = $request->file_path;
                $fileName = $request->file_name;

                $path_files = [];

                $destinationPath = public_path('files');

                $objScan = scandir($destinationPath);

                $file = $files;
                $filename = $file->getClientOriginalName();

                $str_filename = explode('.', $filename);
                $filetype = $str_filename[1];

                $dt = date("Y-m-d H:i:s");
                $key_gen = "$dt" . '_' . $fileName . "";
                $name = md5(uniqid($key_gen, true)) . '.' . "$filetype";

                $file->move($destinationPath . '/' . $filePath, $name);
                $path_files['name'] = $fileName;
                $path_files['path'] = $name;

                return $this->returnSuccess('Upload file successfully', $path_files);
            } else {

                return $this->returnErrorData('File Not Found', 404);
            }
        } catch (\Throwable $e) {

            return $this->returnErrorData('Something went wrong Please try again ', 404);
        }
    }

    public function uploadClient(Request $request)
    {
        try {
            if (!$request->hasFile('file')) {
                return $this->returnErrorData('ไม่พบไฟล์ที่อัปโหลด', 400);
            }

            $file = $request->file('file');

            // อ่านไฟล์ Excel (รองรับ .xls, .xlsx, .csv)
            $data = Excel::toArray([], $file);

            $rows = $data[0]; // เฉพาะ sheet แรก
            $header = array_map('strtolower', $rows[0]);
            unset($rows[0]); // ลบ header ออก

            $inserted = 0;

            foreach ($rows as $index => $row) {
                $clientData = array_combine($header, $row);

                $validator = Validator::make($clientData, [
                    'name' => 'required|string',
                    'phone' => 'nullable|string|max:100',
                    'email' => 'nullable|email|max:200',
                    'address' => 'nullable|string',
                    'sale_owner_id' => 'nullable|numeric',
                ]);

                if ($validator->fails()) {
                    continue; // ข้ามแถวที่ข้อมูลไม่ถูกต้อง
                }

                $prefix = "#C-";
                $id = IdGenerator::generate(['table' => 'clients', 'field' => 'code', 'length' => 9, 'prefix' => $prefix]);
    

                Clients::create([
                    'code' => $id,
                    'name' => $clientData['name'],
                    'phone' => $clientData['phone'] ?? null,
                    'email' => $clientData['email'] ?? null,
                    'address' => $clientData['address'] ?? null,
                    'sale_owner_id' => $clientData['sale_owner_id'] ?? null,
                    'create_by' => $request->user()->id ?? 'import',
                ]);

                $inserted++;
            }

            return $this->returnSuccess("นำเข้าสำเร็จจำนวน $inserted รายการ", []);
        } catch (\Throwable $e) {
            return $this->returnErrorData("เกิดข้อผิดพลาด: " . $e->getMessage(), 500);
        }
    }

    public function uploadProduct(Request $request)
    {
        DB::beginTransaction();
        
        try {
            if (!$request->hasFile('file')) {
                return $this->returnErrorData('ไม่พบไฟล์ที่อัปโหลด', 400);
            }

            $file = $request->file('file');
            $data = Excel::toArray([], $file);
            $rows = $data[0];
            $header = array_map('strtolower', $rows[0]);
            unset($rows[0]);

            $inserted = 0;
            $errors = [];

            foreach ($rows as $rowIndex => $row) {
                try {
                    $productData = array_combine($header, $row);

                    // Validate required fields
                    if (!isset($productData['name']) || !isset($productData['category_product_id']) || !isset($productData['sub_category_product_id'])) {
                        $errors[] = "แถวที่ " . ($rowIndex + 1) . ": ข้อมูลไม่ครบถ้วน";
                        continue;
                    }

                    // Check category existence
                    $check1 = CategoryProduct::find($productData['category_product_id']);
                    $check2 = SubCategoryProduct::find($productData['sub_category_product_id']);

                    if (!$check1) {
                        $errors[] = "แถวที่ " . ($rowIndex + 1) . ": ไม่พบประเภทสินค้าในระบบ";
                        continue;
                    }

                    if (!$check2) {
                        $errors[] = "แถวที่ " . ($rowIndex + 1) . ": ไม่พบประเภทสินค้าย่อยในระบบ";
                        continue;
                    }

                    // Generate product code
                    // $prefix = "#{$check1->prefix}-{$check2->prefix}-";
                    // $code = IdGenerator::generate([
                    //     'table' => 'products',
                    //     'field' => 'code',
                    //     'length' => 13,
                    //     'prefix' => $prefix
                    // ]);

                    // Create product
                    $product = new Products();
                    // $product->code = $code;
                    $product->category_product_id = $productData['category_product_id'];
                    $product->sub_category_product_id = $productData['sub_category_product_id'];
                    $product->name = $productData['name'];
                    $product->detail = $productData['detail'] ?? null;
                    $product->qty = isset($productData['qty']) && $productData['qty'] !== "null" ? $productData['qty'] : 0;
                    $product->sale_price = isset($productData['sale_price']) && $productData['sale_price'] !== "null" ? $productData['sale_price'] : 0;
                    $product->cost = isset($productData['cost']) && $productData['cost'] !== "null" ? $productData['cost'] : 0;
                    $product->type = isset($productData['type']) && $productData['type'] !== "null" ? $productData['type'] : 'Good';
                    $product->min = isset($productData['min']) && $productData['min'] !== "null" ? $productData['min'] : 0;
                    $product->max = isset($productData['max']) && $productData['max'] !== "null" ? $productData['max'] : 0;
                    $product->supplier_id = $productData['supplier_id'] ?? null;
                    $product->stock_status = 0;
                    $product->more_address = $productData['more_address'] ?? null;
                    $product->save();

                     // สร้างรหัสตาม ID ที่ได้
                    $prefix = "#{$check1->prefix}-{$check2->prefix}-";
                    $idPart = str_pad($product->id, 4, '0', STR_PAD_LEFT); // กำหนดให้เป็น 4 หลักเสมอ
                    $code = $prefix . $idPart;
                    
                    // อัปเดตรหัสที่สร้างแล้ว
                    $product->code = $code;
                    $product->save();

                    // Handle product units if provided
                    if (isset($productData['units']) && is_array($productData['units'])) {
                        foreach ($productData['units'] as $unitData) {
                            $productUnit = new ProductUnit();
                            $productUnit->product_id = $product->id;
                            $productUnit->area_id = $unitData['area_id'] ?? null;
                            $productUnit->shelve_id = $unitData['shelve_id'] ?? null;
                            $productUnit->floor_id = $unitData['floor_id'] ?? null;
                            $productUnit->channel_id = $unitData['channel_id'] ?? null;
                            $productUnit->qty = $unitData['qty'] ?? 0;
                            $productUnit->unit_id = $unitData['unit_id'] ?? null;
                            $productUnit->save();
                        }
                    }

                    // Log the creation
                    $userId = "admin";
                    $type = 'เพิ่มรายการผ่านอัปโหลด';
                    $description = 'ผู้ใช้งาน ' . $userId . ' ได้ทำการ ' . $type . ' ' . $productData['name'];
                    $this->Log($userId, $description, $type);

                    $inserted++;
                } catch (\Exception $e) {
                    $errors[] = "แถวที่ " . ($rowIndex + 1) . ": " . $e->getMessage();
                    continue;
                }
            }

            DB::commit();

            $response = [
                'success_count' => $inserted,
                'error_count' => count($errors),
                'errors' => $errors
            ];

            if ($inserted > 0) {
                return $this->returnSuccess("นำเข้าสินค้าสำเร็จจำนวน $inserted รายการ", $response);
            } else {
                return $this->returnErrorData("ไม่สามารถนำเข้าสินค้าได้: " . implode(", ", $errors), 400);
            }
        } catch (\Throwable $e) {
            DB::rollback();
            return $this->returnErrorData("เกิดข้อผิดพลาด: " . $e->getMessage(), 500);
        }
    }
}
