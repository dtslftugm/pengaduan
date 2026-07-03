/**
 * Frontend JavaScript - Sistem Pengaduan DTSL FT UGM
 * Mengatur interaksi UI, kompresi foto klien, upload retry, tracking progress, dan dashboard admin.
 */

// URL deployment Web App Google Apps Script Anda (Ganti setelah dideploy)
const API_URL = "https://script.google.com/macros/s/AKfycbziBjCYTKQv0GPxdh2J6qUPwNUhQHlot38w3wGJGQrY_UNZwWirm5DLvsft01e6HCzL/exec"; // Placeholder URL

// Global State
let uploadedFile = {
  data: "",
  mimeType: "",
  name: ""
};
let isUploadActive = true; // true = upload file, false = paste link

// Helper: Format nomor HP menjadi tautan WhatsApp clickable (https://wa.me/62...)
function formatWhatsAppLink(phoneNumber) {
  if (!phoneNumber) return "";
  let trimmed = phoneNumber.trim();
  if (trimmed === "") return "";
  
  // Jika sudah berupa tautan wa.me atau whatsapp.com, kembalikan apa adanya (atau paksa protokol https)
  if (trimmed.includes("wa.me/") || trimmed.includes("whatsapp.com/")) {
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return "https://" + trimmed;
    }
    return trimmed;
  }
  
  // Bersihkan semua karakter selain angka
  let cleaned = trimmed.replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  }
  
  if (cleaned.length > 0) {
    return "https://wa.me/" + cleaned;
  }
  return trimmed;
}

// --- Helper: Deteksi Halaman Aktif ---
const path = window.location.pathname;
const isIndexPage = document.getElementById("formAduan") !== null;
const isTrackPage = document.getElementById("formTrackSearch") !== null;
const isAdminPage = document.getElementById("formLogin") !== null || document.getElementById("formQuickUpdate") !== null;

document.addEventListener("DOMContentLoaded", () => {
  // Inisialisasi halaman berdasarkan ID form yang ada
  if (isIndexPage) initIndexPage();
  if (isTrackPage) initTrackPage();
  if (isAdminPage) initAdminPage();
});

// ==========================================
// 1. DOKUMEN & IMAGE UPLOAD & COMPRESSION
// ==========================================

// Helper: Kompres gambar menggunakan Canvas (Sisi Klien)
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        // Limit resolusi maksimal (lebar/tinggi 1200px)
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height *= maxDim / width;
            width = maxDim;
          } else {
            width *= maxDim / height;
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Kompres dengan quality 0.7 (70%)
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
        resolve(compressedBase64);
      };
    };
  });
}

// Helper: Membaca file non-gambar langsung ke Base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

// Handler Pemrosesan File Masuk
async function handleFileProcess(file, progressBarId, progressContainerId, statusTextId, retryBtnId) {
  const container = document.getElementById(progressContainerId);
  const bar = document.getElementById(progressBarId);
  const text = document.getElementById(statusTextId);
  const retry = document.getElementById(retryBtnId);

  if (!file) return;

  // Validasi ukuran berkas (3 MB max)
  const maxBytes = 3 * 1024 * 1024;
  if (file.size > maxBytes) {
    alert("Ukuran berkas melebihi batas maksimal 3MB. Silakan kompres berkas Anda terlebih dahulu.");
    return;
  }

  // Tampilkan visual
  container.style.display = "block";
  text.style.display = "flex";
  text.querySelector("span").textContent = "Membaca berkas...";
  bar.style.width = "20%";
  retry.style.display = "none";

  try {
    uploadedFile.name = file.name;
    uploadedFile.mimeType = file.type;

    // Jika file adalah gambar, kompres di client
    if (file.type.startsWith("image/")) {
      text.querySelector("span").textContent = "Mengompresi gambar...";
      bar.style.width = "50%";
      uploadedFile.data = await compressImage(file);
    } else {
      // Baca langsung
      bar.style.width = "70%";
      uploadedFile.data = await fileToBase64(file);
    }

    bar.style.width = "100%";
    text.querySelector("span").textContent = `Selesai: ${file.name} (Siap dikirim)`;
  } catch (err) {
    console.error(err);
    bar.style.backgroundColor = "var(--danger)";
    text.querySelector("span").textContent = "Gagal memproses berkas.";
    retry.style.display = "block";

    // Simpan file asli sebagai backup untuk retry
    retry.onclick = () => handleFileProcess(file, progressBarId, progressContainerId, statusTextId, retryBtnId);
  }
}

