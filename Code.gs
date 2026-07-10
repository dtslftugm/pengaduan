/**
 * Core Backend - Sistem Pengaduan, Kritik, dan Saran DTSL FT UGM
 * Bagian 1: LockService, Helper, dan doPost (Submission & Upload)
 */

function getSpreadsheet() {
  // Mengambil ID dari Script Properties (Wajib diatur di Project Settings atau via setSpreadsheetIdProperty)
  var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (id && id !== "") {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      throw new Error("Gagal membuka Spreadsheet. Periksa apakah SPREADSHEET_ID valid dan akun memiliki akses.");
    }
  }
  
  // Fallback jika script bound ke spreadsheet
  var activeSs = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSs) {
    return activeSs;
  }
  
  throw new Error("SPREADSHEET_ID tidak ditemukan di Script Properties dan script tidak melekat (unbound) pada Spreadsheet.");
}

// Fungsi pembantu untuk menetapkan Script Property secara otomatis
function setSpreadsheetIdProperty(id) {
  if (!id || id.trim() === "") {
    throw new Error("ID Spreadsheet tidak boleh kosong. Jalankan dengan: setSpreadsheetIdProperty('ID_SPREADSHEET_ANDA')");
  }
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", id.trim());
  return "SPREADSHEET_ID berhasil disimpan di Script Properties: " + id.trim();
}

// Helper: Mencari index kolom berdasarkan nama header (dengan sanitasi trim dan lowercase)
function findCol(headers, name) {
  var target = name.toString().toLowerCase().trim();
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] && headers[i].toString().toLowerCase().trim() === target) {
      return i;
    }
  }
  return -1;
}

// Helper untuk mengambil nilai konfigurasi dari sheet Config
function getConfigValue(key) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Config");
  if (!sheet) return null;
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;
  
  var headers = data[0];
  var keyIdx = findCol(headers, "Key");
  var valIdx = findCol(headers, "Value");
  if (keyIdx === -1 || valIdx === -1) return null;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][keyIdx] === key) {
      return data[i][valIdx];
    }
  }
  return null;
}

// Helper untuk menghasilkan ID_Pengaduan (Format: ADU-YYYYMMDD-XXXX)
function generateComplaintId() {
  var ss = getSpreadsheet();
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
  if (data.length > 0) {
    var headers = data[0];
    var idIdx = findCol(headers, "ID_Pengaduan");
    
    if (idIdx !== -1) {
      // Hitung berapa aduan yang sudah dibuat hari ini
      for (var i = 1; i < data.length; i++) {
        var id = data[i][idIdx];
        if (id && id.toString().indexOf(prefix) === 0) {
          count++;
        }
      }
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
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Users");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  var headers = data[0];
  var emailIdx = findCol(headers, "Email");
  var roleIdx = findCol(headers, "Role");
  var katIdx = findCol(headers, "Kategori_Layanan");
  if (emailIdx === -1 || roleIdx === -1 || katIdx === -1) return [];
  
  var emails = [];
  for (var i = 1; i < data.length; i++) {
    var email = data[i][emailIdx];
    var role = data[i][roleIdx];
    var katStaf = data[i][katIdx];
    
    if (role === "Staff" && katStaf === kategori) {
      emails.push(email);
    }
  }
  return emails;
}

// Helper untuk mengambil seluruh email Supervisor
function getSupervisorEmails() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Users");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  var headers = data[0];
  var emailIdx = findCol(headers, "Email");
  var roleIdx = findCol(headers, "Role");
  if (emailIdx === -1 || roleIdx === -1) return [];
  
  var emails = [];
  for (var i = 1; i < data.length; i++) {
    var email = data[i][emailIdx];
    var role = data[i][roleIdx];
    
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
    } else if (action === "create_work_order") {
      result = createWorkOrderAction(params);
    } else if (action === "update_wo_priority") {
      result = updateWOPriorityAction(params);
    } else if (action === "start_work_order") {
      result = startWorkOrderAction(params);
    } else if (action === "complete_work_order") {
      result = completeWorkOrderAction(params);
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
  var ss = getSpreadsheet();
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
  if (params.files && params.files.length > 0) {
    var urls = [];
    for (var f = 0; f < params.files.length; f++) {
      var fileObj = params.files[f];
      if (fileObj.data && fileObj.mimeType && fileObj.name) {
        var approxSize = (fileObj.data.length * 3) / 4;
        if (approxSize > 3.5 * 1024 * 1024) { // Toleransi 3.5MB per file setelah kompres
          return { success: false, message: "Ukuran file " + fileObj.name + " melebihi batas 3MB." };
        }
        var url = uploadFileToDrive(fileObj.data, fileObj.mimeType, fileObj.name, id, "pelapor");
        urls.push(url);
      }
    }
    fileUrl = urls.join(", ");
  } else if (params.fileData && params.fileMimeType && params.fileName) {
    // Fallback kompatibilitas (Single file)
    var approxSize = (params.fileData.length * 3) / 4;
    if (approxSize > 3.5 * 1024 * 1024) {
      return { success: false, message: "Ukuran file lampiran melebihi batas 3MB." };
    }
    fileUrl = uploadFileToDrive(params.fileData, params.fileMimeType, params.fileName, id, "pelapor");
  } else if (params.fileLinkUrl) {
    // Jika user menginput link dokumen alternatif
    fileUrl = params.fileLinkUrl;
  }
  
  // Format baris baru (dinamis berdasarkan header)
  var headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  var newRow = new Array(headers.length);
  for (var i = 0; i < newRow.length; i++) {
    newRow[i] = ""; // inisialisasi default
  }
  
  var setVal = function(colName, val) {
    var idx = findCol(headers, colName);
    if (idx !== -1) newRow[idx] = val;
  };
  
  setVal("ID_Pengaduan", id);
  setVal("Timestamp", timestamp);
  setVal("Nama_Pengirim", params.nama);
  setVal("Status_Pengirim", params.status);
  setVal("Email_Pengirim", params.email);
  setVal("No_HP_Pengirim", params.noHp || "");
  setVal("Kategori_Layanan", params.kategori);
  setVal("Isi_Laporan", params.isi);
  setVal("File_Lampiran_URL", fileUrl);
  setVal("Status_Progress", "Pending"); // Status awal
  setVal("Token", token);
  setVal("Updated_At", timestamp);
  
  // Kolom baru (Fase 1 V2.0)
  setVal("Lokasi_Laporan", params.lokasiLaporan || "");
  setVal("Sub_Lokasi", params.subLokasi || "");
  
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
  var webAppUrl = getConfigValue("WEB_APP_FRONTEND_URL"); // Rujukan URL Frontend
  
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
      htmlBody: htmlSender,
      name: "Layanan Aduan DTSL FT UGM",
      replyTo: "tsipil.ft+aspirasi@ugm.ac.id"
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
        htmlBody: htmlStaff,
        name: "Layanan Aduan DTSL FT UGM",
        replyTo: "tsipil.ft+aspirasi@ugm.ac.id"
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
        "<p>Laporan ini sudah ditugaskan kepada staf bagian <b>" + kategori + "</b>.</p>" +
        "<p>Anda dapat memantau seluruh aktivitas sistem melalui Dashboard Utama Anda.</p><br>" +
        "<p>Salam,<br><b>Sistem Pengaduan DTSL FT UGM</b></p>";
        
      try {
        MailApp.sendEmail({
          to: supervisorEmails.join(","),
          subject: subjectSuper,
          htmlBody: htmlSuper,
          name: "Layanan Pengaduan DTSL FT UGM",
          replyTo: "tsipil.ft+aspirasi@ugm.ac.id"
        });
      } catch (err) {
        Logger.log("Gagal mengirim email ke supervisor: " + err.toString());
      }
    }
  }
}

