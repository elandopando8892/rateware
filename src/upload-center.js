import { applyPermissionState, ensureSignedIn, initAuthControls, requirePrivatePage } from "./auth.js";
import { isAllowedFile } from "./file-rules.js";
import { uploadRawFile } from "./upload-service.js";
import { fetchVendors } from "./vendor-service.js";

const dropZone = document.querySelector("#drop-zone");
const fileInput = document.querySelector("#file-input");
const fileList = document.querySelector("#file-list");
const form = document.querySelector("#upload-form");
const statusMessage = document.querySelector("#status-message");
const uploadButton = document.querySelector("#upload-button");
const vendorSelect = document.querySelector("#vendor-select");
const vendorInput = document.querySelector("#vendor-input");
const rfxInput = document.querySelector("#rfx-input");

let selectedFiles = [];

function setStatus(message, tone = "neutral") {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderFiles() {
  fileList.classList.toggle("empty", selectedFiles.length === 0);

  if (selectedFiles.length === 0) {
    fileList.innerHTML = "<li>No files selected</li>";
    return;
  }

  fileList.innerHTML = selectedFiles
    .map((file) => {
      const allowed = isAllowedFile(file);
      const state = allowed ? "Ready" : "Rejected";
      return `
        <li class="${allowed ? "" : "rejected"}">
          <span>
            <strong>${file.name}</strong>
            <small>${formatBytes(file.size)} &middot; ${file.type || "unknown type"}</small>
          </span>
          <em>${state}</em>
        </li>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadVendorOptions() {
  try {
    const vendors = await fetchVendors({ status: "active" });
    vendorSelect.innerHTML = [
      '<option value="">Auto-detect vendor</option>',
      ...vendors.map((vendor) => `<option value="${escapeHtml(vendor.id)}">${escapeHtml(vendor.vendor_name)}</option>`)
    ].join("");
  } catch (error) {
    vendorSelect.innerHTML = '<option value="">Auto-detect vendor</option>';
    vendorSelect.title = error.message;
  }
}

function addFiles(files) {
  selectedFiles = [...selectedFiles, ...Array.from(files)];
  renderFiles();
  const rejected = selectedFiles.filter((file) => !isAllowedFile(file)).length;
  setStatus(rejected ? `${rejected} file type will be skipped.` : `${selectedFiles.length} file(s) ready.`);
}

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  addFiles(event.dataTransfer.files);
});

dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const uploadableFiles = selectedFiles.filter((file) => isAllowedFile(file));

  if (uploadableFiles.length === 0) {
    setStatus("Choose at least one XLSX, PDF, image, or EML email file.", "error");
    return;
  }

  uploadButton.disabled = true;
  setStatus(`Uploading ${uploadableFiles.length} source file(s)...`);

  const failures = [];
  let uploaded = 0;

  try {
    await ensureSignedIn();
    if (!(await applyPermissionState("#upload-button", "uploads:create"))) {
      throw new Error("Your role does not allow uploads.");
    }
  } catch (error) {
    uploadButton.disabled = false;
    setStatus(error.message, "error");
    return;
  }

  for (const file of uploadableFiles) {
    try {
      await uploadRawFile(file, {
        vendorId: vendorSelect.value,
        vendor: vendorInput.value,
        rfx: rfxInput.value
      });
      uploaded += 1;
      setStatus(`Uploaded ${uploaded} of ${uploadableFiles.length} file(s).`);
    } catch (error) {
      failures.push(`${file.name}: ${error.message}`);
    }
  }

  uploadButton.disabled = false;

  if (failures.length) {
    setStatus(`${uploaded} uploaded. ${failures.length} failed. ${failures.join(" ")}`, "error");
    return;
  }

  selectedFiles = [];
  renderFiles();
  setStatus("Upload complete. Source files are preserved and ready for rate_staging.", "success");
});

initAuthControls();
requirePrivatePage()
  .then(async () => {
    await loadVendorOptions();
    await applyPermissionState("#upload-button", "uploads:create");
  })
  .catch(() => {});
renderFiles();
