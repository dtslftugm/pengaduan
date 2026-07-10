# Logbook & Notes - Sistem Pengaduan DTSL FT UGM

Dokumen ini mencatat riwayat pengembangan, status fitur, bug yang ditemukan, solusi, serta instruksi penting mengenai Sistem Pengaduan, Kritik, dan Saran DTSL FT UGM.

---

## 📅 Log Pengerjaan

### 3 Juli 2026
* [x] Inisialisasi proyek dan penyusunan **Implementation Plan** berdasarkan masukan pengguna.
* [x] Pembuatan file `notes.md` sebagai logbook utama proyek.
* [x] Pembuatan `Setup.gs` untuk otomatisasi struktur Google Sheets.
* [x] Pembuatan `Code.gs` untuk core backend (LockService, POST, GET, Email Notification, File Upload).
* [x] Pembuatan frontend HTML/CSS/JS (`index.html`, `track.html`, `admin.html`, `css/style.css`, `js/app.js`).
* [x] Pengujian, validasi, dan dokumentasi petunjuk deployment.

---

## 🛠️ Status Fitur

| Fitur | Status | Deskripsi |
|---|---|---|
| **Form Pengaduan** | ✅ Selesai | Input detail pelapor, opsi link dokumen, upload file max 3MB, disclaimer data pribadi & link `ugm.id/sempritan`. |
| **Upload File & Kompresi** | ✅ Selesai | Kompresi gambar sisi klien, batas 3MB, upload ke Drive dengan format nama `[ID]_[Suffix].[Ext]`. |
| **Tracking Progress** | ✅ Selesai | Stepper status, form untuk mengajukan Bantahan (Rebuttal) disertai unggah bukti baru jika pelapor tidak puas. |
| **Dashboard Staf** | ✅ Selesai | Login email/password, review tugas kategori, update status (Diproses/Ditolak/Selesai) + wajib upload bukti penyelesaian. |
| **Dashboard Supervisor** | ✅ Selesai | Monitoring status global, deteksi kelalaian respon (>3 hari), statistik bulanan/tahunan (termasuk rata-rata waktu penyelesaian). |
| **LockService & Safety** | ✅ Selesai | Penulisan spreadsheet yang aman dari race condition menggunakan LockService. |

---

## 🐛 Log Bug & Masalah (Bug Tracker)

* **[FIXED] Standalone Script Execution Error**: Ketika script GAS di-deploy sebagai standalone (unbound) script, pemanggilan `SpreadsheetApp.getActiveSpreadsheet()` mengembalikan `null` dan mengakibatkan error fatal.
  * *Solusi*: Ditambahkan konstanta `SPREADSHEET_ID` di bagian atas file `Code.gs` dan `Setup.gs` beserta fungsi helper `getSpreadsheet()` yang membuka spreadsheet menggunakan `SpreadsheetApp.openById(id)` secara otomatis dengan fallback aman ke `getActiveSpreadsheet()`. Semua pemanggilan spreadsheet global digantikan oleh `getSpreadsheet()`.
* **[FITUR] Format WhatsApp Link Otomatis**: Pengguna menginput nomor telepon mentah atau link WhatsApp di form pengaduan.
  * *Solusi*: Mengimplementasikan fungsi helper `formatWhatsAppLink()` di `js/app.js` yang membersihkan nomor telepon (mengganti awalan `0` dengan kode negara `62` Indonesia) menjadi format tautan universal `https://wa.me/62...`. Ditambahkan pula elemen UI di `track.html` dan `admin.html` agar nomor WhatsApp tersebut tampil sebagai tautan yang dapat diklik langsung oleh staf/admin untuk mempermudah komunikasi tindak lanjut.
* **[FITUR] Penambahan Kategori Layanan Akademik**: Menambahkan kategori baru "Layanan Akademik" untuk mengadili laporan seputar perkuliahan, jadwal, KRS, dll.
  * *Solusi*: Memperbarui `index.html` (formulir pengaduan), `admin.html` (filter dashboard admin), `js/app.js` (perhitungan performa rata-rata per kategori supervisor), serta menambahkan user staf dummy baru `akademik@mail.ugm.ac.id` dengan kategori "Layanan Akademik" pada `Setup.gs`.
* **[PEMBERSIHAN] Dekopling SPREADSHEET_ID Hardcoded**: Menghapus nilai Spreadsheet ID hardcoded dari source code `Code.gs` dan `Setup.gs` menggunakan Script Properties.
  * *Solusi*: Refaktor fungsi `getSpreadsheet()` untuk membaca properti `SPREADSHEET_ID` dari `PropertiesService` terlebih dahulu, lalu fallback ke `getActiveSpreadsheet()` (jika script bound). Jika tidak ditemukan, script akan memicu `throw new Error` demi keamanan dan transparansi. Menambahkan fungsi helper `setSpreadsheetIdProperty(id)` agar memudahkan inisialisasi tanpa mengedit kode sumber langsung.