// Helper untuk filter email (mencegah error kirim ke alamat kosong/tidak valid)
function emailSenderFilter(email) {
  if (!email || email.indexOf("@") === -1) return "pathub+aduan@gmail.com"; // Fallback email
  return email;
}

// Helper untuk autentikasi user Staf / Supervisor
function authenticateUser(email, password, kategoriRequired) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Users");
  if (!sheet) return { authorized: false, role: "" };
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { authorized: false, role: "" };
  
  var headers = data[0];
  var emailIdx = findCol(headers, "Email");
  var passIdx = findCol(headers, "Password");
  var namaIdx = findCol(headers, "Nama");
  var roleIdx = findCol(headers, "Role");
  var katIdx = findCol(headers, "Kategori_Layanan");
  if (emailIdx === -1 || passIdx === -1 || namaIdx === -1 || roleIdx === -1 || katIdx === -1) {
    return { authorized: false, role: "" };
  }
  
  for (var i = 1; i < data.length; i++) {
    var uEmail = data[i][emailIdx];
    var uPass = data[i][passIdx];
    var uNama = data[i][namaIdx];
    var uRole = data[i][roleIdx];
    var uKategori = data[i][katIdx];
    
    var uEmailStr = uEmail ? uEmail.toString().toLowerCase().trim() : "";
    var emailStr = email ? email.toString().toLowerCase().trim() : "";
    // Jika frontend tidak menggunakan encodeURIComponent, karakter '+' akan diterima sebagai spasi ' '
    var emailStrFallback = emailStr.replace(/ /g, '+');
    
    var uPassStr = uPass ? uPass.toString().trim() : "";
    var passStr = password ? password.toString().trim() : "";

    if (uEmailStr && uPassStr && (uEmailStr === emailStr || uEmailStr === emailStrFallback) && uPassStr === passStr) {
      var uRoleStr = uRole ? uRole.toString().trim() : "";
      var uKatStr = uKategori ? uKategori.toString().trim() : "";
      
      if (uRoleStr === "Supervisor") {
        return { authorized: true, role: "Supervisor", nama: uNama, kategori: uKatStr };
      }
      if (uRoleStr === "Staff") {
        // Jika kategoriRequired kosong, staff dianggap authorized untuk keperluan login general
        var reqKatStr = kategoriRequired ? kategoriRequired.toString().trim() : "";
        if (!reqKatStr || uKatStr === reqKatStr) {
          return { authorized: true, role: "Staff", nama: uNama, kategori: uKatStr };
        }
      }
    }
  }
  return { authorized: false, role: "" };
}