// Inisialisasi listener dropzone
function setupDropzone(dropzoneId, fileInputId, progressBarId, progressContainerId, statusTextId, retryBtnId) {
  const dropzone = document.getElementById(dropzoneId);
  const fileInput = document.getElementById(fileInputId);

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    handleFileProcess(e.target.files[0], progressBarId, progressContainerId, statusTextId, retryBtnId);
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--secondary)";
    dropzone.style.backgroundColor = "rgba(0, 168, 150, 0.05)";
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.style.borderColor = "var(--border-color)";
    dropzone.style.backgroundColor = "#fafbfc";
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--border-color)";
    dropzone.style.backgroundColor = "#fafbfc";
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      handleFileProcess(e.dataTransfer.files[0], progressBarId, progressContainerId, statusTextId, retryBtnId);
    }
  });
}

// Setup toggle Lampiran File vs Tempel Link
function setupAttachmentToggle(btnUploadId, btnLinkId, uploadContId, linkContId) {
  const btnUpload = document.getElementById(btnUploadId);
  const btnLink = document.getElementById(btnLinkId);
  const uploadCont = document.getElementById(uploadContId);
  const linkCont = document.getElementById(linkContId);

  if (!btnUpload || !btnLink) return;

  btnUpload.addEventListener("click", () => {
    btnUpload.classList.add("active");
    btnLink.classList.remove("active");
    uploadCont.style.display = "block";
    linkCont.style.display = "none";
    isUploadActive = true;
  });

  btnLink.addEventListener("click", () => {
    btnLink.classList.add("active");
    btnUpload.classList.remove("active");
    uploadCont.style.display = "none";
    linkCont.style.display = "block";
    isUploadActive = false;
  });
}

// ==========================================
// 2. HALAMAN UTAMA: SUBMISSION FORM
// ==========================================
function initIndexPage() {
  setupDropzone("dropzone", "fileInput", "uploadProgressBar", "uploadProgressContainer", "uploadStatusText", "btnRetryUpload");
  setupAttachmentToggle("btnToggleUpload", "btnToggleLink", "uploadContainer", "linkContainer");

  const form = document.getElementById("formAduan");
  const btnSubmit = document.getElementById("btnSubmit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Siapkan payload
    const payload = {
      action: "submit_pengaduan",
      nama: document.getElementById("nama").value,
      status: document.getElementById("status").value,
      email: document.getElementById("email").value,
      noHp: formatWhatsAppLink(document.getElementById("noHp").value),
      kategori: document.getElementById("kategori").value,
      isi: document.getElementById("isi").value
    };

    // Tambahkan file jika upload aktif dan data siap
    if (isUploadActive && uploadedFile.data) {
      payload.fileData = uploadedFile.data;
      payload.fileMimeType = uploadedFile.mimeType;
      payload.fileName = uploadedFile.name;
    } else if (!isUploadActive) {
      // Jika tempel link aktif
      payload.fileLinkUrl = document.getElementById("fileLinkUrl").value;
    }

    // Animasi tombol
    btnSubmit.disabled = true;
    const btnText = btnSubmit.querySelector("span");
    const originalText = btnText.textContent;
    btnText.textContent = "Mengirim Keluhan...";

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const resData = await response.json();
      if (resData.success) {
        // Tampilkan modal sukses
        document.getElementById("resComplaintId").textContent = resData.data.id;
        document.getElementById("resEmail").textContent = payload.email;

        // Atur link pelacakan langsung
        const trackLink = `track.html?id=${resData.data.id}&token=${resData.data.token}`;
        document.getElementById("btnGoTrack").href = trackLink;

        document.getElementById("successModal").style.display = "flex";
        form.reset();
        resetUploadState("uploadProgressContainer", "uploadStatusText");
      } else {
        alert("Gagal mengirim laporan: " + resData.message);
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan koneksi ke server. Silakan ulangi pengiriman.");
    } finally {
      btnSubmit.disabled = false;
      btnText.textContent = originalText;
    }
  });
}

function resetUploadState(progressContainerId, statusTextId) {
  uploadedFile = { data: "", mimeType: "", name: "" };
  const cont = document.getElementById(progressContainerId);
  const text = document.getElementById(statusTextId);
  if (cont) cont.style.display = "none";
  if (text) text.style.display = "none";
}

function closeSuccessModal() {
  document.getElementById("successModal").style.display = "none";
}

