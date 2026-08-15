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
let uploadedFiles = []; // For multiple files
let isUploadActive = true; // true = upload file, false = paste link

// Helper: Format string nomor telepon agar selalu diawali 0 untuk disimpan ke sheet
function sanitizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return "";
  let phoneStr = String(phoneNumber).trim();
  if (phoneStr === "") return "";

  // Jika input tak sengaja memuat link, ambil nomornya saja
  if (phoneStr.includes("wa.me/")) {
    phoneStr = phoneStr.split("wa.me/")[1];
  }

  // Bersihkan karakter selain angka
  let cleaned = phoneStr.replace(/\D/g, "");

  if (cleaned.length > 0) {
    if (cleaned.startsWith("62")) {
      cleaned = "0" + cleaned.slice(2);
    } else if (!cleaned.startsWith("0")) {
      cleaned = "0" + cleaned;
    }
    return cleaned;
  }
  return phoneStr;
}

// Helper: Format string nomor telepon menjadi link WhatsApp clickable
function formatWhatsAppLink(phoneNumber) {
  if (!phoneNumber) return "#";
  let phoneStr = String(phoneNumber).trim();
  let cleaned = phoneStr.replace(/\D/g, "");
  if (cleaned.length === 0) return "#";

  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  } else if (cleaned.startsWith("8")) {
    cleaned = "62" + cleaned;
  }
  return "https://wa.me/" + cleaned;
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

  // Validasi ukuran berkas (3 MB max, video max 30 MB)
  const isVideo = file.type.startsWith("video/");
  const maxBytes = isVideo ? 30 * 1024 * 1024 : 3 * 1024 * 1024;
  if (file.size > maxBytes) {
    if (isVideo) {
      alert("Ukuran video melebihi 30MB (sekitar 20 detik video Full HD). Harap rekam video yang lebih singkat.");
    } else {
      alert("Ukuran berkas melebihi batas maksimal 3MB. Silakan kompres berkas Anda terlebih dahulu.");
    }
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
    if (fileInput.multiple) {
      handleMultipleFileProcess(e.target.files, progressBarId, progressContainerId, statusTextId, retryBtnId);
    } else {
      handleFileProcess(e.target.files[0], progressBarId, progressContainerId, statusTextId, retryBtnId);
    }
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
      if (fileInput.multiple) {
        handleMultipleFileProcess(e.dataTransfer.files, progressBarId, progressContainerId, statusTextId, retryBtnId);
      } else {
        handleFileProcess(e.dataTransfer.files[0], progressBarId, progressContainerId, statusTextId, retryBtnId);
      }
    }
  });
}