// Aksi update status oleh Staf atau Supervisor
function updateStatusAction(params) {
  var ss = getSpreadsheet();
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
  if (data.length < 2) return { success: false, message: "Data pengaduan kosong." };
  
  var headers = data[0];
  var idIdx = findCol(headers, "ID_Pengaduan");
  var tokenIdx = findCol(headers, "Token");
  var katIdx = findCol(headers, "Kategori_Layanan");
  var emailIdx = findCol(headers, "Email_Pengirim");
  var namaIdx = findCol(headers, "Nama_Pengirim");
  var statusProgressIdx = findCol(headers, "Status_Progress");
  var catatanStafIdx = findCol(headers, "Catatan_Staf");
  var fileBuktiStafUrlIdx = findCol(headers, "File_Bukti_Staf_URL");
  var updatedAtIdx = findCol(headers, "Updated_At");
  
  if (idIdx === -1 || tokenIdx === -1 || katIdx === -1 || emailIdx === -1 || namaIdx === -1 || statusProgressIdx === -1 || catatanStafIdx === -1 || fileBuktiStafUrlIdx === -1 || updatedAtIdx === -1) {
    return { success: false, message: "Struktur kolom pengaduan tidak valid." };
  }
  
  var rowIndex = -1;
  var rowData = null;
  for (var i = 1; i < data.length; i++) {
    if (data[i][idIdx] === id) {
      rowIndex = i + 1;
      rowData = data[i];
      break;
    }
  }
  
  if (rowIndex === -1) {
    return { success: false, message: "Data pengaduan tidak ditemukan." };
  }
  
  var dbToken = rowData[tokenIdx];
  var dbKategori = rowData[katIdx];
  var emailPengirim = rowData[emailIdx];
  var namaPengirim = rowData[namaIdx];
  
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
  
  // Update data baris spreadsheet menggunakan indeks berbasis-1
  sheet.getRange(rowIndex, statusProgressIdx + 1).setValue(newStatus);
  sheet.getRange(rowIndex, catatanStafIdx + 1).setValue(catatanStaf);
  sheet.getRange(rowIndex, fileBuktiStafUrlIdx + 1).setValue(fileBuktiUrl);
  sheet.getRange(rowIndex, updatedAtIdx + 1).setValue(now);
  
  // Catat ke Log_Aktivitas agar catatan staf dapat diakses oleh semua pihak
  var detailLog = "Status → " + newStatus;
  if (catatanStaf) detailLog += " | Catatan: " + catatanStaf;
  if (fileBuktiUrl) detailLog += " | Bukti: " + fileBuktiUrl;
  logActivity(id, "", actorName, isAuthorized ? (email ? "Staff" : "Staf Token") : "Unknown", "STATUS_UPDATED", detailLog);
  
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
  var webAppUrl = getConfigValue("WEB_APP_FRONTEND_URL");
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
      htmlBody: htmlBody,
      name: "Layanan Pengaduan DTSL FT UGM",
      replyTo: "tsipil.ft+aspirasi@ugm.ac.id"
    });
  } catch (err) {
    Logger.log("Gagal mengirim email update status ke pengirim: " + err.toString());
  }
}

