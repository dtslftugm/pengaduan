/**
 * Core Backend - Sistem Pengaduan, Kritik, dan Saran DTSL FT UGM
 * Bagian 1: LockService, Helper, dan doPost (Submission & Upload)
 */

// Helper untuk mengambil nilai konfigurasi dari sheet Config
function getConfigValue(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Config");
  if (!sheet) return null;
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      return data[i][1];
    }
  }
  return null;
}

// Helper untuk menghasilkan ID_Pengaduan (Format: ADU-YYYYMMDD-XXXX)
function generateComplaintId() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Pengaduan");
  if (!sheet) return null;
  
  var today = new Date();
  var year = today.getFullYear();
  var month = ("0" + (today.getMonth() + 1)).slice(-2);
  var date = ("0" + today.getDate()).slice(-2);
  var dateStr = year + month + date; // YYYYMMDD
  
  var prefix = "ADU-" + dateStr + "-";
  var count = 1;
  
  var data = sheet.getDataRange().getValues();
  // Hitung berapa aduan yang sudah dibuat hari ini
  for (var i = 1; i < data.length; i++) {
    var id = data[i][0];
    if (id && id.toString().indexOf(prefix) === 0) {
      count++;
    }
  }
  
  var suffix = ("000" + count).slice(-4);
  return prefix + suffix;
}

// Helper untuk membuat token acak
function generateToken() {
  var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var token = "";
  for (var i = 0; i < 16; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Helper untuk upload file base64 ke Google Drive
function uploadFileToDrive(base64Data, mimeType, originalFileName, complaintId, suffix) {
  var folderId = getConfigValue("DRIVE_FOLDER_ID");
  if (!folderId) {
    throw new Error("DRIVE_FOLDER_ID belum diatur di sheet Config.");
  }
  
  var folder = DriveApp.getFolderById(folderId);
  
  // Ambil ekstensi file asli
  var ext = "bin";
  var dotIndex = originalFileName.lastIndexOf(".");
  if (dotIndex !== -1) {
    ext = originalFileName.substring(dotIndex + 1);
  }
  
  // Penamaan file: ID_Pengaduan_suffix.ext
  var newFileName = complaintId + "_" + suffix + "." + ext;
  
  // Bersihkan data base64 (hilangkan header data:image/png;base64, jika ada)
  var base64Clean = base64Data;
  var commaIndex = base64Data.indexOf(",");
  if (commaIndex !== -1) {
    base64Clean = base64Data.substring(commaIndex + 1);
  }
  
  var decodedBytes = Utilities.base64Decode(base64Clean);
  var blob = Utilities.newBlob(decodedBytes, mimeType, newFileName);
  
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return file.getUrl();
}

// Helper untuk mengambil email Staf berdasarkan kategori
function getStaffEmails(kategori) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Users");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var emails = [];
  for (var i = 1; i < data.length; i++) {
    var email = data[i][0];
    var role = data[i][3];
    var katStaf = data[i][4];
    
    if (role === "Staff" && katStaf === kategori) {
      emails.push(email);
    }
  }
  return emails;
}

// Helper untuk mengambil seluruh email Supervisor
function getSupervisorEmails() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Users");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var emails = [];
  for (var i = 1; i < data.length; i++) {
    var email = data[i][0];
    var role = data[i][3];
    
    if (role === "Supervisor") {
      emails.push(email);
    }
  }
  return emails;
}