// ==========================================
// 3. HALAMAN LACAK STATUS (TRACKING)
// ==========================================
function initTrackPage() {
  const formSearch = document.getElementById("formTrackSearch");

  formSearch.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("searchId").value.trim();
    const token = document.getElementById("searchToken").value.trim();
    fetchComplaintStatus(id, token);
  });

  // Baca query parameters dari URL (Otomatis lacak jika klik link email)
  const urlParams = new URLSearchParams(window.location.search);
  const queryId = urlParams.get("id");
  const queryToken = urlParams.get("token");

  if (queryId && queryToken) {
    document.getElementById("searchId").value = queryId;
    document.getElementById("searchToken").value = queryToken;
    fetchComplaintStatus(queryId, queryToken);
  }

  // Inisialisasi upload bantahan
  setupDropzone("dropzoneBantahan", "fileBantahanInput", "uploadBantahanProgressBar", "uploadBantahanProgressContainer", "uploadBantahanStatusText", "btnRetryBantahanUpload");
  setupAttachmentToggle("btnToggleBantahanUpload", "btnToggleBantahanLink", "uploadBantahanContainer", "linkBantahanContainer");

  // Setup tombol aksi bantahan
  const btnShowRebuttal = document.getElementById("btnShowRebuttalForm");
  const formRebuttal = document.getElementById("formRebuttal");
  const btnCancelRebuttal = document.getElementById("btnCancelRebuttal");

  if (btnShowRebuttal) {
    btnShowRebuttal.addEventListener("click", () => {
      formRebuttal.style.display = "block";
      btnShowRebuttal.style.display = "none";
    });
  }

  if (btnCancelRebuttal) {
    btnCancelRebuttal.addEventListener("click", () => {
      formRebuttal.style.display = "none";
      btnShowRebuttal.style.display = "block";
      formRebuttal.reset();
      resetUploadState("uploadBantahanProgressContainer", "uploadBantahanStatusText");
    });
  }

  // Submission bantahan
  const formRebuttalEl = document.getElementById("formRebuttal");
  if (formRebuttalEl) {
    formRebuttalEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("searchId").value.trim();
      const token = document.getElementById("searchToken").value.trim();

      const payload = {
        action: "bantah_status",
        id: id,
        token: token,
        catatanBantahan: document.getElementById("alasanBantahan").value
      };

      if (isUploadActive && uploadedFile.data) {
        payload.fileData = uploadedFile.data;
        payload.fileMimeType = uploadedFile.mimeType;
        payload.fileName = uploadedFile.name;
      } else if (!isUploadActive) {
        payload.fileLinkUrl = document.getElementById("fileBantahanLinkUrl").value;
      }

      const btnSubmit = document.getElementById("btnSubmitRebuttal");
      btnSubmit.disabled = true;
      btnSubmit.textContent = "Mengirim Sanggahan...";

      try {
        const response = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        const resData = await response.json();
        if (resData.success) {
          alert("Sanggahan berhasil terkirim. Status laporan telah berubah kembali menjadi Bantahan.");
          location.reload(); // Reload untuk memperbarui progress view
        } else {
          alert("Gagal mengirim sanggahan: " + resData.message);
        }
      } catch (err) {
        console.error(err);
        alert("Gagal tersambung ke server.");
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Kirim Sanggahan";
      }
    });
  }
}