// Aksi mengajukan bantahan oleh Pengirim/Pelapor
function submitBantahanAction(params) {
  var ss = getSpreadsheet();
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
  if (data.length < 2) return { success: false, message: "Data pengaduan kosong." };
  
  var headers = data[0];
  var idIdx = findCol(headers, "ID_Pengaduan");
  var tokenIdx = findCol(headers, "Token");
  var katIdx = findCol(headers, "Kategori_Layanan");
  var namaIdx = findCol(headers, "Nama_Pengirim");
  var statusProgressIdx = findCol(headers, "Status_Progress");
  var catatanBantahanIdx = findCol(headers, "Catatan_Bantahan");
  var fileBantahanUrlIdx = findCol(headers, "File_Bantahan_URL");
  var updatedAtIdx = findCol(headers, "Updated_At");
  
  if (idIdx === -1 || tokenIdx === -1 || katIdx === -1 || namaIdx === -1 || statusProgressIdx === -1 || catatanBantahanIdx === -1 || fileBantahanUrlIdx === -1 || updatedAtIdx === -1) {
    return { success: false, message: "Struktur kolom pengaduan tidak valid." };
  }
  
  var rowIndex = -1;
  var rowData = null;
  for (var i = 1; i < data.length; i++) {
    if (data[i][idIdx] === id) {
      rowIndex = i + 1;
      rowData = data[i];
      break;
    }
  }
  
  if (rowIndex === -1) {
    return { success: false, message: "Data pengaduan tidak ditemukan." };
  }
  
  var dbToken = rowData[tokenIdx];
  var dbKategori = rowData[katIdx];
  var namaPengirim = rowData[namaIdx];
  
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
  
  // Update data baris spreadsheet menggunakan indeks berbasis-1
  sheet.getRange(rowIndex, statusProgressIdx + 1).setValue("Bantahan");
  sheet.getRange(rowIndex, catatanBantahanIdx + 1).setValue(catatanBantahan);
  sheet.getRange(rowIndex, fileBantahanUrlIdx + 1).setValue(fileBantahanUrl);
  sheet.getRange(rowIndex, updatedAtIdx + 1).setValue(now);
  
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
  var webAppUrl = getConfigValue("WEB_APP_FRONTEND_URL");
  var adminLink = webAppUrl + "/admin.html?id=" + id; // Dashboard link
  
  var subject = "[URGENT - BANTAHAN PELAPOR] Pengaduan " + id + " Dibantah";
  
  var htmlBody = "<h3>Pemberitahuan Mendesak (Bantahan Pelapor)</h3>" +
    "<p>Pelapor atas nama <b>" + namaPengirim + "</b> mengajukan bantahan/sanggahan atas penyelesaian pengaduan dengan ID: <b>" + id + "</b> (Bagian: <b>" + kategori + "</b>).</p>" +
    "<p><b>Alasan Sanggahan Pelapor:</b></p>" +
    "<blockquote style='border-left: 4px solid #e76f51; padding-left: 10px; margin-left: 10px; color: #b23b3b; font-weight: bold;'>" + alasanBantahan + "</blockquote>";
    
  if (fileBantahanUrl) {
    htmlBody += "<p><b>Berkas Bukti Bantahan Pelapor:</b> <a href='" + fileBantahanUrl + "'>Buka Lampiran Bukti Bantahan</a></p>";
  }
  
  htmlBody += "<p>Staf yang bertanggung jawab dan Supervisor wajib meninjau kembali laporan ini untuk mencegah adanya pemalsuan data. Silakan akses dashboard untuk menanggapi:</p>" +
    "<p><a href='" + adminLink + "' style='background-color: #e76f51; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;'>Buka Portal Admin</a></p><br>" +
    "<p>Salam,<br><b>Sistem Pengaduan DTSL FT UGM</b></p>";
    
  // 1. Kirim ke Staf terkait
  var staffEmails = getStaffEmails(kategori);
  if (staffEmails.length > 0) {
    try {
      MailApp.sendEmail({
        to: staffEmails.join(","),
        subject: subject,
        htmlBody: htmlBody,
        name: "Layanan Pengaduan DTSL FT UGM",
        replyTo: "tsipil.ft+aspirasi@ugm.ac.id"
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
        htmlBody: htmlBody,
        name: "Layanan Pengaduan DTSL FT UGM",
        replyTo: "tsipil.ft+aspirasi@ugm.ac.id"
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
    } else if (action === "get_work_orders") {
      result = getWorkOrdersAction(e.parameter);
    } else if (action === "get_activity_log") {
      result = getActivityLogAction(e.parameter);
    } else if (action === "get_staff_list") {
      result = getStaffListAction(e.parameter);
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

// Aksi GET: Mengambil riwayat aktivitas (Log_Aktivitas) untuk satu ADU_ID
function getActivityLogAction(params) {
  var email    = params.email;
  var password = params.password;
  var aduId    = params.aduId;

  if (!email || !password) return { success: false, message: "Autentikasi diperlukan." };
  if (!aduId)              return { success: false, message: "aduId wajib diisi." };

  var auth = authenticateUser(email, password, "");
  if (!auth.authorized) return { success: false, message: "Kredensial tidak valid." };

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName("Log_Aktivitas");
  if (!sheet) return { success: false, message: "Sheet Log_Aktivitas tidak ditemukan." };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, data: [] };

  var headers   = data[0];
  var logIdIdx  = findCol(headers, "Log_ID");
  var aduIdx    = findCol(headers, "ADU_ID");
  var woIdx     = findCol(headers, "WO_ID");
  var tsIdx     = findCol(headers, "Timestamp");
  var aktorIdx  = findCol(headers, "Aktor");
  var peranIdx  = findCol(headers, "Peran");
  var aksiIdx   = findCol(headers, "Aksi");
  var detailIdx = findCol(headers, "Detail");

  // Tipe aksi yang relevan untuk ditampilkan di dashboard (bukan aksi teknis internal)
  var userFacingActions = {
    "STATUS_UPDATED":    true,
    "WO_STARTED":        true,
    "WO_COMPLETED":      true,
    "ADU_AUTO_COMPLETED":true,
    "WO_CREATED":        true,
    "BANTAHAN":          true
  };

  var logs = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[aduIdx] !== aduId) continue;
    var aksi = row[aksiIdx];
    if (!userFacingActions[aksi]) continue;

    logs.push({
      logId:     row[logIdIdx],
      woId:      row[woIdx]     || "",
      timestamp: row[tsIdx],
      aktor:     row[aktorIdx]  || "-",
      peran:     row[peranIdx]  || "-",
      aksi:      aksi,
      detail:    row[detailIdx] || ""
    });
  }

  // Urutkan dari yang terbaru
  logs.sort(function(a, b) {
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  return { success: true, data: logs };
}

// Aksi GET: Mengambil status detail untuk Pengirim
function getStatusAction(params) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Pengaduan");
  if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
  
  var id = params.id;
  var token = params.token;
  
  if (!id) return { success: false, message: "ID Laporan wajib diisi." };
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: false, message: "Data pengaduan kosong." };
  
  var headers = data[0];
  var idIdx = findCol(headers, "ID_Pengaduan");
  if (idIdx === -1) return { success: false, message: "Struktur kolom pengaduan tidak valid." };
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][idIdx] === id) {
      var row = data[i];
      // Jika token dikirimkan, verifikasi kecocokannya untuk data pelapor
      var tokenIdx = findCol(headers, "Token");
      if (token && (tokenIdx === -1 || row[tokenIdx] !== token)) {
        return { success: false, message: "Token pelacakan tidak valid." };
      }
      
      return {
        success: true,
        data: {
          id: row[idIdx],
          timestamp: row[findCol(headers, "Timestamp")],
          nama: row[findCol(headers, "Nama_Pengirim")],
          statusPengirim: row[findCol(headers, "Status_Pengirim")],
          email: row[findCol(headers, "Email_Pengirim")],
          noHp: row[findCol(headers, "No_HP_Pengirim")],
          kategori: row[findCol(headers, "Kategori_Layanan")],
          isi: row[findCol(headers, "Isi_Laporan")],
          fileLampiranUrl: row[findCol(headers, "File_Lampiran_URL")],
          statusProgress: row[findCol(headers, "Status_Progress")],
          catatanStaf: row[findCol(headers, "Catatan_Staf")],
          fileBuktiStafUrl: row[findCol(headers, "File_Bukti_Staf_URL")],
          catatanBantahan: row[findCol(headers, "Catatan_Bantahan")],
          fileBantahanUrl: row[findCol(headers, "File_Bantahan_URL")],
          createdAt: row[findCol(headers, "Timestamp")],
          updatedAt: row[findCol(headers, "Updated_At")]
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
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Pengaduan");
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: false, message: "Data pengaduan kosong." };
    
    var headers = data[0];
    var idIdx = findCol(headers, "ID_Pengaduan");
    var tokenIdx = findCol(headers, "Token");
    if (idIdx === -1 || tokenIdx === -1) return { success: false, message: "Struktur kolom tidak valid." };
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][idIdx] === id && data[i][tokenIdx] === token) {
        var row = data[i];
        return {
          success: true,
          type: "token",
          user: {
            nama: "Staf Layanan",
            role: "Staff",
            kategori: row[findCol(headers, "Kategori_Layanan")]
          },
          data: {
            id: row[idIdx],
            timestamp: row[findCol(headers, "Timestamp")],
            nama: row[findCol(headers, "Nama_Pengirim")],
            statusPengirim: row[findCol(headers, "Status_Pengirim")],
            email: row[findCol(headers, "Email_Pengirim")],
            noHp: row[findCol(headers, "No_HP_Pengirim")],
            kategori: row[findCol(headers, "Kategori_Layanan")],
            isi: row[findCol(headers, "Isi_Laporan")],
            fileLampiranUrl: row[findCol(headers, "File_Lampiran_URL")],
            statusProgress: row[findCol(headers, "Status_Progress")],
            catatanStaf: row[findCol(headers, "Catatan_Staf")],
            fileBuktiStafUrl: row[findCol(headers, "File_Bukti_Staf_URL")],
            catatanBantahan: row[findCol(headers, "Catatan_Bantahan")],
            fileBantahanUrl: row[findCol(headers, "File_Bantahan_URL")]
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
  
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Pengaduan");
  if (!sheet) return { success: false, message: "Sheet Pengaduan tidak ditemukan." };
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, data: [] };
  
  var headers = data[0];
  var idIdx = findCol(headers, "ID_Pengaduan");
  var tsIdx = findCol(headers, "Timestamp");
  var namaIdx = findCol(headers, "Nama_Pengirim");
  var stPengirimIdx = findCol(headers, "Status_Pengirim");
  var emailIdx = findCol(headers, "Email_Pengirim");
  var hpIdx = findCol(headers, "No_HP_Pengirim");
  var katIdx = findCol(headers, "Kategori_Layanan");
  var isiIdx = findCol(headers, "Isi_Laporan");
  var lampiranIdx = findCol(headers, "File_Lampiran_URL");
  var stProgIdx = findCol(headers, "Status_Progress");
  var catStafIdx = findCol(headers, "Catatan_Staf");
  var bktStafIdx = findCol(headers, "File_Bukti_Staf_URL");
  var catBantahIdx = findCol(headers, "Catatan_Bantahan");
  var fileBantahIdx = findCol(headers, "File_Bantahan_URL");
  var tokenIdx = findCol(headers, "Token");
  var createdIdx = findCol(headers, "Timestamp");
  var updatedIdx = findCol(headers, "Updated_At");
  
  var list = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var kategoriAduan = row[katIdx];
    
    // Filter berdasarkan role: Staf hanya melihat kategori mereka, Supervisor melihat semua
    if (auth.role === "Supervisor" || (auth.role === "Staff" && auth.kategori === kategoriAduan)) {
      list.push({
        id: row[idIdx],
        timestamp: row[tsIdx],
        nama: row[namaIdx],
        statusPengirim: row[stPengirimIdx],
        email: row[emailIdx],
        noHp: row[hpIdx],
        kategori: row[katIdx],
        isi: row[isiIdx],
        fileLampiranUrl: row[lampiranIdx],
        statusProgress: row[stProgIdx],
        catatanStaf: row[catStafIdx],
        fileBuktiStafUrl: row[bktStafIdx],
        catatanBantahan: row[catBantahIdx],
        fileBantahanUrl: row[fileBantahIdx],
        token: row[tokenIdx], // Staf boleh melihat token untuk debugging/link
        createdAt: row[createdIdx],
        updatedAt: row[updatedIdx]
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
  
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Pengaduan");
  if (!sheet) return { success: false, message: "Sheet Pengaduan tidak ditemukan." };
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, data: { totalReports: 0, statusStats: {}, categoryStats: {}, avgResolutionDaysGlobal: "0.0", avgResolutionDaysPerCategory: {}, negligentReports: [] } };
  
  var headers = data[0];
  var idIdx = findCol(headers, "ID_Pengaduan");
  var tsIdx = findCol(headers, "Timestamp");
  var namaIdx = findCol(headers, "Nama_Pengirim");
  var stProgIdx = findCol(headers, "Status_Progress");
  var katIdx = findCol(headers, "Kategori_Layanan");
  var updatedIdx = findCol(headers, "Updated_At");
  
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
    var id = row[idIdx];
    var ts = new Date(row[tsIdx]);
    var status = row[stProgIdx];
    var kategori = row[katIdx];
    var updated = new Date(row[updatedIdx]);
    
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
        nama: row[namaIdx],
        kategori: kategori,
        timestamp: row[tsIdx],
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
      negligentReports: kelalaianStaf,
      woStats: getWOStats_()
    }
  };
}

// Helper: Mengambil statistik Work Order untuk Laporan Kinerja
function getWOStats_() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("WorkOrder");
    if (!sheet) return null;
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { total: 0, open: 0, diproses: 0, selesai: 0, avgDurasiMenit: 0 };
    
    var headers = data[0];
    var statIdx = findCol(headers, "Status_WO");
    var durIdx  = findCol(headers, "Durasi_Aktif_Menit");
    
    var total = 0, open = 0, diproses = 0, selesai = 0;
    var totalDurasi = 0, countDurasi = 0;
    
    for (var i = 1; i < data.length; i++) {
      if (!data[i][findCol(headers, "WO_ID")]) continue;
      total++;
      var st = data[i][statIdx];
      if (st === "Open")     open++;
      if (st === "Diproses") diproses++;
      if (st === "Selesai")  selesai++;
      
      var dur = parseFloat(data[i][durIdx]);
      if (!isNaN(dur) && dur > 0) {
        totalDurasi += dur;
        countDurasi++;
      }
    }
    
    return {
      total: total,
      open: open,
      diproses: diproses,
      selesai: selesai,
      avgDurasiMenit: countDurasi > 0 ? Math.round(totalDurasi / countDurasi) : 0
    };
  } catch (e) {
    Logger.log("getWOStats_ error: " + e.toString());
    return null;
  }
}

