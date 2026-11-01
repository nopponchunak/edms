MH E-FORM / EDMS
วิธีติดตั้ง รัน และพัฒนาต่อจาก Source Code
=========================================

แพ็กนี้มี frontend (Angular) และ backend (Laravel API)
ลูกค้าสามารถใช้ source ชุดนี้ติดตั้งและพัฒนาต่อได้ โดยติดตั้ง dependencies
และกำหนดค่าของเครื่องปลายทางตามขั้นตอนด้านล่าง

ไม่มีรหัสผ่านจริง ฐานข้อมูลจริง ไฟล์แนบ และลายเซ็นอยู่ใน ZIP
ไฟล์เหล่านี้ต้องรับแยกจากผู้ดูแลระบบเดิม หากต้องการใช้งานข้อมูลเดิมต่อ

1. เตรียมเครื่องและข้อมูล
-----------------------
ชุดเครื่องมือที่ใช้ตรวจการติดตั้ง/build แพ็กนี้จริง:
  - PHP 8.2.12 และ Composer 2.9.7
  - Node.js 22.17.0 และ npm
  - ฐานข้อมูล MySQL ของระบบที่รับช่วงมา

ให้ Composer ตรวจ PHP extensions ของเครื่องด้วยคำสั่ง:
  composer check-platform-reqs --no-dev
หลังจากติดตั้ง dependencies ของ backend แล้ว

ส่วนที่ต้องเตรียมเพิ่มเติมตามฟังก์ชันที่ใช้:
  - PHP LDAP extension และค่าการเชื่อมต่อ LDAP สำหรับ LDAP login
  - บริการ HRM, SMTP และระบบ Design Review เดิม ตามระบบที่เชื่อมต่ออยู่
  - Chrome/Chromium สำหรับ frontend print PDF และ pdftocairo ของ Poppler
    สำหรับการ normalize/render PDF บางรูปแบบ

สำหรับ Windows ให้แตก ZIP ไปยัง path สั้น เช่น C:\eform
เพื่อหลีกเลี่ยงปัญหาชื่อ path ยาว โครงสร้างหลังแตกควรเป็น:
  C:\eform\README.txt
  C:\eform\backend\
  C:\eform\frontend\

หากใช้งานต่อจากระบบเดิม ให้รับข้อมูลต่อไปนี้จากผู้ดูแลผ่านช่องทางที่ปลอดภัย:
  - Database backup ของ environment ที่จะใช้งาน
  - ค่าตั้งค่า .env และ APP_KEY เดิม
  - ไฟล์ runtime ของระบบเดิม รวม storage/app, ไฟล์แนบ และลายเซ็น
    เช่น public/images/asset และโฟลเดอร์ upload อื่นที่ระบบเดิมใช้อยู่
  - บัญชีผู้ใช้/สิทธิ์ และค่าการเชื่อมต่อบริการที่เกี่ยวข้อง
นำฐานข้อมูลและไฟล์ runtime ไปคืนใน environment ปลายทางก่อนใช้งานข้อมูลเดิม

2. ติดตั้งและรัน Backend บนเครื่องพัฒนา
--------------------------------------
เปิด terminal ที่โฟลเดอร์ backend:
  cd C:\eform\backend
สำหรับ Linux/macOS ให้ใช้ path ที่แตกไฟล์จริงแทน C:\eform

ตรวจให้มีโฟลเดอร์ต่อไปนี้ และให้ process ของ PHP เขียนได้:
  bootstrap/cache
  storage/app/public
  storage/framework/cache/data
  storage/framework/sessions
  storage/framework/views
  storage/logs

Windows PowerShell หากโฟลเดอร์ยังไม่มี:
  New-Item -ItemType Directory -Force -Path bootstrap/cache,storage/app/public,storage/framework/cache/data,storage/framework/sessions,storage/framework/views,storage/logs | Out-Null

Linux/macOS หากโฟลเดอร์ยังไม่มี:
  mkdir -p bootstrap/cache storage/app/public storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs

ติดตั้ง dependencies ตาม composer.lock:
  composer install --no-dev --prefer-dist --no-interaction
  composer check-platform-reqs --no-dev

กรณีรับช่วง environment เดิม ให้ติดตั้ง .env ของ environment นั้นไว้ที่:
  backend/.env
โดยรักษา APP_KEY เดิมไว้ ไม่รัน key:generate ทับ APP_KEY เดิม

กรณียังไม่มี .env ให้สร้างจากตัวอย่าง:
  Windows PowerShell: Copy-Item .env.example .env
  Linux/macOS:       cp .env.example .env