// Entrypoint untuk request POST (Submission Pengaduan)
function doPost(e) {
  // CORS & JSON response setup
  var result = { success: false, message: "" };
  
  // Mengamankan penulisan dengan LockService
  var lock = LockService.getScriptLock();
  try {
    // Tunggu maksimal 10 detik untuk mendapatkan Lock
    if (!lock.tryLock(10000)) {
      result.message = "Sistem sedang sibuk. Silakan coba beberapa saat lagi (Lock Timeout).";
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Parse input
    var params;
    if (e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else {
      params = e.parameter;
    }
    
    var action = params.action;
    
    // Rute aksi POST
    if (action === "submit_pengaduan") {
      result = submitPengaduanAction(params);
    } else if (action === "update_status") {
      result = updateStatusAction(params);
    } else if (action === "bantah_status") {
      result = submitBantahanAction(params);
    } else {
      result.message = "Aksi POST tidak dikenal.";
    }
    
  } catch (error) {
    result.success = false;
    result.message = "Terjadi kesalahan internal backend: " + error.toString();
  } finally {
    // Selalu lepas lock
    lock.releaseLock();
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// Fungsi aksi: Submit Pengaduan baru
function submitPengaduanAction(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Pengaduan");
  if (!sheet) {
    return { success: false, message: "Sheet Pengaduan tidak ditemukan." };
  }
  
  // Validasi input wajib
  if (!params.nama || !params.status || !params.email || !params.kategori || !params.isi) {
    return { success: false, message: "Semua kolom wajib harus diisi." };
  }
  
  var id = generateComplaintId();
  var token = generateToken();
  var timestamp = new Date();
  
  // Proses Lampiran File (jika ada file base64)
  var fileUrl = "";
  if (params.fileData && params.fileMimeType && params.fileName) {
    // Validasi ukuran file (jika dikirim mentah, tapi idealnya dibatasi di client juga)
    // base64 size = approx 4/3 of binary size
    var approxSize = (params.fileData.length * 3) / 4;
    if (approxSize > 3 * 1024 * 1024) { // 3 MB
      return { success: false, message: "Ukuran file lampiran melebihi batas 3MB." };
    }
    fileUrl = uploadFileToDrive(params.fileData, params.fileMimeType, params.fileName, id, "pelapor");
  } else if (params.fileLinkUrl) {
    // Jika user menginput link dokumen alternatif
    fileUrl = params.fileLinkUrl;
  }
  
  // Format baris baru
  // ID_Pengaduan (1), Timestamp (2), Nama_Pengirim (3), Status_Pengirim (4), Email_Pengirim (5), No_HP_Pengirim (6), 
  // Kategori_Layanan (7), Isi_Laporan (8), File_Lampiran_URL (9), Status_Progress (10), Catatan_Staf (11), 
  // File_Bukti_Staf_URL (12), Catatan_Bantahan (13), File_Bantahan_URL (14), Token (15), Created_At (16), Updated_At (17)
  var newRow = [
    id,
    timestamp,
    params.nama,
    params.status,
    params.email,
    params.noHp || "",
    params.kategori,
    params.isi,
    fileUrl,
    "Pending", // Status awal
    "", // Catatan staf
    "", // File bukti staf
    "", // Catatan bantahan
    "", // File bantahan
    token,
    timestamp,
    timestamp
  ];
  
  sheet.appendRow(newRow);
  
  // Kirim email notifikasi
  sendNotifications(id, params.nama, params.kategori, params.isi, params.email, token);
  
  return {
    success: true,
    message: "Pengaduan berhasil dikirim.",
    data: {
      id: id,
      token: token
    }
  };
}

// Fungsi untuk mengirim email notifikasi
function sendNotifications(id, namaPengirim, kategori, isiLaporan, emailPengirim, token) {
  var webAppUrl = getConfigValue("WEB_APP_FRONTEND_URL") || "https://username.github.io/aduan-dtsl"; // Rujukan URL Frontend
  
  var trackingLink = webAppUrl + "/track.html?id=" + id + "&token=" + token;
  var adminLink = webAppUrl + "/admin.html?id=" + id + "&token=" + token;
  
  // 1. Kirim Email ke Pengirim (Confirmation & Tracking)
  var subjectSender = "[DTSL FT UGM] Konfirmasi Penerimaan Pengaduan - " + id;
  var htmlSender = "<h3>Halo " + namaPengirim + ",</h3>" +
    "<p>Terima kasih telah menyampaikan aspirasi Anda kepada Departemen Teknik Sipil dan Lingkungan FT UGM.</p>" +
    "<p>Laporan Anda telah berhasil kami catat dengan detail berikut:</p>" +
    "<ul>" +
    "<li><b>ID Pengaduan:</b> " + id + "</li>" +
    "<li><b>Kategori Layanan:</b> " + kategori + "</li>" +
    "<li><b>Isi Laporan:</b> " + isiLaporan + "</li>" +
    "</ul>" +
    "<p>Anda dapat memantau perkembangan laporan Anda secara real-time melalui tautan berikut:</p>" +
    "<p><a href='" + trackingLink + "' style='background-color: #00a896; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;'>Pantau Status Pengaduan</a></p>" +
    "<p>Sistem akan mengirimkan email notifikasi secara otomatis ketika terdapat pembaruan status dari staf kami.</p><br>" +
    "<p>Salam,<br><b>Tim Pengaduan DTSL FT UGM</b></p>";
    
  try {
    MailApp.sendEmail({
      to: emailSenderFilter(emailPengirim),
      subject: subjectSender,
      htmlBody: htmlSender
    });
  } catch (err) {
    Logger.log("Gagal mengirim email ke pengirim: " + err.toString());
  }
  
  // 2. Kirim Email ke Staf Terkait
  var staffEmails = getStaffEmails(kategori);
  if (staffEmails.length > 0) {
    var subjectStaff = "[PENGADUAN BARU] " + kategori + " - " + id;
    var htmlStaff = "<h3>Yth. Staf Layanan " + kategori + ",</h3>" +
      "<p>Telah masuk laporan pengaduan baru dengan detail sebagai berikut:</p>" +
      "<ul>" +
      "<li><b>ID Laporan:</b> " + id + "</li>" +
      "<li><b>Nama Pengirim:</b> " + namaPengirim + "</li>" +
      "<li><b>Detail Keluhan:</b> " + isiLaporan + "</li>" +
      "</ul>" +
      "<p>Mohon untuk segera meninjau dan merespon pengaduan tersebut. Anda dapat langsung melihat detail dan memperbarui status laporan melalui tautan instan di bawah ini:</p>" +
      "<p><a href='" + adminLink + "' style='background-color: #0d233a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;'>Tinjau Laporan & Update Progress</a></p><br>" +
      "<p>Salam,<br><b>Sistem Pengaduan DTSL FT UGM</b></p>";
      
    try {
      MailApp.sendEmail({
        to: staffEmails.join(","),
        subject: subjectStaff,
        htmlBody: htmlStaff
      });
    } catch (err) {
      Logger.log("Gagal mengirim email ke staf: " + err.toString());
    }
  }
  
  // 3. Kirim Salinan ke Supervisor (Jika diaktifkan di Config)
  var notifySupervisor = getConfigValue("NOTIFY_SUPERVISOR_ALL");
  if (notifySupervisor && notifySupervisor.toString().toUpperCase() === "TRUE") {
    var supervisorEmails = getSupervisorEmails();
    if (supervisorEmails.length > 0) {
      var subjectSuper = "[SUPERVISOR NOTIFICATION] Pengaduan Baru - " + id;
      var htmlSuper = "<h3>Yth. Supervisor/Atasan DTSL FT UGM,</h3>" +
        "<p>Berikut adalah notifikasi pengaduan baru yang masuk ke sistem:</p>" +
        "<ul>" +
        "<li><b>ID Laporan:</b> " + id + "</li>" +
        "<li><b>Kategori Layanan:</b> " + kategori + "</li>" +
        "<li><b>Pengirim:</b> " + namaPengirim + "</li>" +
        "<li><b>Detail Laporan:</b> " + isiLaporan + "</li>" +
        "</ul>" +
        "<p>Laporan ini saat ini ditugaskan kepada staf pada bagian <b>" + kategori + "</b>.</p>" +
        "<p>Anda dapat memantau seluruh aktivitas sistem melalui Dashboard Utama Anda.</p><br>" +
        "<p>Salam,<br><b>Sistem Pengaduan DTSL FT UGM</b></p>";
        
      try {
        MailApp.sendEmail({
          to: supervisorEmails.join(","),
          subject: subjectSuper,
          htmlBody: htmlSuper
        });
      } catch (err) {
        Logger.log("Gagal mengirim email ke supervisor: " + err.toString());
      }
    }
  }
}

// Helper untuk filter email (mencegah error kirim ke alamat kosong/tidak valid)
function emailSenderFilter(email) {
  if (!email || email.indexOf("@") === -1) return "aduan.dtsl.ugm@gmail.com"; // Fallback email
  return email;
}

// Helper untuk autentikasi user Staf / Supervisor
function authenticateUser(email, password, kategoriRequired) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Users");
  if (!sheet) return { authorized: false, role: "" };
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var uEmail = data[i][0];
    var uPass = data[i][1];
    var uNama = data[i][2];
    var uRole = data[i][3];
    var uKategori = data[i][4];
    
    if (uEmail && uPass && uEmail.toString().toLowerCase() === email.toString().toLowerCase() && uPass.toString() === password.toString()) {
      if (uRole === "Supervisor") {
        return { authorized: true, role: "Supervisor", nama: uNama };
      }
      if (uRole === "Staff") {
        // Jika kategoriRequired kosong, staff dianggap authorized untuk keperluan login general
        if (!kategoriRequired || uKategori === kategoriRequired) {
          return { authorized: true, role: "Staff", nama: uNama };
        }
      }
    }
  }
  return { authorized: false, role: "" };
}

// Aksi update status oleh Staf atau Supervisor
function updateStatusAction(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Pengaduan");
  if (!sheet) {
    return { success: false, message: "Sheet Pengaduan tidak ditemukan." };
  }
  
  var id = params.id;
  var token = params.token; // Quick token
  var email = params.email; // Dashboard credentials
  var password = params.password;
  var newStatus = params.status;
  var catatanStaf = params.catatanStaf || "";
  
  if (!id || !newStatus) {
    return { success: false, message: "ID Laporan dan Status baru wajib disediakan." };
  }
  
  // Cari baris data pengaduan
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var rowData = null;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      rowIndex = i + 1;
      rowData = data[i];
      break;
    }
  }
  
  if (rowIndex === -1) {
    return { success: false, message: "Data pengaduan tidak ditemukan." };
  }
  
  var dbToken = rowData[14];
  var dbKategori = rowData[6];
  var emailPengirim = rowData[4];
  var namaPengirim = rowData[2];
  
  // Otorisasi: Cek secure token link OR email & password login
  var isAuthorized = false;
  var actorName = "Staf";
  
  if (token && token === dbToken) {
    isAuthorized = true;
  } else if (email && password) {
    var auth = authenticateUser(email, password, dbKategori);
    if (auth.authorized) {
      isAuthorized = true;
      actorName = auth.nama;
    }
  }
  
  if (!isAuthorized) {
    return { success: false, message: "Akses ditolak. Token tidak valid atau kredensial salah." };
  }
  
  // Validasi: Status Selesai atau Ditolak WAJIB ada penjelasan/bukti
  if ((newStatus === "Selesai" || newStatus === "Ditolak") && !catatanStaf) {
    return { success: false, message: "Catatan penjelasan wajib diisi untuk status Selesai atau Ditolak." };
  }
  
  // Proses File Bukti Staf (jika diunggah)
  var fileBuktiUrl = rowData[11] || ""; // Keep existing if not updated
  if (params.fileData && params.fileMimeType && params.fileName) {
    fileBuktiUrl = uploadFileToDrive(params.fileData, params.fileMimeType, params.fileName, id, "bukti_staf");
  }
  
  var now = new Date();
  
  // Update data baris spreadsheet
  // Status_Progress = col 10 (index 9)
  // Catatan_Staf = col 11 (index 10)
  // File_Bukti_Staf_URL = col 12 (index 11)
  // Updated_At = col 17 (index 16)
  sheet.getRange(rowIndex, 10).setValue(newStatus);
  sheet.getRange(rowIndex, 11).setValue(catatanStaf);
  sheet.getRange(rowIndex, 12).setValue(fileBuktiUrl);
  sheet.getRange(rowIndex, 17).setValue(now);
  
  // Kirim email notifikasi ke Pengirim tentang update status
  sendStatusUpdateEmail(id, namaPengirim, emailPengirim, newStatus, catatanStaf, fileBuktiUrl, dbToken);
  
  return {
    success: true,
    message: "Status pengaduan " + id + " berhasil diperbarui menjadi: " + newStatus,
    data: {
      status: newStatus,
      updatedAt: now
    }
  };
}