// ==========================================
// FASE 2: WORK ORDER & DISPATCH LAYER LOGIC
// ==========================================

// Helper: Mencatat aktivitas ke sheet Log_Aktivitas
function logActivity(aduId, woId, aktor, peran, aksi, detail) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Log_Aktivitas");
  if (!sheet) return false;
  
  var timestamp = new Date();
  var logId = "LOG-" + Utilities.formatDate(timestamp, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
  var detailStr = typeof detail === 'object' ? JSON.stringify(detail) : detail;
  
  var headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  var newRow = new Array(headers.length);
  for (var i = 0; i < newRow.length; i++) newRow[i] = "";
  
  var setVal = function(colName, val) {
    var idx = findCol(headers, colName);
    if (idx !== -1) newRow[idx] = val;
  };
  
  setVal("Log_ID", logId);
  setVal("ADU_ID", aduId || "");
  setVal("WO_ID", woId || "");
  setVal("Timestamp", timestamp);
  setVal("Aktor", aktor || "System");
  setVal("Peran", peran || "System");
  setVal("Aksi", aksi);
  setVal("Detail", detailStr || "");
  
  sheet.appendRow(newRow);
  return true;
}

// Helper: Mengirim Notifikasi ke Pekerja
function sendWorkerNotification(woId, aduId, deskripsi, prioritas, assigneeEmail) {
  var webAppUrl = getConfigValue("WEB_APP_FRONTEND_URL");
  var adminLink = webAppUrl + "/admin.html";
  
  var subject = "[TUGAS BARU] Work Order " + woId + " - Prioritas: " + prioritas;
  var htmlBody = `
    <h2>Penugasan Baru: ${woId}</h2>
    <p>Anda telah ditugaskan untuk menyelesaikan pengaduan <strong>${aduId}</strong>.</p>
    <p><strong>Deskripsi Tugas:</strong> ${deskripsi}</p>
    <p><strong>Tingkat Prioritas:</strong> ${prioritas}</p>
    <br>
    <p>Silakan login ke <a href="${adminLink}">Portal Staf</a> untuk melihat detail lebih lanjut.</p>
  `;
  
  try {
    MailApp.sendEmail({
      to: assigneeEmail,
      subject: subject,
      htmlBody: htmlBody,
      name: "Sistem Manajemen Penugasan DTSL",
      replyTo: "tsipil.ft+aspirasi@ugm.ac.id"
    });
  } catch (err) {
    Logger.log("Gagal mengirim email ke worker: " + err.toString());
  }
}