แก้ backend/.env ให้ตรงเครื่องที่จะรัน ตัวอย่างสำหรับพัฒนาในเครื่อง:
  APP_ENV=local
  APP_DEBUG=true
  APP_URL=http://127.0.0.1:8001
  DB_CONNECTION=mysql
  DB_HOST=127.0.0.1
  DB_PORT=3306
  DB_DATABASE=<ชื่อฐานข้อมูลที่ restore แล้ว>
  DB_USERNAME=<ชื่อผู้ใช้ฐานข้อมูล>
  DB_PASSWORD=<รหัสผ่านฐานข้อมูล>
  FRONTEND_URL=http://localhost:4200
  FRONTEND_PRINT_BASE_URL=http://localhost:4200

ใช้ APP_KEY ของข้อมูลเดิมเมื่อย้ายระบบเดิมมารัน
สำหรับ environment ใหม่ที่ไม่มี APP_KEY เดิมและไม่มีข้อมูลเข้ารหัสเดิมเท่านั้น:
  php artisan key:generate

ล้าง cache ของ environment และตรวจเวอร์ชัน:
  php artisan optimize:clear
  php artisan --version

ตรวจสถานะ migration กับฐานข้อมูลที่ตั้งค่าไว้:
  php artisan migrate:status
หากต้องปรับ schema ให้สำรองฐานข้อมูลและตรวจ migration ก่อน แล้วจึงรัน
php artisan migrate ตามแผนติดตั้งของ environment นั้น
อย่าใช้ migrate:fresh กับฐานข้อมูลที่มีข้อมูลใช้งานอยู่
สำหรับการติดตั้งด้วยฐานข้อมูลว่าง ต้องเตรียม schema และข้อมูลเริ่มต้น/สิทธิ์
ให้ครบตามระบบที่จะใช้ การ restore ฐานข้อมูลเดิมคือขั้นตอนสำหรับรับช่วงข้อมูลเดิม

เริ่ม API สำหรับพัฒนาในเครื่อง:
  php artisan serve --host=127.0.0.1 --port=8001
เปิด terminal นี้ค้างไว้ระหว่างพัฒนา
เปิด http://127.0.0.1:8001 เพื่อตรวจว่าตัวเว็บ Laravel เริ่มทำงาน
หน้าเริ่มต้นเปิดได้เป็นการตรวจการเริ่มระบบ ยังไม่ใช่การยืนยันทุก API

3. ติดตั้งและรัน Frontend บนเครื่องพัฒนา
----------------------------------------
เปิด terminal อีกหน้าที่โฟลเดอร์ frontend:
  cd C:\eform\frontend
  npm ci

ใช้ npm ci ตาม package-lock.json และคง frontend/.npmrc ไว้
อย่าตัด devDependencies ก่อน build เพราะมี Angular compiler/build tools ที่จำเป็น

ตรวจ frontend/src/environments/environment.ts ให้ชี้ API ที่รันอยู่:
  apiUrl: 'http://127.0.0.1:8001'
  legacyDesignReviewApiUrl: 'http://127.0.0.1:8001'
ค่าปัจจุบันใน source ใช้ port 8001 ตามคำสั่ง Backend ด้านบน
ถ้าเปลี่ยน host/port ของ API ให้แก้สองค่านี้ให้ตรงกัน
กำหนดเป็น base URL ของ backend โดยไม่เติม /api ต่อท้ายเอง

เริ่ม frontend:
  npm start
เปิด http://localhost:4200 และใช้บัญชี/วิธี login ของ environment ที่เตรียมไว้
เปิด terminal ของ frontend และ backend ค้างไว้พร้อมกัน

ถ้าเปิด frontend จากเครื่องอื่น ต้องใช้ host ที่เครื่องนั้นเข้าถึง backend ได้
แทน 127.0.0.1 และตั้งค่าเว็บเซิร์ฟเวอร์/เครือข่าย/CORS ให้ตรง environment

4. Build และนำขึ้นเว็บเซิร์ฟเวอร์
---------------------------------
Frontend:
  1) แก้ frontend/src/environments/environment.prod.ts
     กำหนด apiUrl และ legacyDesignReviewApiUrl เป็น URL ของ backend ปลายทาง
     URL ที่อยู่ใน source ปัจจุบันคือ https://api-edms.meinhardt.net
  2) ใน frontend รัน:
       npm ci
       npm run build -- --configuration production
  3) นำไฟล์ภายใน frontend/dist/fuse/browser ไปวางที่ document root ของเว็บ
  4) ตั้ง SPA fallback ให้ URL ของแอปที่ไม่ใช่ไฟล์จริงกลับไปที่ index.html
  5) ถ้าเปลี่ยน environment.prod.ts ต้อง build และนำผล build ขึ้นใหม่