// Fungsi mengirim email status update ke pengirim
function sendStatusUpdateEmail(id, namaPengirim, emailPengirim, status, catatan, fileBuktiUrl, token) {
  var webAppUrl = getConfigValue("WEB_APP_FRONTEND_URL") || "https://username.github.io/aduan-dtsl";
  var trackingLink = webAppUrl + "/track.html?id=" + id + "&token=" + token;
  
  var subject = "[DTSL FT UGM] Perkembangan Pengaduan - " + id + " (" + status + ")";
  
  var statusBadgeColor = "#333333";
  if (status === "Diproses") statusBadgeColor = "#f4a261";
  else if (status === "Selesai") statusBadgeColor = "#2a9d8f";
  else if (status === "Ditolak") statusBadgeColor = "#e76f51";
  
  var htmlBody = "<h3>Halo " + namaPengirim + ",</h3>" +
    "<p>Terdapat perkembangan terbaru mengenai laporan pengaduan Anda dengan ID: <b>" + id + "</b>.</p>" +
    "<p>Status saat ini: <span style='background-color: " + statusBadgeColor + "; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;'>" + status + "</span></p>" +
    "<p><b>Tanggapan dari Staf:</b></p>" +
    "<blockquote style='border-left: 4px solid #ccc; padding-left: 10px; margin-left: 10px; font-style: italic; color: #555;'>" + catatan + "</blockquote>";
    
  if (fileBuktiUrl) {
    htmlBody += "<p><b>Berkas Bukti / Lampiran Penyelesaian:</b> <a href='" + fileBuktiUrl + "'>Buka Lampiran Bukti</a></p>";
  }
  
  htmlBody += "<p>Anda dapat memantau riwayat lengkap atau mengajukan <b>sanggahan/bantahan</b> jika penyelesaian dirasa belum memuaskan melalui tautan pelacakan berikut:</p>" +
    "<p><a href='" + trackingLink + "' style='background-color: #00a896; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;'>Pantau Status & Ajukan Bantahan</a></p><br>" +
    "<p>Salam,<br><b>Tim Pengaduan DTSL FT UGM</b></p>";
    
  try {
    MailApp.sendEmail({
      to: emailSenderFilter(emailPengirim),
      subject: subject,
      htmlBody: htmlBody
    });
  } catch (err) {
    Logger.log("Gagal mengirim email update status ke pengirim: " + err.toString());
  }
}