// Aksi POST: Membuat Work Order
function createWorkOrderAction(params) {
  var ss = getSpreadsheet();
  var sheetWO = ss.getSheetByName("WorkOrder");
  var sheetAduan = ss.getSheetByName("Pengaduan");
  
  if (!sheetWO || !sheetAduan) return { success: false, message: "Sheet tidak ditemukan." };
  
  var auth = authenticateUser(params.email, params.password, "");
  if (!auth.authorized) return { success: false, message: "Akses ditolak. Kredensial tidak valid." };
  if (auth.role !== "Supervisor" && auth.role !== "Staff") {
    return { success: false, message: "Akses ditolak. Peran Anda tidak diizinkan." };
  }
  
  var aduId = params.aduId;
  var kategori = params.kategori;
  var lokasi = params.lokasi || "";
  var assigneeEmail = params.assigneeEmail;
  var deskripsi = params.deskripsi;
  var prioritas = parseInt(params.prioritas) || 1;
  
  var timestamp = new Date();
  var woId = "WO-" + Utilities.formatDate(timestamp, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
  
  // Tulis ke WorkOrder
  var headers = sheetWO.getRange(1, 1, 1, Math.max(1, sheetWO.getLastColumn())).getValues()[0];
  var newRow = new Array(headers.length);
  for (var i = 0; i < newRow.length; i++) newRow[i] = "";
  
  var setValWO = function(colName, val) {
    var idx = findCol(headers, colName);
    if (idx !== -1) newRow[idx] = val;
  };
  
  setValWO("WO_ID", woId);
  setValWO("ADU_ID", aduId);
  setValWO("Kategori", kategori);
  setValWO("Lokasi", lokasi);
  setValWO("Deskripsi", deskripsi);
  setValWO("Prioritas", prioritas);
  setValWO("Assignee_Email", assigneeEmail);
  setValWO("Status_WO", "Open");
  setValWO("Waktu_Mulai", "");
  setValWO("Waktu_Selesai", "");
  setValWO("Durasi_Aktif_Menit", 0);
  setValWO("Catatan_Progress", "");
  setValWO("File_Bukti_URL", "");
  setValWO("Created_At", timestamp);
  setValWO("Updated_At", timestamp);
  
  sheetWO.appendRow(newRow);
  
  // Update Pengaduan (Status jadi Diproses/Ditugaskan, concat WO_ID)
  var aduData = sheetAduan.getDataRange().getValues();
  var aduHeaders = aduData[0];
  var aduIdIdx = findCol(aduHeaders, "ID_Pengaduan");
  var stProgIdx = findCol(aduHeaders, "Status_Progress");
  var woIdIdx = findCol(aduHeaders, "WO_ID");
  var catSpvIdx = findCol(aduHeaders, "Catatan_Supervisor");
  var tsIdx = findCol(aduHeaders, "Updated_At");
  
  for (var i = 1; i < aduData.length; i++) {
    if (aduData[i][aduIdIdx] === aduId) {
      if (stProgIdx !== -1) {
        var currentStatus = aduData[i][stProgIdx];
        if (currentStatus === "Pending") {
            sheetAduan.getRange(i + 1, stProgIdx + 1).setValue("Diproses");
        }
      }
      if (woIdIdx !== -1) {
        var existingWos = aduData[i][woIdIdx];
        var newWoIds = existingWos ? existingWos + "," + woId : woId;
        sheetAduan.getRange(i + 1, woIdIdx + 1).setValue(newWoIds);
      }
      if (catSpvIdx !== -1 && params.catatanSupervisor) {
        sheetAduan.getRange(i + 1, catSpvIdx + 1).setValue(params.catatanSupervisor);
      }
      if (tsIdx !== -1) sheetAduan.getRange(i + 1, tsIdx + 1).setValue(timestamp);
      break;
    }
  }
  
  // Log & Notify
  logActivity(aduId, woId, auth.email, auth.role, "WO_CREATED", { assignee: assigneeEmail, prioritas: prioritas });
  sendWorkerNotification(woId, aduId, deskripsi, prioritas, assigneeEmail);
  
  return { success: true, message: "Work Order berhasil dibuat." };
}

// Aksi GET: Mengambil daftar Work Order
function getWorkOrdersAction(params) {
  var id = params.id; 
  var email = params.email;
  var password = params.password;
  
  var auth = authenticateUser(email, password, "");
  if (!auth.authorized) return { success: false, message: "Akses ditolak." };
  
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("WorkOrder");
  if (!sheet) return { success: false, message: "Sheet WorkOrder tidak ada." };
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, data: [] };
  
  var headers = data[0];
  var list = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var woAssignee = row[findCol(headers, "Assignee_Email")];
    var rowKat = row[findCol(headers, "Kategori")];
    var woAduId = row[findCol(headers, "ADU_ID")];
    
    if (id && woAduId !== id) continue;
    
    // Auth filter: Supervisor all, Staff sees their own or their category
    if (auth.role === "Supervisor" || (auth.role === "Staff" && (woAssignee === auth.email || rowKat === auth.kategori))) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        obj[headers[j]] = row[j];
      }
      list.push(obj);
    }
  }
  
  return { success: true, data: list };
}