Backend:
  1) วาง source backend และติดตั้งด้วย:
       composer install --no-dev --prefer-dist --no-interaction
  2) ตั้ง document root ของเว็บเซิร์ฟเวอร์ไปที่ backend/public
     ไม่ชี้ document root ไปที่ backend ทั้งโฟลเดอร์
  3) ติดตั้ง .env, ฐานข้อมูล และไฟล์ runtime ของ environment นั้น
  4) ให้ PHP process เขียน storage และ bootstrap/cache ได้
  5) ตั้ง APP_ENV=production, APP_DEBUG=false และ APP_URL เป็น URL ของ API
     กำหนด FRONTEND_URL/FRONTEND_PRINT_BASE_URL เป็น URL ของ frontend ปลายทาง
  6) รัน php artisan optimize:clear หลังเปลี่ยนค่า environment
  7) ตรวจ DB, login, สิทธิ์, flow เอกสาร และการพิมพ์กับบริการจริงของปลายทาง

php artisan serve และ npm start เป็นคำสั่งสำหรับพัฒนาในเครื่อง
ระบบใช้งานจริงให้ใช้เว็บเซิร์ฟเวอร์และ PHP runtime ที่จัดเตรียมไว้

5. การตั้งค่าบริการและการตรวจปัญหาเบื้องต้น
------------------------------------------
เปิดใช้ตัวแปร optional ที่เกี่ยวข้องใน backend/.env.example แล้วใส่ใน .env เช่น
LDAP_*, HRM_EMPLOYEE_*, MAIL_*, LEGACY_DESIGN_REVIEW_* และ CHROME_BINARY
ค่า MAIL_DRIVER=log ในตัวอย่างยังไม่ส่งอีเมลจริง ต้องตั้ง SMTP ก่อนใช้อีเมล
การพิมพ์จาก backend ต้องให้ backend เข้าถึง frontend ตาม FRONTEND_PRINT_BASE_URL ได้

อาการและสิ่งที่ควรตรวจ:
  - No application encryption key: ตรวจ APP_KEY ใน backend/.env
  - เชื่อมฐานข้อมูลไม่ได้: ตรวจ DB_*, ฐานข้อมูลที่ restore และสิทธิ์ของ DB user
  - LDAP login ไม่ได้: ตรวจ PHP LDAP extension, LDAP_* และการเข้าถึง LDAP server
  - API เรียกผิดเครื่อง/port: ตรวจ environment.ts หรือ environment.prod.ts
  - Refresh หน้า frontend แล้ว 404: ตรวจ SPA fallback ของเว็บเซิร์ฟเวอร์
  - เขียน cache/session ไม่ได้: ตรวจสิทธิ์ storage และ bootstrap/cache
  - PDF/printing ไม่ได้: ตรวจ Chrome/Chromium, pdftocairo และ URL สำหรับพิมพ์
  - รายละเอียด error ของ backend: ตรวจ backend/storage/logs/laravel.log

ข้อสังเกตของ source ปัจจุบัน:
  php artisan route:list ยังพบ route ที่อ้าง OrdersController ซึ่งไม่มีอยู่
  และมีบาง resource actions ที่ไม่มี method รองรับ ให้ผู้ดูแลตรวจ route ที่ต้องใช้
  เมื่อปรับแต่งต่อ อย่าใช้ route:list ผ่าน/ไม่ผ่านเป็นผลยืนยันทุก flow ของระบบ

6. ขอบเขตของแพ็ก
----------------
เก็บ source, runtime config, build config, lock files และ assets ที่จำเป็น
ไม่รวม tests/spec, Postman collections, รายงานภายใน และ credentials จริง
README.txt นี้เป็นคำแนะนำติดตั้งสำหรับผู้รับ source โดยเฉพาะ
ประกาศลิขสิทธิ์ของ template และฟอนต์ยังคงไว้

ตรวจแพ็กนี้แล้วด้วยการติดตั้ง dependencies ใหม่จาก ZIP ทั้งสองฝั่ง
Frontend production build ผ่าน และ backend เริ่มทำงานได้หลังตั้งค่า .env/APP_KEY
การใช้งานข้อมูลเดิมและบริการภายนอกต้องใช้ค่า/ข้อมูลของ environment ปลายทาง