// Handler Pemrosesan Multiple File Masuk
async function handleMultipleFileProcess(files, progressBarId, progressContainerId, statusTextId, retryBtnId) {
  const container = document.getElementById(progressContainerId);
  const bar = document.getElementById(progressBarId);
  const text = document.getElementById(statusTextId);
  const retry = document.getElementById(retryBtnId);
  const listContainer = document.getElementById("fileListContainer");

  if (!files || files.length === 0) return;

  if (files.length > 5) {
    alert("Maksimal 5 berkas yang diperbolehkan.");
    return;
  }

  uploadedFiles = [];
  
  if (listContainer) {
    container.style.display = "none";
    text.style.display = "none";
    listContainer.innerHTML = "";
    listContainer.style.display = "flex";
  } else {
    container.style.display = "block";
    text.style.display = "flex";
    retry.style.display = "none";
    bar.style.width = "0%";
    bar.style.backgroundColor = "var(--primary)";
  }

  let totalFiles = files.length;
  let processedFiles = 0;
  let hasError = false;

  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];
    
    let fileItemEl = null;
    let barFillEl = null;
    let badgeEl = null;
    
    if (listContainer) {
      fileItemEl = document.createElement("div");
      fileItemEl.className = "file-progress-item";
      
      const readableSize = (file.size / (1024 * 1024)).toFixed(2) + " MB";
      
      fileItemEl.innerHTML = `
        <div class="file-progress-header">
          <div class="file-progress-info">
            <span class="file-progress-name" title="${file.name}">${file.name}</span>
            <span class="file-progress-size">${readableSize}</span>
          </div>
          <span class="file-progress-status-badge loading">Memproses...</span>
        </div>
        <div class="file-progress-bar-bg">
          <div class="file-progress-bar-fill" style="width: 10%;"></div>
        </div>
      `;
      listContainer.appendChild(fileItemEl);
      barFillEl = fileItemEl.querySelector(".file-progress-bar-fill");
      badgeEl = fileItemEl.querySelector(".file-progress-status-badge");
    } else {
      text.querySelector("span").textContent = `Memproses file ${i+1}/${totalFiles}: ${file.name}...`;
    }

    try {
      if (barFillEl) barFillEl.style.width = "30%";
      let finalData = "";
      if (file.type.startsWith("image/")) {
        if (badgeEl) badgeEl.textContent = "Mengompres...";
        finalData = await compressImage(file);
      } else {
        if (badgeEl) badgeEl.textContent = "Membaca...";
        finalData = await fileToBase64(file);
      }
      
      if (barFillEl) barFillEl.style.width = "70%";

      // Hitung approx size dari base64: length * 3 / 4
      const approxSize = (finalData.length * 3) / 4;
      const isVideo = file.type.startsWith("video/");
      const maxBytes = isVideo ? 30 * 1024 * 1024 : 3 * 1024 * 1024;
      if (approxSize > maxBytes) {
        if (badgeEl) {
          badgeEl.textContent = "GAGAL";
          badgeEl.className = "file-progress-status-badge error";
        }
        if (barFillEl) {
          barFillEl.style.width = "100%";
          barFillEl.style.backgroundColor = "var(--danger)";
        }
        if (isVideo) {
          alert(`Berkas "${file.name}" melebihi 30MB. Harap rekam video yang lebih singkat (maks. sekitar 20 detik Full HD).`);
        } else {
          alert(`Berkas "${file.name}" melebihi 3MB setelah dikompres. Harap pilih berkas lain yang lebih kecil.`);
        }
        hasError = true;
        break;
      }

      uploadedFiles.push({
        data: finalData,
        mimeType: file.type,
        name: file.name
      });
      processedFiles++;
      
      if (badgeEl) {
        badgeEl.textContent = "SIAP KIRIM";
        badgeEl.className = "file-progress-status-badge success";
      }
      if (barFillEl) {
        barFillEl.style.width = "100%";
        barFillEl.style.backgroundColor = "var(--success)";
      }
      
      if (!listContainer) {
        bar.style.width = `${(processedFiles / totalFiles) * 100}%`;
      }
    } catch (err) {
      console.error(err);
      if (badgeEl) {
        badgeEl.textContent = "GAGAL";
        badgeEl.className = "file-progress-status-badge error";
      }
      if (barFillEl) {
        barFillEl.style.width = "100%";
        barFillEl.style.backgroundColor = "var(--danger)";
      }
      hasError = true;
      break;
    }
  }

  if (hasError) {
    if (!listContainer) {
      bar.style.backgroundColor = "var(--danger)";
      text.querySelector("span").textContent = "Gagal memproses beberapa berkas.";
      retry.style.display = "block";
      retry.onclick = () => handleMultipleFileProcess(files, progressBarId, progressContainerId, statusTextId, retryBtnId);
    }
  } else {
    if (!listContainer) {
      bar.style.width = "100%";
      text.querySelector("span").textContent = `Selesai memproses ${totalFiles} berkas. (Siap dikirim)`;
    }
  }
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

  // Dynamic Location Logic
  const kategoriSelect = document.getElementById("kategori");
  const locationContainer = document.getElementById("locationContainer");
  const lokasiInput = document.getElementById("lokasiLaporan");
  const subLokasiInput = document.getElementById("subLokasi");

  if (kategoriSelect && locationContainer) {
    kategoriSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val === "Layanan Sarana Prasarana" || val === "Layanan Laboratorium" || val === "Layanan IT") {
        locationContainer.style.display = "block";
        lokasiInput.required = true;
      } else {
        locationContainer.style.display = "none";
        lokasiInput.required = false;
        lokasiInput.value = "";
        subLokasiInput.value = "";
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Siapkan payload
    const payload = {
      action: "submit_pengaduan",
      nama: document.getElementById("nama").value,
      status: document.getElementById("status").value,
      email: document.getElementById("email").value,
      noHp: sanitizePhoneNumber(document.getElementById("noHp").value),
      kategori: document.getElementById("kategori").value,
      lokasiLaporan: document.getElementById("lokasiLaporan") ? document.getElementById("lokasiLaporan").value : "",
      subLokasi: document.getElementById("subLokasi") ? document.getElementById("subLokasi").value : "",
      isi: document.getElementById("isi").value
    };

    // Tambahkan file jika upload aktif dan data siap
    if (isUploadActive && uploadedFiles.length > 0) {
      payload.files = uploadedFiles;
    } else if (isUploadActive && uploadedFile.data) {
      // Fallback fallback untuk single file jika karena suatu hal `uploadedFiles` kosong
      payload.files = [uploadedFile];
    } else if (!isUploadActive) {
      // Jika tempel link aktif
      payload.fileLinkUrl = document.getElementById("fileLinkUrl").value;
    }

    submitPayloadWithProgress(
      API_URL,
      payload,
      btnSubmit,
      (resData) => {
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
      },
      (err) => {
        console.error(err);
        alert("Terjadi kesalahan koneksi ke server atau: " + err.message);
      }
    );
  });
}

function resetUploadState(progressContainerId, statusTextId) {
  uploadedFile = { data: "", mimeType: "", name: "" };
  uploadedFiles = [];
  const cont = document.getElementById(progressContainerId);
  const text = document.getElementById(statusTextId);
  if (cont) cont.style.display = "none";
  if (text) text.style.display = "none";
  const listCont = document.getElementById("fileListContainer");
  if (listCont) {
    listCont.innerHTML = "";
    listCont.style.display = "none";
  }
}