// Fetch Data Laporan Pengirim
async function fetchComplaintStatus(id, token) {
  const btn = document.getElementById("btnSearchTrack");
  btn.disabled = true;
  btn.textContent = "Mencari...";

  try {
    const response = await fetch(`${API_URL}?action=get_status&id=${id}&token=${token}`);
    const resData = await response.json();

    if (resData.success) {
      const data = resData.data;

      // Sembunyikan pencarian, tampilkan detail
      document.getElementById("searchCard").style.display = "none";
      document.getElementById("trackingDetailContainer").style.display = "block";

      // Update data teks
      document.getElementById("detComplaintId").textContent = data.id;
      document.getElementById("detTanggal").textContent = formatDate(data.timestamp);
      document.getElementById("detKategori").textContent = data.kategori;
      document.getElementById("detPengirim").textContent = data.nama + ` (${data.statusPengirim})`;
      document.getElementById("detEmail").textContent = data.email;
      
      const noHpRow = document.getElementById("detNoHpRow");
      if (data.noHp) {
        const noHpLink = document.getElementById("detNoHpLink");
        noHpLink.href = data.noHp;
        noHpLink.textContent = data.noHp.replace("https://", "");
        noHpRow.style.display = "flex";
      } else {
        noHpRow.style.display = "none";
      }

      document.getElementById("detIsi").textContent = data.isi;

      // Badge Status
      const badge = document.getElementById("detStatusBadge");
      badge.textContent = data.statusProgress;
      badge.className = `badge badge-${data.statusProgress.toLowerCase()}`;

      // File lampiran
      const fileRow = document.getElementById("detFileRow");
      if (data.fileLampiranUrl) {
        document.getElementById("detFileLink").href = data.fileLampiranUrl;
        fileRow.style.display = "flex";
      } else {
        fileRow.style.display = "none";
      }

      // Stepper progress rendering
      updateStepper(data);

      // Respons Staf card
      const responseBox = document.getElementById("stafResponseBox");
      if (data.catatanStaf) {
        document.getElementById("detCatatanStaf").textContent = data.catatanStaf;
        const buktiRow = document.getElementById("detBuktiStafRow");
        if (data.fileBuktiStafUrl) {
          document.getElementById("detBuktiStafLink").href = data.fileBuktiStafUrl;
          buktiRow.style.display = "flex";
        } else {
          buktiRow.style.display = "none";
        }
        responseBox.style.display = "block";
      } else {
        responseBox.style.display = "none";
      }

      // Riwayat Bantahan card
      const rebuttalBox = document.getElementById("rebuttalHistoryBox");
      if (data.catatanBantahan) {
        document.getElementById("detAlasanBantahan").textContent = data.catatanBantahan;
        const bantahanFileRow = document.getElementById("detBantahanFileRow");
        if (data.fileBantahanUrl) {
          document.getElementById("detBantahanFileLink").href = data.fileBantahanUrl;
          bantahanFileRow.style.display = "flex";
        } else {
          bantahanFileRow.style.display = "none";
        }
        rebuttalBox.style.display = "block";
      } else {
        rebuttalBox.style.display = "none";
      }

      // Form Bantahan visibility
      const rebuttalForm = document.getElementById("rebuttalFormContainer");
      if (data.statusProgress === "Selesai" || data.statusProgress === "Ditolak") {
        rebuttalForm.style.display = "block";
      } else {
        rebuttalForm.style.display = "none";
      }

      // Bantahan global alert banner
      const banner = document.getElementById("bantahanBanner");
      if (data.statusProgress === "Bantahan") {
        banner.style.display = "flex";
      } else {
        banner.style.display = "none";
      }

    } else {
      alert("Laporan tidak ditemukan: " + resData.message);
    }
  } catch (err) {
    console.error(err);
    alert("Gagal memuat status laporan.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Cari Laporan";
  }
}

// Update Stepper Progress Timeline
function updateStepper(data) {
  const line = document.getElementById("stepProgressLine");
  const stepPending = document.getElementById("stepPending");
  const stepDiproses = document.getElementById("stepDiproses");
  const stepSelesai = document.getElementById("stepSelesai");
  const nodeFinal = document.getElementById("nodeFinal");
  const labelFinal = document.getElementById("labelFinal");

  // Reset classes
  stepPending.className = "step-item";
  stepDiproses.className = "step-item";
  stepSelesai.className = "step-item";
  nodeFinal.textContent = "3";
  labelFinal.innerHTML = "Selesai/Ditolak";

  // Reset dates
  document.getElementById("timePending").textContent = formatDate(data.createdAt);
  document.getElementById("timeDiproses").textContent = "-";
  document.getElementById("timeFinal").textContent = "-";

  const status = data.statusProgress;

  if (status === "Pending") {
    stepPending.classList.add("active");
    line.style.width = "0%";
  }
  else if (status === "Diproses" || status === "Bantahan") {
    stepPending.classList.add("completed");
    stepDiproses.classList.add("active");
    line.style.width = "50%";

    // Set date diproses / bantahan terakhir
    document.getElementById("timeDiproses").textContent = formatDate(data.updatedAt);

    if (status === "Bantahan") {
      stepDiproses.classList.add("rejected"); // Highlight merah di status diproses
      document.getElementById("timeDiproses").textContent = formatDate(data.updatedAt) + " (Dibantah)";
    }
  }
  else if (status === "Selesai" || status === "Ditolak") {
    stepPending.classList.add("completed");
    stepDiproses.classList.add("completed");
    stepSelesai.classList.add("completed");
    line.style.width = "100%";

    document.getElementById("timeDiproses").textContent = formatDate(data.updatedAt);
    document.getElementById("timeFinal").textContent = formatDate(data.updatedAt);

    if (status === "Ditolak") {
      stepSelesai.classList.remove("completed");
      stepSelesai.classList.add("rejected");
      nodeFinal.textContent = "✗";
      labelFinal.innerHTML = "Ditolak<br><span style='font-size: 11px; font-weight: normal; color: #64748b;'>" + formatDate(data.updatedAt) + "</span>";
    } else {
      nodeFinal.textContent = "✓";
      labelFinal.innerHTML = "Selesai<br><span style='font-size: 11px; font-weight: normal; color: #64748b;'>" + formatDate(data.updatedAt) + "</span>";
    }
  }
}

// ==========================================
// 4. PORTAL ADMIN & STAFF
// ==========================================
let allReports = []; // Simpan salinan list untuk filtering
let selectedReport = null; // Terisi saat me-review report di dashboard

function initAdminPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const queryId = urlParams.get("id");
  const queryToken = urlParams.get("token");

  if (queryId && queryToken) {
    // Mode Akses Cepat Token-link
    document.getElementById("loginPanel").style.display = "none";
    document.getElementById("quickActionPanel").style.display = "block";
    document.getElementById("heroTitle").textContent = "Update Progress Pengaduan";
    document.getElementById("heroSubtitle").textContent = "Aksi cepat dari link email peninjauan staf.";

    // Inisialisasi upload quick action
    setupDropzone("dropzoneQuick", "fileQuickInput", "uploadQuickProgressBar", "uploadQuickProgressContainer", "uploadQuickStatusText", "btnRetryQuickUpload");
    setupAttachmentToggle("btnToggleQuickUpload", "btnToggleQuickLink", "uploadQuickContainer", "linkQuickContainer");

    fetchQuickReport(queryId, queryToken);

    const formQuick = document.getElementById("formQuickUpdate");
    formQuick.addEventListener("submit", (e) => {
      e.preventDefault();
      handleQuickUpdateSubmit(queryId, queryToken);
    });
  } else {
    // Mode Dashboard Standard (Login)
    const formLogin = document.getElementById("formLogin");
    formLogin.addEventListener("submit", (e) => {
      e.preventDefault();
      handleLoginSubmit();
    });

    // Setup modal elements
    setupDropzone("dropzoneRev", "fileRevInput", "uploadRevProgressBar", "uploadRevProgressContainer", "uploadRevStatusText", "btnRetryRevUpload");
    setupAttachmentToggle("btnToggleRevUpload", "btnToggleRevLink", "uploadRevContainer", "linkRevContainer");

    const formReview = document.getElementById("formReviewUpdate");
    formReview.addEventListener("submit", (e) => {
      e.preventDefault();
      handleReviewUpdateSubmit();
    });

    // Cek Session jika admin reload halaman
    checkStoredSession();
  }
}