// Aksi mengajukan bantahan (rebuttal) oleh Pengirim/Pelapor
function submitBantahanAction(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Pengaduan");
  if (!sheet) {
    return { success: false, message: "Sheet Pengaduan tidak ditemukan." };
  }
  
  var id = params.id;
  var token = params.token;
  var catatanBantahan = params.catatanBantahan;
  
  if (!id || !token || !catatanBantahan) {
    return { success: false, message: "ID, Token, dan Alasan Bantahan wajib diisi." };
  }
  
  // Cari baris data pengaduan
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var rowData = null;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      rowIndex = i + 1;
      rowData = data[i];
      break;
    }
  }
  
  if (rowIndex === -1) {
    return { success: false, message: "Data pengaduan tidak ditemukan." };
  }
  
  var dbToken = rowData[14];
  var dbKategori = rowData[6];
  var namaPengirim = rowData[2];
  
  // Verifikasi token pengirim
  if (token !== dbToken) {
    return { success: false, message: "Akses ditolak. Token pelapor tidak valid." };
  }
  
  // Proses Upload File Bukti Bantahan (jika diunggah pelapor)
  var fileBantahanUrl = "";
  if (params.fileData && params.fileMimeType && params.fileName) {
    fileBantahanUrl = uploadFileToDrive(params.fileData, params.fileMimeType, params.fileName, id, "bantahan_pelapor");
  }
  
  var now = new Date();
  
  // Update data baris spreadsheet
  // Status_Progress = col 10 (index 9) -> Ubah jadi "Bantahan"
  // Catatan_Bantahan = col 13 (index 12)
  // File_Bantahan_URL = col 14 (index 13)
  // Updated_At = col 17 (index 16)
  sheet.getRange(rowIndex, 10).setValue("Bantahan");
  sheet.getRange(rowIndex, 13).setValue(catatanBantahan);
  sheet.getRange(rowIndex, 14).setValue(fileBantahanUrl);
  sheet.getRange(rowIndex, 17).setValue(now);
  
  // Kirim email peringatan darurat ke Staf dan Supervisor
  sendBantahanNotificationEmails(id, dbKategori, namaPengirim, catatanBantahan, fileBantahanUrl);
  
  return {
    success: true,
    message: "Sanggahan/Bantahan berhasil dikirim. Staf dan Supervisor akan segera meninjau laporan ini.",
    data: {
      status: "Bantahan",
      updatedAt: now
    }
  };
}