// Helper: Send JSON payload via XHR to monitor upload progress
function submitPayloadWithProgress(url, payload, btnElement, successCallback, errorCallback) {
  const xhr = new XMLHttpRequest();
  xhr.open("POST", url, true);
  xhr.setRequestHeader("Content-Type", "text/plain;charset=utf-8");

  const btnTextEl = btnElement.querySelector("span") || btnElement;
  const originalText = btnTextEl.textContent || btnTextEl.value || "";

  const updateBtnText = (text) => {
    if (btnTextEl.tagName === "INPUT") {
      btnTextEl.value = text;
    } else {
      btnTextEl.textContent = text;
    }
  };

  btnElement.disabled = true;
  updateBtnText("Mengunggah... (0%)");

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      if (pct < 100) {
        updateBtnText(`Mengunggah... (${pct}%)`);
      } else {
        updateBtnText("Memproses di server...");
      }
    }
  };

  xhr.onload = () => {
    btnElement.disabled = false;
    updateBtnText(originalText);
    
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const resData = JSON.parse(xhr.responseText);
        successCallback(resData);
      } catch (err) {
        errorCallback({ message: "Respon server tidak valid." });
      }
    } else {
      errorCallback({ message: `HTTP Error ${xhr.status}` });
    }
  };

  xhr.onerror = () => {
    btnElement.disabled = false;
    updateBtnText(originalText);
    errorCallback({ message: "Koneksi jaringan terputus." });
  };

  xhr.send(JSON.stringify(payload));
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
      submitPayloadWithProgress(
        API_URL,
        payload,
        btnSubmit,
        (resData) => {
          if (resData.success) {
            alert("Sanggahan berhasil terkirim. Status laporan telah berubah menjadi Bantahan.");
            location.reload(); // Reload untuk memperbarui progress view
          } else {
            alert("Gagal mengirim sanggahan: " + resData.message);
          }
        },
        (err) => {
          console.error(err);
          alert("Gagal tersambung ke server: " + err.message);
        }
      );
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
      const trackHero = document.getElementById("trackHero");
      if (trackHero) trackHero.style.display = "none";

      // Update data teks
      document.getElementById("detComplaintId").textContent = data.id;
      document.getElementById("detTanggal").textContent = formatDate(data.timestamp);
      document.getElementById("detKategori").textContent = data.kategori;
      document.getElementById("detPengirim").textContent = data.nama + ` (${data.statusPengirim})`;
      document.getElementById("detEmail").textContent = data.email;

      const noHpRow = document.getElementById("detNoHpRow");
      if (data.noHp) {
        const noHpLink = document.getElementById("detNoHpLink");
        noHpLink.href = formatWhatsAppLink(data.noHp);
        noHpLink.textContent = data.noHp;
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
  const textFinal = document.getElementById("textFinal");

  // Reset classes
  stepPending.className = "step-item";
  stepDiproses.className = "step-item";
  stepSelesai.className = "step-item";
  nodeFinal.textContent = "3";
  textFinal.textContent = "Selesai/Ditolak";

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
      textFinal.textContent = "Ditolak";
    } else {
      nodeFinal.textContent = "✓";
      textFinal.textContent = "Selesai";
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

    // Setup WO Complete Modal elements
    setupDropzone("dropzoneWO", "fileWOInput", "uploadWOProgressBar", "uploadWOProgressContainer", "uploadWOStatusText", "btnRetryWOUpload");
    setupAttachmentToggle("btnToggleWOUpload", "btnToggleWOLink", "uploadWOContainer", "linkWOContainer");

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
        quickNoHpLink.href = formatWhatsAppLink(data.noHp);
        quickNoHpLink.textContent = data.noHp;
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

  submitPayloadWithProgress(
    API_URL,
    payload,
    btn,
    (resData) => {
      if (resData.success) {
        alert("Status laporan berhasil diperbarui dan notifikasi email telah terkirim.");
        location.reload();
      } else {
        alert("Gagal menyimpan update: " + resData.message);
      }
    },
    (err) => {
      console.error(err);
      alert("Gagal terhubung ke server: " + err.message);
    }
  );
}