* **[FIXED] TypeError pada Reset Stepper & Polishing UI Pelacakan**: Perbaikan error "Gagal memuat status laporan" akibat elemen `timeFinal` terhapus dari DOM oleh manipulasi `.innerHTML` serta optimalisasi kerapian space area di halaman pelacakan.
  * *Solusi*: Menambahkan sub-elemen `<span id="textFinal">` di `track.html` dan memperbarui `js/app.js` agar hanya memodifikasi teks label secara independen tanpa menghapus penunjuk waktu. Mengurangi margin & padding stepper agar lebih padat, menyembunyikan banner hero utama setelah data ditemukan, dan memunculkan header ringkas dengan tombol reload pencarian untuk kenyamanan pengguna.
* **[POLISHING] Konsistensi Desain Tabel Panel Admin**: Penyelarasan visual tabel daftar pengaduan dengan layout statistik pada panel admin staf.
  * *Solusi*: Membungkus tabel daftar pengaduan (Tab 1) di `admin.html` ke dalam kontainer `.card-wrapper` dengan padding `24px` dan `margin-bottom: 40px` agar memiliki bayangan halus (shadow), border melengkung (rounded border), latar belakang putih bersih, serta ruang kosong yang proporsional di bagian bawah halaman.
* **[FIXED] Otomatisasi Sinkronisasi Database (Email Staf/Supervisor)**: Penyelesaian kendala di mana email notifikasi pengaduan baru tidak masuk ke inbox staf/supervisor baru/terupdate jika database Google Sheet sudah terbentuk sebelumnya.
  * *Solusi*: Refaktor fungsi `initDatabase()` di `Setup.gs` dengan menambahkan fungsi helper `syncUsersDatabase` dan `syncConfigDatabase`. Kini, setiap kali `initDatabase()` dijalankan di Google Apps Script editor, sistem akan menyinkronkan (menambahkan staf baru "Layanan Akademik" dan memperbarui alias `pathub+` pada baris yang sudah ada) tanpa menghapus atau merusak data custom yang dibuat pengguna secara manual.
* **[PEMBERSIHAN] Proteksi Email Masuk Spam**: Mencegah email notifikasi otomatis masuk ke folder SPAM penerima (pelapor, staf, supervisor).
  * *Solusi*: Menambahkan properti `name: "Aspirasi & Pengaduan DTSL FT UGM"` dan `replyTo: "tsipil.ft@ugm.ac.id"` pada opsi pemanggilan `MailApp.sendEmail` di `Code.gs`. Hal ini meningkatkan legitimasi reputasi email pengirim di mata spam filter client email (Gmail, Outlook, dll) sehingga email diarahkan langsung ke Inbox Utama.
* **[REFAKTOR] Pencarian Kolom Dinamis Berbasis Header (`findCol`)**: Menghindari kerusakan sistem akibat perubahan struktur/posisi kolom di Google Sheets oleh Admin (misal: kolom digeser atau disisipkan).
  * *Solusi*: Mengganti penggunaan indeks array statik (seperti `row[0]`, `row[14]`) dengan helper `findCol(headers, targetName)` di seluruh file `Code.gs` dan `Setup.gs`. Fungsi ini melakukan sanitasi dengan `trim()` dan `toLowerCase()` untuk mencegah gagal deteksi karena spasi atau perbedaan huruf besar/kecil.
  * *Syntax*: `findCol(headers_array, "Nama_Kolom")`
  * *Return*: Mengembalikan integer index (0-based) dari posisi kolom yang dicari. Jika tidak ditemukan, akan mengembalikan `-1`.
* **[FITUR] Pembuatan Penugasan (Work Order) UI & Backend**: Fitur pendelegasian Work Order (WO) yang dulunya murni berbasis data backend kini diintegrasikan ke panel UI Supervisor.
  * *Solusi Frontend*: Menambahkan form modal baru `woCreateModal` pada `admin.html`. Tombol "Buat Penugasan (WO)" pada review modal dibuat hanya tampil jika `sessionStorage.getItem("admin_role") === "Supervisor"`. Logika form disiapkan pada `js/app.js` melalui fungsi `submitWOCreate()` yang langsung mengalihkan view ke tab Kanban/WO setelah berhasil.
  * *Solusi Backend*: Menambahkan endpoint GET baru `action=get_staff_list` pada `Code.gs`. Endpoint ini digunakan oleh frontend (melalui `fetchStaffListForWO()`) untuk mengambil opsi *dropdown* nama staf yang sesuai dengan Kategori aduan, guna mencegah kesalahan ketik (typo) saat mengisi *Assignee Email*.