// Fungsi mengirim notifikasi adanya Bantahan ke Staf & Supervisor
function sendBantahanNotificationEmails(id, kategori, namaPengirim, alasanBantahan, fileBantahanUrl) {
  var webAppUrl = getConfigValue("WEB_APP_FRONTEND_URL") || "https://username.github.io/aduan-dtsl";
  var adminLink = webAppUrl + "/admin.html?id=" + id; // Dashboard link
  
  var subject = "[URGENT - BANTAHAN PELAPOR] Pengaduan " + id + " Dibantah";
  
  var htmlBody = "<h3>Pemberitahuan Mendesak (Bantahan Pelapor)</h3>" +
    "<p>Pelapor atas nama <b>" + namaPengirim + "</b> mengajukan bantahan/sanggahan atas penyelesaian pengaduan dengan ID: <b>" + id +</b> (Bagian: <b>" + kategori + "</b>).</p>" +
    "<p><b>Alasan Sanggahan Pelapor:</b></p>" +
    "<blockquote style='border-left: 4px solid #e76f51; padding-left: 10px; margin-left: 10px; color: #b23b3b; font-weight: bold;'>" + alasanBantahan + "</blockquote>";
    
  if (fileBantahanUrl) {
    htmlBody += "<p><b>Berkas Bukti Bantahan Pelapor:</b> <a href='" + fileBantahanUrl + "'>Buka Lampiran Bukti Bantahan</a></p>";
  }
  
  htmlBody += "<p>Staf yang bertanggung jawab dan Supervisor wajib meninjau kembali laporan ini untuk mencegah adanya pemalsuan data/kinerja. Silakan akses dashboard untuk menanggapi:</p>" +
    "<p><a href='" + adminLink + "' style='background-color: #e76f51; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;'>Buka Portal Admin</a></p><br>" +
    "<p>Salam,<br><b>Sistem Pengaduan DTSL FT UGM</b></p>";
    
  // 1. Kirim ke Staf terkait
  var staffEmails = getStaffEmails(kategori);
  if (staffEmails.length > 0) {
    try {
      MailApp.sendEmail({
        to: staffEmails.join(","),
        subject: subject,
        htmlBody: htmlBody
      });
    } catch (err) {
      Logger.log("Gagal kirim email bantahan ke staf: " + err.toString());
    }
  }
  
  // 2. Kirim ke Supervisor (wajib untuk bantahan)
  var supervisorEmails = getSupervisorEmails();
  if (supervisorEmails.length > 0) {
    try {
      MailApp.sendEmail({
        to: supervisorEmails.join(","),
        subject: "[SUPERVISOR WARNING] " + subject,
        htmlBody: htmlBody
      });
    } catch (err) {
      Logger.log("Gagal kirim email bantahan ke supervisor: " + err.toString());
    }
  }
}

