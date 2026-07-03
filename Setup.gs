/**
 * Script untuk inisialisasi awal database (Google Spreadsheet)
 * Sistem Pengaduan, Kritik, dan Saran DTSL FT UGM
 */

// Konfigurasi Spreadsheet ID (Wajib jika script unbound / tidak melekat langsung pada Spreadsheet)
var SPREADSHEET_ID = "10S7RpwfsuA-Jf9ddy-GSEMoUGBYzhbQjxbIV7FvfxoY";

function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "") {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
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
    "Created_At",
    "Updated_At"
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
    // Pastikan header ada dan sesuai
    var currentHeaders = sheetPengaduan.getRange(1, 1, 1, sheetPengaduan.getLastColumn()).getValues()[0];
    if (currentHeaders.length === 0 || currentHeaders[0] === "") {
      sheetPengaduan.getRange(1, 1, 1, headersPengaduan.length).setValues([headersPengaduan]);
      sheetPengaduan.getRange(1, 1, 1, headersPengaduan.length)
        .setBackground("#0d233a")
        .setFontColor("#ffffff")
        .setFontWeight("bold");
      sheetPengaduan.setFrozenRows(1);
    }
  }

  // 2. Setup Sheet: Users
  var sheetUsers = ss.getSheetByName("Users");
  var headersUsers = ["Email", "Password", "Nama", "Role", "Kategori_Layanan"];
  
  if (!sheetUsers) {
    sheetUsers = ss.insertSheet("Users");
    sheetUsers.appendRow(headersUsers);
    sheetUsers.getRange(1, 1, 1, headersUsers.length)
      .setBackground("#0d233a")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sheetUsers.setFrozenRows(1);
    
    // Isi data user dummy awal
    var dummyUsers = [
      ["supervisor@mail.ugm.ac.id", "dtslugm123", "Supervisor DTSL", "Supervisor", ""],
      ["sarpras@mail.ugm.ac.id", "sarpras123", "Staf Sarpras", "Staff", "Layanan Sarana Prasarana"],
      ["keuangan@mail.ugm.ac.id", "keuangan123", "Staf Keuangan", "Staff", "Layanan Keuangan"],
      ["penelitian@mail.ugm.ac.id", "penelitian123", "Staf Penelitian", "Staff", "Layanan Penelitian dan PKM"],
      ["lab@mail.ugm.ac.id", "lab123", "Staf Lab", "Staff", "Layanan Laboratorium"],
      ["it@mail.ugm.ac.id", "it123", "Staf IT", "Staff", "Layanan IT"],
      ["lainnya@mail.ugm.ac.id", "lainnya123", "Staf Lainnya", "Staff", "Layanan lainnya"]
    ];
    sheetUsers.getRange(2, 1, dummyUsers.length, headersUsers.length).setValues(dummyUsers);
  }

  // 3. Setup Sheet: Config
  var sheetConfig = ss.getSheetByName("Config");
  var headersConfig = ["Key", "Value"];
  
  if (!sheetConfig) {
    sheetConfig = ss.insertSheet("Config");
    sheetConfig.appendRow(headersConfig);
    sheetConfig.getRange(1, 1, 1, headersConfig.length)
      .setBackground("#0d233a")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sheetConfig.setFrozenRows(1);
    
    var defaultConfig = [
      ["SPREADSHEET_ID", ss.getId()],
      ["DRIVE_FOLDER_ID", "130L5otw9zty44KE2e4g7jMQtU0IGssFi"],
      ["NOTIFY_SUPERVISOR_ALL", "FALSE"]
    ];
    sheetConfig.getRange(2, 1, defaultConfig.length, headersConfig.length).setValues(defaultConfig);
  }
  
  // Hapus sheet bawaan "Sheet1" jika masih kosong dan ada sheet lain
  var sheet1 = ss.getSheetByName("Sheet1");
  if (sheet1 && ss.getSheets().length > 1 && sheet1.getLastRow() === 0) {
    ss.deleteSheet(sheet1);
  }
  
  Logger.log("Database initialized successfully!");
}