// Admin login submit
async function handleLoginSubmit() {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPassword").value.trim();
  const btn = document.getElementById("btnLogin");

  btn.disabled = true;
  btn.textContent = "Memverifikasi...";

  try {
    const response = await fetch(`${API_URL}?action=verify_staff&email=${encodeURIComponent(email)}&password=${encodeURIComponent(pass)}`);
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
  fetchWorkOrdersList();
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
    const response = await fetch(`${API_URL}?action=get_all_reports&email=${encodeURIComponent(email)}&password=${encodeURIComponent(pass)}`);
    const resData = await response.json();

    if (resData.success) {
      allReports = resData.data;
      renderReportsTable(allReports);

      // Jika role supervisor, load statistik kinerja juga
      if (sessionStorage.getItem("admin_role") === "Supervisor") {
        fetchSupervisorStats();
      }
    } else {
      if (resData.message && (resData.message.includes("Kredensial") || resData.message.includes("Autentikasi") || resData.message.includes("Akses ditolak"))) {
        alert("Sesi telah berakhir atau kredensial tidak valid. Silakan login kembali.");
        handleLogout();
        return;
      }
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
  const btnWO = document.getElementById("tabBtnWO");
  
  const contList = document.getElementById("tabContentList");
  const contStats = document.getElementById("tabContentStats");
  const contWO = document.getElementById("tabContentWO");

  // Reset semua
  btnList.classList.remove("active");
  btnStats.classList.remove("active");
  if (btnWO) btnWO.classList.remove("active");
  
  contList.style.display = "none";
  contStats.style.display = "none";
  if (contWO) contWO.style.display = "none";

  if (tab === "list") {
    btnList.classList.add("active");
    contList.style.display = "block";
  } else if (tab === "wo") {
    if (btnWO) btnWO.classList.add("active");
    if (contWO) contWO.style.display = "block";
  } else {
    btnStats.classList.add("active");
    contStats.style.display = "block";
    fetchSupervisorStats(); // Lazy-load: hanya fetch saat tab diklik
  }
}

// Fetch Supervisor Stats & render charts
let chartStatusInst = null;
let chartKategoriInst = null;

async function fetchSupervisorStats() {
  const email = sessionStorage.getItem("admin_email");
  const pass = sessionStorage.getItem("admin_pass");

  try {
    const response = await fetch(`${API_URL}?action=get_stats&email=${encodeURIComponent(email)}&password=${encodeURIComponent(pass)}`);
    const resData = await response.json();

    if (!resData.success) {
      if (resData.message && (resData.message.includes("Kredensial") || resData.message.includes("Autentikasi") || resData.message.includes("Akses ditolak"))) {
        handleLogout();
      }
      return;
    }
    const stats = resData.data;

    // ── Core Aduan KPI Cards ─────────────────────────────
    document.getElementById("statTotalReports").textContent = stats.totalReports;
    document.getElementById("statPendingReports").textContent = stats.statusStats.Pending || 0;
    document.getElementById("statBantahanReports").textContent = stats.statusStats.Bantahan || 0;
    document.getElementById("statAvgResTime").innerHTML =
      `${stats.avgResolutionDaysGlobal} <span style="font-size:1rem;font-weight:normal;color:#64748b;">Hari</span>`;

    // ── WO KPI Cards ─────────────────────────────────────
    if (stats.woStats) {
      const wo = stats.woStats;
      document.getElementById("statTotalWO").textContent      = wo.total;
      document.getElementById("statWOInProgress").textContent  = wo.diproses;
      document.getElementById("statWODone").textContent        = wo.selesai;
      document.getElementById("statAvgWODuration").innerHTML   =
        `${wo.avgDurasiMenit} <span style="font-size:1rem;font-weight:normal;color:#64748b;">Menit</span>`;
    }

    // ── Tabel per-Kategori ───────────────────────────────
    const categories = [
      "Layanan Sarana Prasarana", "Layanan Keuangan",
      "Layanan Penelitian dan PKM", "Layanan Laboratorium",
      "Layanan IT", "Layanan Akademik", "Layanan lainnya"
    ];
    const tbody = document.getElementById("categoryStatsTableBody");
    tbody.innerHTML = "";
    categories.forEach(cat => {
      const count = stats.categoryStats[cat] || 0;
      const avg   = stats.avgResolutionDaysPerCategory[cat] || "-";
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>${cat}</strong></td>
        <td>${count} Laporan</td>
        <td>${avg !== "-" ? avg + " Hari" : "Belum ada penyelesaian"}</td>
      `;
      tbody.appendChild(row);
    });

    // ── Chart 1: Donut – Distribusi Status ───────────────
    const statusLabels = ["Pending", "Diproses", "Selesai", "Ditolak", "Bantahan"];
    const statusColors = ["#f4a261", "#00a896", "#2a9d8f", "#e76f51", "#c1121f"];
    const statusData   = statusLabels.map(l => stats.statusStats[l] || 0);
    const ctxPie = document.getElementById("chartStatusDist").getContext("2d");
    if (chartStatusInst) chartStatusInst.destroy();
    chartStatusInst = new Chart(ctxPie, {
      type: "doughnut",
      data: {
        labels: statusLabels,
        datasets: [{ data: statusData, backgroundColor: statusColors, borderWidth: 2, borderColor: "#fff" }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { font: { family: "'Outfit', sans-serif", size: 11 }, padding: 10 } } }
      }
    });

    // ── Chart 2: Bar – Aduan per Kategori ────────────────
    const shortLabels = categories.map(c => c.replace("Layanan ", ""));
    const catData     = categories.map(c => stats.categoryStats[c] || 0);
    const ctxBar = document.getElementById("chartKategori").getContext("2d");
    if (chartKategoriInst) chartKategoriInst.destroy();
    chartKategoriInst = new Chart(ctxBar, {
      type: "bar",
      data: {
        labels: shortLabels,
        datasets: [{
          label: "Jumlah Laporan", data: catData,
          backgroundColor: "rgba(0,168,150,0.7)", borderColor: "#00a896",
          borderWidth: 1, borderRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { family: "'Outfit', sans-serif", size: 10 } } },
          y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: "'Outfit', sans-serif" } } }
        }
      }
    });

    // ── Negligence Alerts ────────────────────────────────
    const alertBox  = document.getElementById("negligenceAlertBox");
    const alertCont = document.getElementById("negligentListContainer");
    alertCont.innerHTML = "";
    if (stats.negligentReports && stats.negligentReports.length > 0) {
      alertBox.style.display = "block";
      stats.negligentReports.forEach(item => {
        const div = document.createElement("div");
        div.className = "alert-item";
        div.innerHTML = `
          <span style="font-size:0.9rem;color:#881337;">
            📌 Laporan <strong>${item.id}</strong> bagian <strong>${item.kategori}</strong>
            oleh <strong>${item.nama}</strong> sudah pending selama <strong>${item.durasiHari} hari</strong>.
          </span>
          <button class="btn btn-primary" style="background-color:var(--danger);font-size:0.75rem;padding:4px 8px;"
            onclick="openReviewModal('${item.id}')">Tinjau ▶</button>
        `;
        alertCont.appendChild(div);
      });
    } else {
      alertBox.style.display = "none";
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
    revNoHpLink.href = formatWhatsAppLink(selectedReport.noHp);
    revNoHpLink.textContent = selectedReport.noHp;
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

  // Riwayat Aktivitas akan dimuat secara async oleh fetchActivityLog di bawah
  // ── Pre-fill Form (Status & Catatan) ────────────────
  // Petakan status yang tidak ada di dropdown ke nilai yang paling logis
  const statusMap = {
    "Pending":   "Diproses",
    "Diproses":  "Diproses",
    "Bantahan":  "Diproses",   // saat ada bantahan, staf harus proses ulang
    "Selesai":   "Selesai",
    "Ditolak":   "Ditolak"
  };
  const mappedStatus = statusMap[selectedReport.statusProgress] || "Diproses";
  
  // Set nilai dropdown dengan cara yang pasti bekerja di semua browser
  const selectEl = document.getElementById("revNewStatus");
  selectEl.value = "";                   // reset dulu ke placeholder
  selectEl.value = mappedStatus;         // kemudian assign nilai yang benar

  // Pre-fill catatan staf sebelumnya ke textarea
  document.getElementById("revCatatan").value = selectedReport.catatanStaf || "";
  
  resetUploadState("uploadRevProgressContainer", "uploadRevStatusText");

  // Tampilkan tombol delegasi WO jika role Supervisor
  const btnDelegateWO = document.getElementById("btnDelegateWO");
  if (btnDelegateWO) {
    if (sessionStorage.getItem("admin_role") === "Supervisor") {
      btnDelegateWO.style.display = "inline-block";
    } else {
      btnDelegateWO.style.display = "none";
    }
  }

  // Tampilkan Modal overlay
  document.getElementById("reviewModal").style.display = "flex";

  // Muat riwayat aktivitas secara async
  fetchActivityLog(selectedReport.id);
}

function closeReviewModal() {
  document.getElementById("reviewModal").style.display = "none";
  selectedReport = null;
}

// Fetch riwayat aktivitas dari Log_Aktivitas backend
async function fetchActivityLog(aduId) {
  const email = sessionStorage.getItem("admin_email");
  const pass  = sessionStorage.getItem("admin_pass");
  const loading = document.getElementById("revActivityLoading");
  const timeline = document.getElementById("revActivityTimeline");
  const emptyMsg = document.getElementById("revActivityEmpty");

  loading.style.display = "inline";
  timeline.innerHTML = "";

  try {
    const response = await fetch(`${API_URL}?action=get_activity_log&email=${encodeURIComponent(email)}&password=${encodeURIComponent(pass)}&aduId=${encodeURIComponent(aduId)}`);
    const resData  = await response.json();

    if (resData.success && resData.data.length > 0) {
      renderActivityTimeline(resData.data);
    } else {
      timeline.innerHTML = `<p id="revActivityEmpty" style="font-size:0.85rem;color:var(--text-muted);font-style:italic;">Belum ada riwayat aktivitas.</p>`;
    }
  } catch (err) {
    console.error("Gagal memuat riwayat aktivitas:", err);
    timeline.innerHTML = `<p style="font-size:0.85rem;color:var(--danger);">Gagal memuat riwayat.</p>`;
  } finally {
    loading.style.display = "none";
  }
}

function renderActivityTimeline(logs) {
  const timeline = document.getElementById("revActivityTimeline");
  timeline.innerHTML = "";

  // Label & warna per tipe aksi
  const aksiMeta = {
    "STATUS_UPDATED":     { label: "Update Status",         color: "#00a896", icon: "✏️" },
    "WO_STARTED":         { label: "WO Mulai Dikerjakan",   color: "#f4a261", icon: "▶️" },
    "WO_COMPLETED":       { label: "WO Selesai",            color: "#2a9d8f", icon: "✅" },
    "ADU_AUTO_COMPLETED": { label: "Aduan Ditutup Otomatis",color: "#2a9d8f", icon: "🏁" },
    "WO_CREATED":         { label: "Work Order Dibuat",     color: "#0d233a", icon: "📋" },
    "BANTAHAN":           { label: "Bantahan Pelapor",      color: "#e76f51", icon: "⚠️" }
  };

  logs.forEach(log => {
    const meta = aksiMeta[log.aksi] || { label: log.aksi, color: "#64748b", icon: "📌" };
    const ts   = log.timestamp ? formatDate(log.timestamp) : "-";

    // Parse detail: pisahkan catatan dari URL bukti
    let detailHtml = "";
    if (log.detail) {
      const parts = log.detail.split(" | ");
      parts.forEach(part => {
        if (part.startsWith("Bukti: http")) {
          const url = part.replace("Bukti: ", "").trim();
          detailHtml += `<a href="${url}" target="_blank" style="font-size:0.8rem;color:var(--secondary);">📎 Buka Berkas Bukti</a><br>`;
        } else {
          detailHtml += `<span style="font-size:0.85rem;color:#374151;">${part}</span><br>`;
        }
      });
    }

    const item = document.createElement("div");
    item.style.cssText = `border-left: 3px solid ${meta.color}; padding: 8px 12px; background: #f8f9fa; border-radius: 0 6px 6px 0;`;
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:0.8rem;font-weight:700;color:${meta.color};">${meta.icon} ${meta.label}</span>
        <span style="font-size:0.75rem;color:#94a3b8;">${ts}</span>
      </div>
      <div style="font-size:0.8rem;color:#64748b;margin-bottom:4px;">Oleh: <strong>${log.aktor}</strong> (${log.peran})${log.woId ? ` · WO: ${log.woId}` : ""}</div>
      <div style="line-height:1.6;">${detailHtml}</div>
    `;
    timeline.appendChild(item);
  });
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

  submitPayloadWithProgress(
    API_URL,
    payload,
    btn,
    (resData) => {
      if (resData.success) {
        alert("Progress laporan berhasil diperbarui!");
        closeReviewModal();
        // Reload daftar reports secara real-time tanpa refresh halaman
        fetchReportsList();
      } else {
        alert("Gagal memperbarui status: " + resData.message);
      }
    },
    (err) => {
      console.error(err);
      alert("Gagal menghubungi server backend: " + err.message);
    }
  );
}

// ==========================================
// 4.5 WORK ORDER CREATION (SUPERVISOR)
// ==========================================

function openWOCreateModal() {
  if (!selectedReport) return;
  
  // Tutup review modal sementara
  document.getElementById("reviewModal").style.display = "none";

  document.getElementById("woCreateAduId").value = selectedReport.id;
  document.getElementById("woCreateLabelId").textContent = selectedReport.id;
  
  document.getElementById("woCreateKategori").value = selectedReport.kategori;
  document.getElementById("woCreateLabelKategori").textContent = selectedReport.kategori;
  
  // Reset fields
  document.getElementById("woCreateLokasi").value = "";
  document.getElementById("woCreateDeskripsi").value = "";
  document.getElementById("woCreatePrioritas").value = "3";
  
  document.getElementById("woCreateModal").style.display = "flex";
  
  // Load staff
  fetchStaffListForWO(selectedReport.kategori);
}

function closeWOCreateModal() {
  document.getElementById("woCreateModal").style.display = "none";
  // Kembali ke review modal
  document.getElementById("reviewModal").style.display = "flex";
}

async function fetchStaffListForWO(kategori) {
  const email = sessionStorage.getItem("admin_email");
  const pass = sessionStorage.getItem("admin_pass");
  const selectEl = document.getElementById("woCreateAssignee");
  
  selectEl.innerHTML = `<option value="" disabled selected>Memuat daftar staf...</option>`;
  
  try {
    const response = await fetch(`${API_URL}?action=get_staff_list&email=${encodeURIComponent(email)}&password=${encodeURIComponent(pass)}&kategori=${encodeURIComponent(kategori)}`);
    const resData = await response.json();
    
    if (resData.success) {
      selectEl.innerHTML = `<option value="" disabled selected>Pilih Staf Penanggung Jawab</option>`;
      if (resData.data.length === 0) {
        selectEl.innerHTML += `<option value="" disabled>Tidak ada staf untuk kategori ini</option>`;
      } else {
        resData.data.forEach(staff => {
          const opt = document.createElement("option");
          opt.value = staff.email;
          opt.textContent = `${staff.nama} (${staff.email})`;
          selectEl.appendChild(opt);
        });
      }
    } else {
      selectEl.innerHTML = `<option value="" disabled>Gagal memuat staf</option>`;
    }
  } catch (err) {
    console.error("Error fetching staff:", err);
    selectEl.innerHTML = `<option value="" disabled>Error jaringan</option>`;
  }
}

async function submitWOCreate() {
  const aduId = document.getElementById("woCreateAduId").value;
  const kategori = document.getElementById("woCreateKategori").value;
  const lokasi = document.getElementById("woCreateLokasi").value.trim();
  const deskripsi = document.getElementById("woCreateDeskripsi").value.trim();
  const assigneeEmail = document.getElementById("woCreateAssignee").value;
  const prioritas = document.getElementById("woCreatePrioritas").value;
  
  if (!assigneeEmail) {
    alert("Silakan pilih staf penanggung jawab.");
    return;
  }
  
  const btn = document.getElementById("btnWOCreateSubmit");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";
  
  const payload = {
    action: "create_work_order",
    email: sessionStorage.getItem("admin_email"),
    password: sessionStorage.getItem("admin_pass"),
    aduId: aduId,
    kategori: kategori,
    lokasi: lokasi,
    deskripsi: deskripsi,
    assigneeEmail: assigneeEmail,
    prioritas: prioritas
  };
  
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const resData = await response.json();
    
    if (resData.success) {
      alert("Work Order berhasil dibuat dan didelegasikan!");
      document.getElementById("woCreateModal").style.display = "none";
      selectedReport = null;
      // Berpindah ke tab WO
      if (typeof switchTab === 'function') switchTab('wo');
      if (typeof fetchWorkOrdersList === 'function') fetchWorkOrdersList();
    } else {
      alert("Gagal membuat WO: " + resData.message);
    }
  } catch (err) {
    console.error("Error creating WO:", err);
    alert("Terjadi kesalahan saat memproses pembuatan WO.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Buat & Tugaskan";
  }
}

// ==========================================
// 5. WORK ORDER / KANBAN LOGIC
// ==========================================
let allWorkOrders = [];
let sortableInstance = null;

async function fetchWorkOrdersList() {
  const email = sessionStorage.getItem("admin_email");
  const pass = sessionStorage.getItem("admin_pass");
  const container = document.getElementById("woListContainer");

  container.innerHTML = `<div style="text-align: center; color: #64748b; padding: 30px;">Memuat data penugasan...</div>`;

  try {
    const response = await fetch(`${API_URL}?action=get_work_orders&email=${encodeURIComponent(email)}&password=${encodeURIComponent(pass)}`);
    const resData = await response.json();

    if (resData.success) {
      allWorkOrders = resData.data || [];
      // Sort berdasarkan Prioritas (1 paling tinggi, biasanya di atas)
      allWorkOrders.sort((a, b) => parseInt(a.Prioritas || 99) - parseInt(b.Prioritas || 99));
      renderWorkOrders();
    } else {
      if (resData.message && (resData.message.includes("Kredensial") || resData.message.includes("Autentikasi") || resData.message.includes("Akses ditolak"))) {
        alert("Sesi telah berakhir atau kredensial tidak valid. Silakan login kembali.");
        handleLogout();
        return;
      }
      container.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 30px;">Gagal memuat WO: ${resData.message}</div>`;
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 30px;">Gagal terhubung ke server.</div>`;
  }
}

function renderWorkOrders() {
  const container = document.getElementById("woListContainer");
  const role = sessionStorage.getItem("admin_role");
  container.innerHTML = "";

  if (allWorkOrders.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #64748b; padding: 30px;">Tidak ada penugasan Work Order.</div>`;
    document.getElementById("btnSaveWOPriority").style.display = "none";
    return;
  }

  allWorkOrders.forEach((wo) => {
    const card = document.createElement("div");
    card.className = "wo-card";
    card.dataset.woId = wo.WO_ID;
    card.style.cssText = "background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid var(--primary); padding: 16px; border-radius: var(--border-radius-sm); cursor: grab; display: flex; flex-direction: column; gap: 8px;";
    
    // Status color
    let statusColor = "#64748b";
    if (wo.Status_WO === "Open") statusColor = "var(--primary)";
    if (wo.Status_WO === "Diproses") statusColor = "var(--accent)";
    if (wo.Status_WO === "Selesai") statusColor = "var(--success)";
    
    // Tentukan aksi / tombol untuk PIC terkait
    const email = sessionStorage.getItem("admin_email");
    let actionButtons = "";
    
    if (wo.Assignee_Email === email && wo.Status_WO !== "Selesai") {
      if (wo.Status_WO === "Open") {
        actionButtons = `<button class="btn btn-primary" style="font-size: 0.8rem; padding: 6px 12px;" onclick="startWorkOrder('${wo.WO_ID}')">Mulai Kerjakan ▶</button>`;
      } else if (wo.Status_WO === "Diproses") {
        actionButtons = `<button class="btn btn-primary" style="background-color: var(--success); font-size: 0.8rem; padding: 6px 12px;" onclick="openWOCompleteModal('${wo.WO_ID}')">Selesaikan ✓</button>`;
      }
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <span style="font-size: 0.8rem; font-weight: 700; color: #64748b;">${wo.WO_ID} (Ref: ${wo.ADU_ID})</span>
          <h4 style="margin: 4px 0 0 0; color: var(--text-dark);">${wo.Kategori} - ${wo.Lokasi}</h4>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${actionButtons}
          <span class="badge" style="background-color: ${statusColor}; color: #fff;">${wo.Status_WO}</span>
        </div>
      </div>
      <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">
        ${wo.Deskripsi}
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
        <span style="background: var(--neutral-light); padding: 4px 8px; border-radius: 4px; font-weight: 600;">PIC: ${wo.Assignee_Email}</span>
        <span style="color: var(--secondary); font-weight: 700;">Prioritas: <span class="priority-label">${wo.Prioritas}</span></span>
      </div>
    `;
    container.appendChild(card);
  });

  // Init Sortable JS
  if (sortableInstance) sortableInstance.destroy();
  
  // Hanya Supervisor atau PIC terkait yang boleh reorder. Asumsi semua PIC boleh reorder miliknya.
  const isDraggable = true; 
  if (isDraggable) {
    sortableInstance = Sortable.create(container, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      onEnd: function (evt) {
        // Update UI priority labels
        const cards = container.querySelectorAll('.wo-card');
        cards.forEach((c, index) => {
          c.querySelector('.priority-label').textContent = index + 1;
        });
        document.getElementById("btnSaveWOPriority").style.display = "inline-block";
      }
    });
  }
}

async function saveWOPriority() {
  const container = document.getElementById("woListContainer");
  const cards = container.querySelectorAll('.wo-card');
  const updates = [];
  
  cards.forEach((card, index) => {
    updates.push({
      woId: card.dataset.woId,
      prioritas: index + 1
    });
  });

  const email = sessionStorage.getItem("admin_email");
  const pass = sessionStorage.getItem("admin_pass");
  const btn = document.getElementById("btnSaveWOPriority");

  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  try {
    const payload = {
      action: "update_wo_priority",
      email: email,
      password: pass,
      updates: updates
    };

    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const resData = await response.json();

    if (resData.success) {
      btn.style.display = "none";
      alert("Prioritas Work Order berhasil diperbarui!");
      fetchWorkOrdersList();
    } else {
      alert("Gagal: " + resData.message);
    }
  } catch (err) {
    console.error(err);
    alert("Gagal menghubungi server.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Simpan Perubahan Prioritas";
  }
}

// ------------------------------------------
// WORK ORDER ACTIONS
// ------------------------------------------

async function startWorkOrder(woId) {
  if (!confirm(`Mulai kerjakan Work Order ${woId}? Waktu pengerjaan akan mulai dihitung.`)) return;

  const email = sessionStorage.getItem("admin_email");
  const pass = sessionStorage.getItem("admin_pass");

  try {
    const payload = {
      action: "start_work_order",
      email: email,
      password: pass,
      woId: woId
    };

    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const resData = await response.json();

    if (resData.success) {
      alert("Work Order berhasil dimulai!");
      fetchWorkOrdersList();
      fetchReportsList(); // Refresh status pengaduan utama
    } else {
      alert("Gagal memulai Work Order: " + resData.message);
    }
  } catch (err) {
    console.error(err);
    alert("Gagal menghubungi server.");
  }
}

function openWOCompleteModal(woId) {
  document.getElementById("woIdToComplete").value = woId;
  document.getElementById("woCompleteLabelId").textContent = woId;
  document.getElementById("woCompleteCatatan").value = "";
  
  // Reset upload
  isUploadActive = true;
  document.getElementById("btnToggleWOUpload").classList.add("active");
  document.getElementById("btnToggleWOLink").classList.remove("active");
  document.getElementById("uploadWOContainer").style.display = "block";
  document.getElementById("linkWOContainer").style.display = "none";
  document.getElementById("uploadWOProgressBar").style.width = "0%";
  document.getElementById("fileWOLinkUrl").value = "";
  uploadedFile = { name: "", mimeType: "", data: "" };

  document.getElementById("woCompleteModal").style.display = "flex";
}

function closeWOCompleteModal() {
  document.getElementById("woCompleteModal").style.display = "none";
}

async function submitWOComplete() {
  const woId = document.getElementById("woIdToComplete").value;
  const catatan = document.getElementById("woCompleteCatatan").value.trim();
  const btn = document.getElementById("btnWOCompleteSubmit");

  const email = sessionStorage.getItem("admin_email");
  const pass = sessionStorage.getItem("admin_pass");

  const payload = {
    action: "complete_work_order",
    email: email,
    password: pass,
    woId: woId,
    catatanProgress: catatan
  };

  if (isUploadActive && uploadedFile.data) {
    payload.fileData = uploadedFile.data;
    payload.fileMimeType = uploadedFile.mimeType;
    payload.fileName = uploadedFile.name;
  } else if (!isUploadActive) {
    payload.fileLinkUrl = document.getElementById("fileWOLinkUrl").value;
  }

  submitPayloadWithProgress(
    API_URL,
    payload,
    btn,
    (resData) => {
      if (resData.success) {
        alert("Work Order berhasil diselesaikan!");
        closeWOCompleteModal();
        fetchWorkOrdersList();
        fetchReportsList();
      } else {
        alert("Gagal menyelesaikan Work Order: " + resData.message);
      }
    },
    (err) => {
      console.error(err);
      alert("Gagal menghubungi server: " + err.message);
    }
  );
}

// ==========================================
// 6. UTILITY: FORMAT TANGGAL
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