// doGet Entry Point
function doGet(e) {
  var action = e.parameter.action;
  var result = { success: false, message: "" };
  
  try {
    if (action === "get_status") {
      result = getStatusAction(e.parameter);
    } else if (action === "verify_staff") {
      result = verifyStaffAction(e.parameter);
    } else if (action === "get_all_reports") {
      result = getAllReportsAction(e.parameter);
    } else if (action === "get_stats") {
      result = getStatsAction(e.parameter);
    } else {
      result.message = "Aksi GET tidak dikenal.";
    }
  } catch (error) {
    result.success = false;
    result.message = "Terjadi kesalahan internal backend GET: " + error.toString();
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// Aksi GET: Mengambil status detail untuk Pengirim
function getStatusAction(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Pengaduan");
  if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
  
  var id = params.id;
  var token = params.token;
  
  if (!id) return { success: false, message: "ID Laporan wajib diisi." };
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      var row = data[i];
      // Jika token dikirimkan, verifikasi kecocokannya untuk data pelapor
      if (token && row[14] !== token) {
        return { success: false, message: "Token pelacakan tidak valid." };
      }
      
      return {
        success: true,
        data: {
          id: row[0],
          timestamp: row[1],
          nama: row[2],
          statusPengirim: row[3],
          email: row[4],
          noHp: row[5],
          kategori: row[6],
          isi: row[7],
          fileLampiranUrl: row[8],
          statusProgress: row[9],
          catatanStaf: row[10],
          fileBuktiStafUrl: row[11],
          catatanBantahan: row[12],
          fileBantahanUrl: row[13],
          createdAt: row[15],
          updatedAt: row[16]
        }
      };
    }
  }
  return { success: false, message: "Data pengaduan dengan ID " + id + " tidak ditemukan." };
}