// Aksi POST: Memperbarui Prioritas Work Order secara masal (bulk)
function updateWOPriorityAction(params) {
  var email = params.email;
  var password = params.password;
  var updates = params.updates; // array of {woId, prioritas}
  
  var auth = authenticateUser(email, password, "");
  if (!auth.authorized) return { success: false, message: "Akses ditolak." };
  
  if (!updates || !Array.isArray(updates)) {
    return { success: false, message: "Data updates tidak valid." };
  }
  
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("WorkOrder");
  if (!sheet) return { success: false, message: "Sheet WorkOrder tidak ada." };
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: false, message: "Data kosong." };
  
  var headers = data[0];
  var woIdIdx = findCol(headers, "WO_ID");
  var prioIdx = findCol(headers, "Prioritas");
  var assigneeIdx = findCol(headers, "Assignee_Email");
  var katIdx = findCol(headers, "Kategori");
  
  var updatedCount = 0;
  
  for (var i = 0; i < updates.length; i++) {
    var update = updates[i];
    for (var j = 1; j < data.length; j++) {
      if (data[j][woIdIdx] === update.woId) {
        // Validasi otoritas: Supervisor boleh semua. PIC boleh miliknya atau divisinya.
        var rowAssignee = data[j][assigneeIdx];
        var rowKat = data[j][katIdx];
        
        if (auth.role === "Supervisor" || 
           (auth.role === "Staff" && (rowAssignee === auth.email || rowKat === auth.kategori))) {
             sheet.getRange(j + 1, prioIdx + 1).setValue(update.prioritas);
             updatedCount++;
        }
        break;
      }
    }
  }
  
  // Log activity
  if (updatedCount > 0) {
    logActivity("BULK", "MULTIPLE", auth.email, auth.role, "UPDATE_PRIORITY", "Berhasil update prioritas " + updatedCount + " Work Order.");
  }
  
  return { success: true, message: "Berhasil update prioritas " + updatedCount + " Work Order." };
}

// Aksi POST: PIC mulai mengerjakan WO
function startWorkOrderAction(params) {
  var email = params.email;
  var password = params.password;
  var woId = params.woId;
  
  var auth = authenticateUser(email, password, "");
  if (!auth.authorized) return { success: false, message: "Akses ditolak." };
  
  var ss = getSpreadsheet();
  var sheetWO = ss.getSheetByName("WorkOrder");
  var sheetAdu = ss.getSheetByName("Pengaduan");
  
  var woData = sheetWO.getDataRange().getValues();
  var woHeaders = woData[0];
  var wIdIdx = findCol(woHeaders, "WO_ID");
  var wStatIdx = findCol(woHeaders, "Status_WO");
  var wStartIdx = findCol(woHeaders, "Waktu_Mulai");
  var wUpdIdx = findCol(woHeaders, "Updated_At");
  var wAduIdx = findCol(woHeaders, "ADU_ID");
  var wAssigneeIdx = findCol(woHeaders, "Assignee_Email");
  
  var targetAduId = null;
  var timestamp = new Date();
  
  for (var i = 1; i < woData.length; i++) {
    if (woData[i][wIdIdx] === woId) {
      if (woData[i][wAssigneeIdx] !== auth.email && auth.role !== "Supervisor") {
        return { success: false, message: "Anda bukan PIC untuk WO ini." };
      }
      
      sheetWO.getRange(i + 1, wStatIdx + 1).setValue("Diproses");
      sheetWO.getRange(i + 1, wStartIdx + 1).setValue(timestamp);
      sheetWO.getRange(i + 1, wUpdIdx + 1).setValue(timestamp);
      targetAduId = woData[i][wAduIdx];
      break;
    }
  }
  
  if (!targetAduId) return { success: false, message: "WO tidak ditemukan." };
  
  // Sinkronisasi status Pengaduan induk jika masih Pending
  var aduData = sheetAdu.getDataRange().getValues();
  var aIdIdx = findCol(aduData[0], "ID_Pengaduan");
  var aStatIdx = findCol(aduData[0], "Status_Progress");
  
  for (var j = 1; j < aduData.length; j++) {
    if (aduData[j][aIdIdx] === targetAduId) {
      if (aduData[j][aStatIdx] === "Pending") {
        sheetAdu.getRange(j + 1, aStatIdx + 1).setValue("Diproses");
      }
      break;
    }
  }
  
  logActivity(targetAduId, woId, auth.email, auth.role, "WO_STARTED", "PIC mulai mengerjakan.");
  
  return { success: true, message: "Work Order dimulai." };
}

