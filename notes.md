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

*Belum ada bug yang tercatat saat ini.*

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