// Aksi GET: Verifikasi login staf / token access
function verifyStaffAction(params) {
  var id = params.id;
  var token = params.token;
  var email = params.email;
  var password = params.password;
  
  if (id && token) {
    // Verifikasi secure token-link dari email staf
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Pengaduan");
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === id && data[i][14] === token) {
        var row = data[i];
        return {
          success: true,
          type: "token",
          user: {
            nama: "Staf Layanan",
            role: "Staff",
            kategori: row[6]
          },
          data: {
            id: row[0],
            timestamp: row[1],
            nama: row[2],
            statusPengirim: row[3],
            email: row[4],
            noHp: row[5],
            kategori: row[6],
            isi: row[7],
            fileLampiranUrl: row[8],
            statusProgress: row[9],
            catatanStaf: row[10],
            fileBuktiStafUrl: row[11],
            catatanBantahan: row[12],
            fileBantahanUrl: row[13]
          }
        };
      }
    }
    return { success: false, message: "Token link tidak valid atau kadaluarsa." };
  } else if (email && password) {
    // Verifikasi email & password
    var auth = authenticateUser(email, password, "");
    if (auth.authorized) {
      return {
        success: true,
        type: "login",
        user: {
          email: email,
          nama: auth.nama,
          role: auth.role,
          kategori: auth.kategori || ""
        }
      };
    }
    return { success: false, message: "Email atau password salah." };
  }
  return { success: false, message: "Kredensial atau Token tidak lengkap." };
}

// Aksi GET: Mengambil daftar semua laporan untuk Dashboard
function getAllReportsAction(params) {
  var email = params.email;
  var password = params.password;
  
  if (!email || !password) {
    return { success: false, message: "Autentikasi diperlukan." };
  }
  
  var auth = authenticateUser(email, password, "");
  if (!auth.authorized) {
    return { success: false, message: "Kredensial tidak valid." };
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Pengaduan");
  if (!sheet) return { success: false, message: "Sheet Pengaduan tidak ditemukan." };
  
  var data = sheet.getDataRange().getValues();
  var list = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var kategoriAduan = row[6];
    
    // Filter berdasarkan role: Staf hanya melihat kategori mereka, Supervisor melihat semua
    if (auth.role === "Supervisor" || (auth.role === "Staff" && auth.kategori === kategoriAduan)) {
      list.push({
        id: row[0],
        timestamp: row[1],
        nama: row[2],
        statusPengirim: row[3],
        email: row[4],
        noHp: row[5],
        kategori: row[6],
        isi: row[7],
        fileLampiranUrl: row[8],
        statusProgress: row[9],
        catatanStaf: row[10],
        fileBuktiStafUrl: row[11],
        catatanBantahan: row[12],
        fileBantahanUrl: row[13],
        token: row[14], // Staf boleh melihat token untuk debugging/link
        createdAt: row[15],
        updatedAt: row[16]
      });
    }
  }
  
  // Sortir dari yang terbaru
  list.sort(function(a, b) {
    return new Date(b.timestamp) - new Date(a.timestamp);
  });
  
  return {
    success: true,
    data: list
  };
}

