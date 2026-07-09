/**
 * Script untuk inisialisasi awal database (Google Spreadsheet)
 * Sistem Pengaduan, Kritik, dan Saran DTSL FT UGM
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

function initDatabase() {
  var ss = getSpreadsheet();
  
  // 1. Setup Sheet: Pengaduan
  var sheetPengaduan = ss.getSheetByName("Pengaduan");
  var headersPengaduan = [
    "ID_Pengaduan",
    "Timestamp",
    "Nama_Pengirim",
    "Status_Pengirim",
    "Email_Pengirim",
    "No_HP_Pengirim",
    "Kategori_Layanan",
    "Isi_Laporan",
    "File_Lampiran_URL",
    "Status_Progress",
    "Catatan_Staf",
    "File_Bukti_Staf_URL",
    "Catatan_Bantahan",
    "File_Bantahan_URL",
    "Token",
    "Updated_At",
    "Lokasi_Laporan",
    "Sub_Lokasi",
    "Prioritas",
    "Catatan_Supervisor",
    "WO_ID"
  ];
  
  if (!sheetPengaduan) {
    sheetPengaduan = ss.insertSheet("Pengaduan");
    sheetPengaduan.appendRow(headersPengaduan);
    // Format header
    sheetPengaduan.getRange(1, 1, 1, headersPengaduan.length)
      .setBackground("#0d233a")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sheetPengaduan.setFrozenRows(1);
  } else {
    // Pastikan header ada dan diupdate jika ada penambahan kolom baru
    var lastCol = sheetPengaduan.getLastColumn();
    if (lastCol === 0 || lastCol < headersPengaduan.length) {
      sheetPengaduan.getRange(1, 1, 1, headersPengaduan.length).setValues([headersPengaduan]);
      sheetPengaduan.getRange(1, 1, 1, headersPengaduan.length)
        .setBackground("#0d233a")
        .setFontColor("#ffffff")
        .setFontWeight("bold");
      sheetPengaduan.setFrozenRows(1);
    }
  }

  // 2. Setup Sheet: Users (Selalu lakukan sinkronisasi agar dummy users & staf baru terupdate)
  var sheetUsers = ss.getSheetByName("Users");
  var headersUsers = ["Email", "Password", "Nama", "Role", "Kategori_Layanan"];
  
  if (!sheetUsers) {
    sheetUsers = ss.insertSheet("Users");
  }
  
  var dummyUsers = [
    ["pathub+supervisor@gmail.com", "dtslugm123", "Supervisor DTSL", "Supervisor", ""],
    ["pathub+sarpras@gmail.com", "sarpras123", "Staf Sarpras", "Staff", "Layanan Sarana Prasarana"],
    ["pathub+keuangan@gmail.com", "keuangan123", "Staf Keuangan", "Staff", "Layanan Keuangan"],
    ["pathub+penelitian@gmail.com", "penelitian123", "Staf Penelitian", "Staff", "Layanan Penelitian dan PKM"],
    ["pathub+lab@gmail.com", "lab123", "Staf Lab", "Staff", "Layanan Laboratorium"],
    ["pathub+it@gmail.com", "it123", "Staf IT", "Staff", "Layanan IT"],
    ["pathub+akademik@gmail.com", "akademik123", "Staf Akademik", "Staff", "Layanan Akademik"],
    ["pathub+lainnya@gmail.com", "lainnya123", "Staf Lainnya", "Staff", "Layanan lainnya"]
  ];
  
  syncUsersDatabase(sheetUsers, dummyUsers, headersUsers);

  // 3. Setup Sheet: Config (Selalu lakukan sinkronisasi agar config dasar terupdate)
  var sheetConfig = ss.getSheetByName("Config");
  var headersConfig = ["Key", "Value"];
  
  if (!sheetConfig) {
    sheetConfig = ss.insertSheet("Config");
  }
  
  var defaultConfig = [
    ["SPREADSHEET_ID", ss.getId()],
    ["DRIVE_FOLDER_ID", "130L5otw9zty44KE2e4g7jMQtU0IGssFi"],
    ["NOTIFY_SUPERVISOR_ALL", "FALSE"]
  ];
  
  syncConfigDatabase(sheetConfig, defaultConfig, headersConfig);
  
  // 4. Setup Sheet: WorkOrder
  var sheetWO = ss.getSheetByName("WorkOrder");
  var headersWO = [
    "WO_ID", "ADU_ID", "Kategori", "Lokasi", "Deskripsi", "Prioritas", 
    "Assignee_Email", "Status_WO", "Waktu_Mulai", "Waktu_Selesai", 
    "Durasi_Aktif_Menit", "Catatan_Progress", "File_Bukti_URL", 
    "Created_At", "Updated_At"
  ];
  if (!sheetWO) {
    sheetWO = ss.insertSheet("WorkOrder");
    sheetWO.appendRow(headersWO);
    sheetWO.getRange(1, 1, 1, headersWO.length).setBackground("#0d233a").setFontColor("#ffffff").setFontWeight("bold");
    sheetWO.setFrozenRows(1);
  } else if (sheetWO.getLastColumn() < headersWO.length) {
    sheetWO.getRange(1, 1, 1, headersWO.length).setValues([headersWO]);
    sheetWO.getRange(1, 1, 1, headersWO.length).setBackground("#0d233a").setFontColor("#ffffff").setFontWeight("bold");
  }

  // 5. Setup Sheet: Log_Aktivitas
  var sheetLog = ss.getSheetByName("Log_Aktivitas");
  var headersLog = [
    "Log_ID", "ADU_ID", "WO_ID", "Timestamp", "Aktor", 
    "Peran", "Aksi", "Detail"
  ];
  if (!sheetLog) {
    sheetLog = ss.insertSheet("Log_Aktivitas");
    sheetLog.appendRow(headersLog);
    sheetLog.getRange(1, 1, 1, headersLog.length).setBackground("#0d233a").setFontColor("#ffffff").setFontWeight("bold");
    sheetLog.setFrozenRows(1);
  } else if (sheetLog.getLastColumn() < headersLog.length) {
    sheetLog.getRange(1, 1, 1, headersLog.length).setValues([headersLog]);
    sheetLog.getRange(1, 1, 1, headersLog.length).setBackground("#0d233a").setFontColor("#ffffff").setFontWeight("bold");
  }
  
  // Hapus sheet bawaan "Sheet1" jika masih kosong dan ada sheet lain
  var sheet1 = ss.getSheetByName("Sheet1");
  if (sheet1 && ss.getSheets().length > 1 && sheet1.getLastRow() === 0) {
    ss.deleteSheet(sheet1);
  }
  
  Logger.log("Database initialized and synchronized successfully!");
}

// Helper untuk menyinkronkan data Users tanpa menghapus data custom
function syncUsersDatabase(sheet, dummyUsers, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground("#140e4bff")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  var headersExt = data[0];
  var emailIdx = findCol(headersExt, "Email");
  if (emailIdx === -1) emailIdx = 0; // fallback
  
  var existingEmails = {};
  for (var i = 1; i < data.length; i++) {
    var email = data[i][emailIdx].toString().toLowerCase().trim();
    if (email) {
      existingEmails[email] = i + 1; // baris ke-i+1 (1-based)
    }
  }
  
  for (var j = 0; j < dummyUsers.length; j++) {
    var dummy = dummyUsers[j];
    var dummyEmail = dummy[0].toLowerCase().trim();
    
    if (existingEmails[dummyEmail]) {
      // Update data dummy yang ada agar nilainya konsisten
      var rowNum = existingEmails[dummyEmail];
      sheet.getRange(rowNum, 1, 1, dummy.length).setValues([dummy]);
    } else {
      // Tambahkan jika belum ada
      sheet.appendRow(dummy);
    }
  }
}

// Helper untuk menyinkronkan data Config
function syncConfigDatabase(sheet, defaultConfig, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground("#0d233a")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  var headersExt = data[0];
  var keyIdx = findCol(headersExt, "Key");
  if (keyIdx === -1) keyIdx = 0; // fallback
  
  var existingKeys = {};
  for (var i = 1; i < data.length; i++) {
    var key = data[i][keyIdx].toString().trim();
    if (key) {
      existingKeys[key] = i + 1; // baris ke-i+1 (1-based)
    }
  }
  
  for (var j = 0; j < defaultConfig.length; j++) {
    var config = defaultConfig[j];
    var configKey = config[0].trim();
    
    if (!existingKeys[configKey]) {
      // Tambahkan jika key belum ada
      sheet.appendRow(config);
    }
  }
}