// Quick link fetch data
async function fetchQuickReport(id, token) {
  try {
    const response = await fetch(`${API_URL}?action=verify_staff&id=${id}&token=${token}`);
    const resData = await response.json();

    if (resData.success) {
      const data = resData.data;
      document.getElementById("quickId").textContent = data.id;
      document.getElementById("quickPengirim").textContent = data.nama;
      document.getElementById("quickStatusPengirim").textContent = data.statusPengirim;
      
      const quickNoHpRow = document.getElementById("quickNoHpRow");
      if (data.noHp) {
        const quickNoHpLink = document.getElementById("quickNoHpLink");
        quickNoHpLink.href = data.noHp;
        quickNoHpLink.textContent = data.noHp.replace("https://", "");
        quickNoHpRow.style.display = "flex";
      } else {
        quickNoHpRow.style.display = "none";
      }
      document.getElementById("quickKategori").textContent = data.kategori;
      document.getElementById("quickIsi").textContent = data.isi;

      const badge = document.getElementById("quickStatusBadge");
      badge.textContent = data.statusProgress;
      badge.className = `badge badge-${data.statusProgress.toLowerCase()}`;

      if (data.fileLampiranUrl) {
        document.getElementById("quickFileLink").href = data.fileLampiranUrl;
        document.getElementById("quickFileRow").style.display = "flex";
      }

      // Tampilkan info jika ini bantahan
      if (data.statusProgress === "Bantahan") {
        document.getElementById("quickAlasanBantahan").textContent = data.catatanBantahan;
        if (data.fileBantahanUrl) {
          document.getElementById("quickBantahanFileLink").href = data.fileBantahanUrl;
          document.getElementById("quickBantahanFileRow").style.display = "flex";
        }
        document.getElementById("quickRebuttalBox").style.display = "block";
      }
    } else {
      alert("Akses token tidak valid atau kadaluarsa: " + resData.message);
      document.getElementById("quickActionPanel").innerHTML = `<div class="card-wrapper" style="text-align:center; color:var(--danger);"><h3>Error: Akses Ditolak</h3><p>${resData.message}</p></div>`;
    }
  } catch (err) {
    console.error(err);
    alert("Gagal memuat detail keluhan.");
  }
}