// Aksi GET: Mengambil data statistik kinerja untuk Supervisor
function getStatsAction(params) {
  var email = params.email;
  var password = params.password;
  
  if (!email || !password) {
    return { success: false, message: "Autentikasi diperlukan." };
  }
  
  var auth = authenticateUser(email, password, "");
  if (!auth.authorized) {
    return { success: false, message: "Kredensial tidak valid." };
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Pengaduan");
  if (!sheet) return { success: false, message: "Sheet Pengaduan tidak ditemukan." };
  
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  
  // Variabel akumulasi statistik
  var total = 0;
  var statsStatus = { Pending: 0, Diproses: 0, Selesai: 0, Ditolak: 0, Bantahan: 0 };
  var statsKategori = {};
  var kelalaianStaf = []; // Pending > 3 hari
  
  // Penghitungan durasi penyelesaian
  var totalResTimeGlobal = 0;
  var countResTimeGlobal = 0;
  var resTimePerKategori = {};
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = row[0];
    var ts = new Date(row[1]);
    var status = row[9];
    var kategori = row[6];
    var updated = new Date(row[16]);
    
    if (!id) continue;
    
    total++;
    
    // Status count
    if (statsStatus.hasOwnProperty(status)) {
      statsStatus[status]++;
    } else {
      statsStatus[status] = 1;
    }
    
    // Category count
    if (!statsKategori[kategori]) {
      statsKategori[kategori] = 0;
    }
    statsKategori[kategori]++;
    
    // Deteksi Kelalaian (Pending > 3 hari)
    // 3 hari = 3 * 24 * 60 * 60 * 1000 milidetik = 259200000 ms
    if (status === "Pending" && (now - ts) > 259200000) {
      kelalaianStaf.push({
        id: id,
        nama: row[2],
        kategori: kategori,
        timestamp: row[1],
        durasiHari: Math.floor((now - ts) / (1000 * 60 * 60 * 24))
      });
    }
    
    // Durasi Penyelesaian (Untuk status Selesai atau Ditolak)
    if (status === "Selesai" || status === "Ditolak") {
      var resTimeHours = (updated - ts) / (1000 * 60 * 60); // Durasi dalam jam
      
      // Global
      totalResTimeGlobal += resTimeHours;
      countResTimeGlobal++;
      
      // Per Kategori
      if (!resTimePerKategori[kategori]) {
        resTimePerKategori[kategori] = { totalHours: 0, count: 0 };
      }
      resTimePerKategori[kategori].totalHours += resTimeHours;
      resTimePerKategori[kategori].count++;
    }
  }
  
  // Format hasil rata-rata durasi penyelesaian (konversi ke hari/jam)
  var avgGlobalDays = countResTimeGlobal > 0 ? (totalResTimeGlobal / countResTimeGlobal / 24).toFixed(1) : "0.0";
  var avgKategoriDays = {};
  for (var kat in resTimePerKategori) {
    var item = resTimePerKategori[kat];
    avgKategoriDays[kat] = (item.totalHours / item.count / 24).toFixed(1);
  }
  
  return {
    success: true,
    data: {
      totalReports: total,
      statusStats: statsStatus,
      categoryStats: statsKategori,
      avgResolutionDaysGlobal: avgGlobalDays,
      avgResolutionDaysPerCategory: avgKategoriDays,
      negligentReports: kelalaianStaf
    }
  };
}