// Aksi POST: PIC menyelesaikan WO beserta bukti
function completeWorkOrderAction(params) {
  var email = params.email;
  var password = params.password;
  var woId = params.woId;
  var catatan = params.catatanProgress;
  
  var auth = authenticateUser(email, password, "");
  if (!auth.authorized) return { success: false, message: "Akses ditolak." };
  
  var ss = getSpreadsheet();
  var sheetWO = ss.getSheetByName("WorkOrder");
  var sheetAdu = ss.getSheetByName("Pengaduan");
  
  var fileUrl = params.fileLinkUrl || "";
  if (params.fileData && params.fileName && params.fileMimeType) {
    var folderId = getConfigValue("DRIVE_FOLDER_ID");
    var folder = DriveApp.getFolderById(folderId);
    var blob = Utilities.newBlob(Utilities.base64Decode(params.fileData.split(',')[1]), params.fileMimeType, params.fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    fileUrl = file.getUrl();
  }
  
  var woData = sheetWO.getDataRange().getValues();
  var woHeaders = woData[0];
  var wIdIdx = findCol(woHeaders, "WO_ID");
  var wStatIdx = findCol(woHeaders, "Status_WO");
  var wEndIdx = findCol(woHeaders, "Waktu_Selesai");
  var wStartIdx = findCol(woHeaders, "Waktu_Mulai");
  var wDurIdx = findCol(woHeaders, "Durasi_Aktif_Menit");
  var wCatIdx = findCol(woHeaders, "Catatan_Progress");
  var wFileIdx = findCol(woHeaders, "File_Bukti_URL");
  var wUpdIdx = findCol(woHeaders, "Updated_At");
  var wAduIdx = findCol(woHeaders, "ADU_ID");
  var wAssigneeIdx = findCol(woHeaders, "Assignee_Email");
  
  var targetAduId = null;
  var timestamp = new Date();
  
  for (var i = 1; i < woData.length; i++) {
    if (woData[i][wIdIdx] === woId) {
      if (woData[i][wAssigneeIdx] !== auth.email && auth.role !== "Supervisor") {
        return { success: false, message: "Anda bukan PIC untuk WO ini." };
      }
      
      var startTime = new Date(woData[i][wStartIdx]);
      var durasiMenit = 0;
      if (!isNaN(startTime.getTime())) {
        durasiMenit = Math.round((timestamp.getTime() - startTime.getTime()) / 60000);
      }
      
      sheetWO.getRange(i + 1, wStatIdx + 1).setValue("Selesai");
      sheetWO.getRange(i + 1, wEndIdx + 1).setValue(timestamp);
      sheetWO.getRange(i + 1, wDurIdx + 1).setValue(durasiMenit);
      sheetWO.getRange(i + 1, wCatIdx + 1).setValue(catatan);
      sheetWO.getRange(i + 1, wFileIdx + 1).setValue(fileUrl);
      sheetWO.getRange(i + 1, wUpdIdx + 1).setValue(timestamp);
      
      targetAduId = woData[i][wAduIdx];
      // update memory untuk pengecekan isAllCompleted di bawah
      woData[i][wStatIdx] = "Selesai"; 
      break;
    }
  }
  
  if (!targetAduId) return { success: false, message: "WO tidak ditemukan." };
  
  logActivity(targetAduId, woId, auth.email, auth.role, "WO_COMPLETED", "Diselesaikan. Catatan: " + catatan);
  
  // Sinkronisasi status Pengaduan utama
  var isAllCompleted = true;
  for (var k = 1; k < woData.length; k++) {
    if (woData[k][wAduIdx] === targetAduId && woData[k][wStatIdx] !== "Selesai") {
      isAllCompleted = false;
      break;
    }
  }

  if (isAllCompleted) {
    var aduData = sheetAdu.getDataRange().getValues();
    var aIdIdx = findCol(aduData[0], "ID_Pengaduan");
    var aStatIdx = findCol(aduData[0], "Status_Progress");
    var aTsIdx = findCol(aduData[0], "Updated_At");
    var aCatStafIdx = findCol(aduData[0], "Catatan_Staf");
    
    for (var j = 1; j < aduData.length; j++) {
      if (aduData[j][aIdIdx] === targetAduId) {
        sheetAdu.getRange(j + 1, aStatIdx + 1).setValue("Selesai");
        sheetAdu.getRange(j + 1, aTsIdx + 1).setValue(timestamp);
        
        // Gabungkan catatan-catatan WO menjadi catatan staf final jika masih kosong
        var finalCatatan = aduData[j][aCatStafIdx];
        if (!finalCatatan) {
          finalCatatan = "Pengerjaan Work Order telah diselesaikan dengan catatan berikut:\n- " + catatan;
          sheetAdu.getRange(j + 1, aCatStafIdx + 1).setValue(finalCatatan);
        }
        
        logActivity(targetAduId, "", "System", "System", "ADU_AUTO_COMPLETED", "Semua WO telah selesai.");
        
        var emailUser = aduData[j][findCol(aduData[0], "Email_Pengirim")];
        var pelapor = aduData[j][findCol(aduData[0], "Nama_Pengirim")];
        sendStatusUpdateEmail(emailUser, pelapor, targetAduId, "Selesai", finalCatatan);
        break;
      }
    }
  }
  
  return { success: true, message: "Work Order diselesaikan." };
}

// Aksi GET: Mengambil daftar staf untuk dropdown Assignee
function getStaffListAction(params) {
  var email = params.email;
  var password = params.password;
  var kategori = params.kategori;
  
  var auth = authenticateUser(email, password, "");
  if (!auth.authorized || auth.role !== "Supervisor") {
    return { success: false, message: "Akses ditolak. Hanya Supervisor yang dapat melihat daftar staf." };
  }
  
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Users");
  if (!sheet) return { success: false, message: "Sheet Users tidak ditemukan." };
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, data: [] };
  
  var headers = data[0];
  var emailIdx = findCol(headers, "Email");
  var namaIdx = findCol(headers, "Nama");
  var roleIdx = findCol(headers, "Role");
  var katIdx = findCol(headers, "Kategori_Layanan");
  
  var staffList = [];
  for (var i = 1; i < data.length; i++) {
    var rowRole = data[i][roleIdx];
    var rowKat = data[i][katIdx];
    
    // Memasukkan Staf yang kategorinya cocok
    if (rowRole === "Staff" && (!kategori || rowKat === kategori)) {
      staffList.push({
        email: data[i][emailIdx],
        nama: data[i][namaIdx]
      });
    }
  }
  
  return { success: true, data: staffList };
}