// Quick action form submit
async function handleQuickUpdateSubmit(id, token) {
  const status = document.getElementById("quickNewStatus").value;
  const catatan = document.getElementById("quickCatatan").value;
  const btn = document.getElementById("btnQuickSubmit");

  const payload = {
    action: "update_status",
    id: id,
    token: token,
    status: status,
    catatanStaf: catatan
  };

  if (isUploadActive && uploadedFile.data) {
    payload.fileData = uploadedFile.data;
    payload.fileMimeType = uploadedFile.mimeType;
    payload.fileName = uploadedFile.name;
  } else if (!isUploadActive) {
    payload.fileLinkUrl = document.getElementById("fileQuickLinkUrl").value;
  }

  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const resData = await response.json();
    if (resData.success) {
      alert("Status laporan berhasil diperbarui dan notifikasi email telah terkirim.");
      location.reload();
    } else {
      alert("Gagal menyimpan update: " + resData.message);
    }
  } catch (err) {
    console.error(err);
    alert("Gagal terhubung ke server.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Simpan & Kirim Notifikasi";
  }
}

// Admin login submit
async function handleLoginSubmit() {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPassword").value.trim();
  const btn = document.getElementById("btnLogin");

  btn.disabled = true;
  btn.textContent = "Memverifikasi...";

  try {
    const response = await fetch(`${API_URL}?action=verify_staff&email=${email}&password=${pass}`);
    const resData = await response.json();

    if (resData.success) {
      // Simpan session di memory browser
      sessionStorage.setItem("admin_email", email);
      sessionStorage.setItem("admin_pass", pass);
      sessionStorage.setItem("admin_nama", resData.user.nama);
      sessionStorage.setItem("admin_role", resData.user.role);
      sessionStorage.setItem("admin_kategori", resData.user.kategori);

      // Load Dashboard
      loadDashboardView();
    } else {
      alert("Gagal masuk: " + resData.message);
    }
  } catch (err) {
    console.error(err);
    alert("Gagal melakukan verifikasi masuk.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Masuk";
  }
}

// Cek Session Terbuka
function checkStoredSession() {
  const email = sessionStorage.getItem("admin_email");
  const pass = sessionStorage.getItem("admin_pass");
  if (email && pass) {
    loadDashboardView();
  }
}

// Inisialisasi Tampilan Dashboard setelah login
function loadDashboardView() {
  document.getElementById("loginPanel").style.display = "none";
  document.getElementById("dashboardPanel").style.display = "block";

  const nama = sessionStorage.getItem("admin_nama");
  const role = sessionStorage.getItem("admin_role");
  const kat = sessionStorage.getItem("admin_kategori") || "Semua Layanan";

  document.getElementById("dashWelcomeUser").textContent = `Selamat Datang, ${nama}`;
  document.getElementById("dashRoleLabel").textContent = `Role: ${role} | Bidang: ${kat}`;

  // Tampilkan Tabs khusus Supervisor
  const tabs = document.getElementById("supervisorTabs");
  if (role === "Supervisor") {
    tabs.style.display = "flex";
  } else {
    tabs.style.display = "none";
    // Untuk staf, sembunyikan dropdown filter kategori karena otomatis terfilter di backend
    document.getElementById("filterKategoriWrapper").style.display = "none";
  }

  // Ambil list laporan
  fetchReportsList();
}

function handleLogout() {
  sessionStorage.clear();
  location.reload();
}

// Fetch seluruh daftar laporan
async function fetchReportsList() {
  const email = sessionStorage.getItem("admin_email");
  const pass = sessionStorage.getItem("admin_pass");

  const tbody = document.getElementById("reportsTableBody");
  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 30px;">Memuat data aduan...</td></tr>`;

  try {
    const response = await fetch(`${API_URL}?action=get_all_reports&email=${email}&password=${pass}`);
    const resData = await response.json();

    if (resData.success) {
      allReports = resData.data;
      renderReportsTable(allReports);

      // Jika role supervisor, load statistik kinerja juga
      if (sessionStorage.getItem("admin_role") === "Supervisor") {
        fetchSupervisorStats();
      }
    } else {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 30px;">Gagal memuat data: ${resData.message}</td></tr>`;
    }
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 30px;">Terjadi kesalahan jaringan.</td></tr>`;
  }
}

// Render data list ke tabel
function renderReportsTable(list) {
  const tbody = document.getElementById("reportsTableBody");
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 30px;">Tidak ada pengaduan yang sesuai filter.</td></tr>`;
    return;
  }

  list.forEach((item) => {
    const row = document.createElement("tr");

    // Highlight merah menyala jika status adalah Bantahan (prioritas tinggi)
    if (item.statusProgress === "Bantahan") {
      row.style.borderLeft = "4px solid var(--danger)";
      row.style.backgroundColor = "rgba(231, 111, 81, 0.02)";
    }

    row.innerHTML = `
      <td style="font-weight: 700; color: var(--primary);">${item.id}</td>
      <td>${formatDate(item.timestamp)}</td>
      <td><span style="font-size: 12px; color: #64748b;">${item.kategori}</span></td>
      <td><strong>${item.nama}</strong><br><span style="font-size: 11px; color: #94a3b8;">${item.statusPengirim}</span></td>
      <td><span class="badge badge-${item.statusProgress.toLowerCase()}">${item.statusProgress}</span></td>
      <td>
        <button class="btn btn-primary" style="font-size: 0.8rem; padding: 6px 12px;" onclick="openReviewModal('${item.id}')">Tinjau</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Filter di tabel dashboard
function applyFilters() {
  const statFilter = document.getElementById("filterStatus").value;
  const katFilter = document.getElementById("filterKategori").value;

  let filtered = allReports;

  if (statFilter !== "ALL") {
    filtered = filtered.filter(item => item.statusProgress === statFilter);
  }

  if (katFilter !== "ALL") {
    filtered = filtered.filter(item => item.kategori === katFilter);
  }

  renderReportsTable(filtered);
}

// Switch tabs Supervisor
function switchTab(tab) {
  const btnList = document.getElementById("tabBtnList");
  const btnStats = document.getElementById("tabBtnStats");
  const contList = document.getElementById("tabContentList");
  const contStats = document.getElementById("tabContentStats");

  if (tab === "list") {
    btnList.classList.add("active");
    btnStats.classList.remove("active");
    contList.style.display = "block";
    contStats.style.display = "none";
  } else {
    btnStats.classList.add("active");
    btnList.classList.remove("active");
    contList.style.display = "none";
    contStats.style.display = "block";
  }
}

// Fetch Supervisor Stats
async function fetchSupervisorStats() {
  const email = sessionStorage.getItem("admin_email");
  const pass = sessionStorage.getItem("admin_pass");

  try {
    const response = await fetch(`${API_URL}?action=get_stats&email=${email}&password=${pass}`);
    const resData = await response.json();

    if (resData.success) {
      const stats = resData.data;

      // Update Core Cards
      document.getElementById("statTotalReports").textContent = stats.totalReports;
      document.getElementById("statPendingReports").textContent = stats.statusStats.Pending || 0;
      document.getElementById("statBantahanReports").textContent = stats.statusStats.Bantahan || 0;
      document.getElementById("statAvgResTime").innerHTML = `${stats.avgResolutionDaysGlobal} <span style="font-size: 1rem; font-weight: normal; color: #64748b;">Hari</span>`;

      // Render Table stats per category
      const tbody = document.getElementById("categoryStatsTableBody");
      tbody.innerHTML = "";

      const categories = [
        "Layanan Sarana Prasarana",
        "Layanan Keuangan",
        "Layanan Penelitian dan PKM",
        "Layanan Laboratorium",
        "Layanan IT",
        "Layanan lainnya"
      ];

      categories.forEach(cat => {
        const count = stats.categoryStats[cat] || 0;
        const avg = stats.avgResolutionDaysPerCategory[cat] || "-";

        const row = document.createElement("tr");
        row.innerHTML = `
          <td><strong>${cat}</strong></td>
          <td>${count} Laporan</td>
          <td>${avg !== "-" ? avg + " Hari" : "Belum ada penyelesaian"}</td>
        `;
        tbody.appendChild(row);
      });

      // Render negligence alerts (Staf Lalai)
      const alertBox = document.getElementById("negligenceAlertBox");
      const alertCont = document.getElementById("negligentListContainer");
      alertCont.innerHTML = "";

      if (stats.negligentReports.length > 0) {
        alertBox.style.display = "block";
        stats.negligentReports.forEach(item => {
          const div = document.createElement("div");
          div.className = "alert-item";
          div.innerHTML = `
            <span style="font-size: 0.9rem; color: #881337;">
              📌 Laporan <strong>${item.id}</strong> bagian <strong>${item.kategori}</strong> oleh <strong>${item.nama}</strong> sudah pending selama <strong>${item.durasiHari} hari</strong>.
            </span>
            <button class="btn btn-primary" style="background-color: var(--danger); font-size: 0.75rem; padding: 4px 8px;" onclick="openReviewModal('${item.id}')">Tinjau Staf</button>
          `;
          alertCont.appendChild(div);
        });
      } else {
        alertBox.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Gagal memuat data statistik Supervisor: ", err);
  }
}

// Modal Review Actions
function openReviewModal(id) {
  selectedReport = allReports.find(item => item.id === id);
  if (!selectedReport) return;

  document.getElementById("revId").textContent = selectedReport.id;
  document.getElementById("revPengirim").textContent = selectedReport.nama;
  document.getElementById("revStatusPengirim").textContent = selectedReport.statusPengirim;
  
  const revNoHpRow = document.getElementById("revNoHpRow");
  if (selectedReport.noHp) {
    const revNoHpLink = document.getElementById("revNoHpLink");
    revNoHpLink.href = selectedReport.noHp;
    revNoHpLink.textContent = selectedReport.noHp.replace("https://", "");
    revNoHpRow.style.display = "flex";
  } else {
    revNoHpRow.style.display = "none";
  }
  document.getElementById("revKategori").textContent = selectedReport.kategori;
  document.getElementById("revIsi").textContent = selectedReport.isi;

  const badge = document.getElementById("revStatusBadge");
  badge.textContent = selectedReport.statusProgress;
  badge.className = `badge badge-${selectedReport.statusProgress.toLowerCase()}`;

  // File lampiran
  const fileRow = document.getElementById("revFileRow");
  if (selectedReport.fileLampiranUrl) {
    document.getElementById("revFileLink").href = selectedReport.fileLampiranUrl;
    fileRow.style.display = "flex";
  } else {
    fileRow.style.display = "none";
  }

  // Rebuttal data (if status is Bantahan)
  const rebuttalBox = document.getElementById("revRebuttalBox");
  if (selectedReport.statusProgress === "Bantahan" && selectedReport.catatanBantahan) {
    document.getElementById("revAlasanBantahan").textContent = selectedReport.catatanBantahan;
    const fileBantahanRow = document.getElementById("revBantahanFileRow");
    if (selectedReport.fileBantahanUrl) {
      document.getElementById("revBantahanFileLink").href = selectedReport.fileBantahanUrl;
      fileBantahanRow.style.display = "flex";
    } else {
      fileBantahanRow.style.display = "none";
    }
    rebuttalBox.style.display = "block";
  } else {
    rebuttalBox.style.display = "none";
  }

  // Previous responses display (if status is already updated once)
  const prevBox = document.getElementById("revPrevResponseBox");
  if (selectedReport.catatanStaf) {
    document.getElementById("revPrevCatatan").textContent = selectedReport.catatanStaf;
    const prevFileRow = document.getElementById("revPrevFileRow");
    if (selectedReport.fileBuktiStafUrl) {
      document.getElementById("revPrevFileLink").href = selectedReport.fileBuktiStafUrl;
      prevFileRow.style.display = "flex";
    } else {
      prevFileRow.style.display = "none";
    }
    prevBox.style.display = "block";
  } else {
    prevBox.style.display = "none";
  }

  // Setup Default Values Form
  document.getElementById("revNewStatus").value = selectedReport.statusProgress === "Bantahan" ? "Diproses" : selectedReport.statusProgress;
  document.getElementById("revCatatan").value = selectedReport.catatanStaf || "";
  resetUploadState("uploadRevProgressContainer", "uploadRevStatusText");

  // Tampilkan Modal overlay
  document.getElementById("reviewModal").style.display = "flex";
}

function closeReviewModal() {
  document.getElementById("reviewModal").style.display = "none";
  selectedReport = null;
}

// Submit Update inside Review Modal
async function handleReviewUpdateSubmit() {
  if (!selectedReport) return;

  const email = sessionStorage.getItem("admin_email");
  const pass = sessionStorage.getItem("admin_pass");

  const status = document.getElementById("revNewStatus").value;
  const catatan = document.getElementById("revCatatan").value;
  const btn = document.getElementById("btnRevSubmit");

  const payload = {
    action: "update_status",
    id: selectedReport.id,
    email: email,
    password: pass,
    status: status,
    catatanStaf: catatan
  };

  if (isUploadActive && uploadedFile.data) {
    payload.fileData = uploadedFile.data;
    payload.fileMimeType = uploadedFile.mimeType;
    payload.fileName = uploadedFile.name;
  } else if (!isUploadActive) {
    payload.fileLinkUrl = document.getElementById("fileRevLinkUrl").value;
  }

  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const resData = await response.json();

    if (resData.success) {
      alert("Progress laporan berhasil diperbarui!");
      closeReviewModal();
      // Reload daftar reports secara real-time tanpa refresh halaman
      fetchReportsList();
    } else {
      alert("Gagal memperbarui status: " + resData.message);
    }
  } catch (err) {
    console.error(err);
    alert("Gagal menghubungi server backend.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Simpan Perubahan";
  }
}

// ==========================================
// 5. UTILITY: FORMAT TANGGAL
// ==========================================
function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "-";

  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return date.toLocaleDateString("id-ID", options) + " WIB";
}