* **[UX] Relaksasi Limit Upload & Multi-File**: Mengizinkan pengunggahan hingga 5 foto beresolusi tinggi (contoh dari iPhone) tanpa langsung ditolak oleh limit 3MB.
  * *Solusi Frontend*: Menambahkan atribut `multiple` pada input file di `index.html`. Mengganti logika `handleFileProcess` di `app.js` menjadi `handleMultipleFileProcess` yang me-loop setiap file yang dipilih, melakukan `compressImage()` di klien, dan membatasi ukuran <3MB per file *hanya setelah kompresi selesai*. File yang lolos dimasukkan ke array `uploadedFiles`.
  * *Solusi Backend*: Memodifikasi fungsi `submitPengaduanAction` di `Code.gs` untuk mendeteksi `params.files` (array), kemudian mengulang fungsi upload `uploadFileToDrive` per file, lalu menyatukan semua URL yang dihasilkan menggunakan koma (`, `) untuk dimasukkan ke dalam Google Sheet di satu sel.


---

## 🚀 Instruksi Deployment & Setup

Ikuti langkah-langkah berikut untuk melakukan instalasi dan mempublikasikan sistem:

### 1. Persiapan Google Spreadsheet & Apps Script
1. Buka file Google Spreadsheet Anda: [Google Spreadsheet](https://docs.google.com/spreadsheets/d/10S7RpwfsuA-Jf9ddy-GSEMoUGBYzhbQjxbIV7FvfxoY/edit#gid=0)
2. Klik menu **Ekstensi (Extensions)** ➔ **Apps Script**.
3. Di dalam editor Apps Script, buat dua file script baru:
   * **`Setup.gs`**: Salin seluruh isi dari berkas [Setup.gs](file:///c:/ADUAN-DTSL/Setup.gs).
   * **`Code.gs`**: Salin seluruh isi dari berkas [Code.gs](file:///c:/ADUAN-DTSL/Code.gs).
4. Pada dropdown fungsi di bagian atas editor, pilih fungsi **`initDatabase`**, lalu klik tombol **Run** (Jalankan). 
   * *Catatan: Berikan izin otorisasi yang diminta oleh Google.*
   * Langkah ini akan membuat sheet `Pengaduan`, `Users`, dan `Config` dengan kolom header dan data dummy awal secara otomatis.

### 2. Deploy Apps Script sebagai Web App
1. Klik tombol **Deploy** di kanan atas editor Apps Script ➔ pilih **New Deployment** (Penerapan Baru).
2. Klik ikon gir di sebelah "Select type" ➔ pilih **Web app** (Aplikasi Web).
3. Konfigurasikan:
   * **Description**: Inisialisasi API Pengaduan
   * **Execute as**: **Me (akun-ugm-anda@mail.ugm.ac.id)**
   * **Who has access**: **Anyone** (Penting agar frontend statis di GitHub Pages dapat mengirimkan data).
4. Klik **Deploy**.
5. Salin **Web App URL** yang dihasilkan (contoh: `https://script.google.com/macros/s/AKfyc.../exec`).

### 3. Konfigurasi Endpoint di Frontend
1. Buka berkas [js/app.js](file:///c:/ADUAN-DTSL/js/app.js) di repositori frontend lokal Anda.
2. Di baris paling atas, perbarui nilai konstanta `API_URL` dengan **Web App URL** yang Anda salin di langkah sebelumnya:
   ```javascript
   const API_URL = "URL_WEB_APP_APPS_SCRIPT_ANDA";
   ```

### 4. Publikasi Frontend di GitHub Pages
1. Push seluruh berkas frontend dari folder lokal (`index.html`, `track.html`, `admin.html`, `css/`, `js/`) ke repositori GitHub Anda.
2. Di repositori GitHub Anda, buka **Settings** ➔ **Pages**.
3. Pada bagian **Build and deployment**, pilih branch utama Anda (misalnya `main` atau `master`) dan folder `/ (root)`. Klik **Save**.
4. Tunggu beberapa menit, lalu salin alamat URL GitHub Pages yang diterbitkan (contoh: `https://username.github.io/nama-repo/`).

### 5. Finalisasi Konfigurasi Spreadsheet
1. Buka sheet **`Config`** di Google Spreadsheet Anda.
2. Perbarui baris dengan key **`WEB_APP_FRONTEND_URL`** (buat jika belum ada) dan isi kolom Value dengan **URL GitHub Pages** Anda. Ini penting agar link pelacakan pada notifikasi email mengarah ke alamat website yang benar.
3. Anda dapat mengedit daftar akun staf penanggung jawab secara langsung pada sheet **`Users`** (Email, Password, Nama, Kategori Layanan).

