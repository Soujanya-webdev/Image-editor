/**
 * LensLab — Basic Image Editor
 * Vanilla JS + Canvas API
 * All processing happens locally in the browser.
 */

(function () {
  "use strict";

  // ========== DOM References ==========
  const fileInput = document.getElementById("file-input");
  const btnOpen = document.getElementById("btn-open");
  const btnChoose = document.getElementById("btn-choose");
  const btnUndo = document.getElementById("btn-undo");
  const btnRedo = document.getElementById("btn-redo");
  const btnReset = document.getElementById("btn-reset");
  const btnDownload = document.getElementById("btn-download");
  const btnBeforeAfter = document.getElementById("btn-before-after");

  const emptyState = document.getElementById("empty-state");
  const canvasContainer = document.getElementById("canvas-container");
  const canvasWrap = document.getElementById("canvas-wrap");
  const mainCanvas = document.getElementById("main-canvas");
  const overlayCanvas = document.getElementById("overlay-canvas");
  const ctx = mainCanvas.getContext("2d", { willReadFrequently: true });
  const overlayCtx = overlayCanvas.getContext("2d");

  const bottomBar = document.getElementById("bottom-bar");
  const imageInfo = document.getElementById("image-info");
  const toastEl = document.getElementById("toast");

  // Adjustments
  const brightnessSlider = document.getElementById("brightness");
  const contrastSlider = document.getElementById("contrast");
  const saturationSlider = document.getElementById("saturation");
  const exposureSlider = document.getElementById("exposure");
  const blurSlider = document.getElementById("blur");
  const brightnessVal = document.getElementById("brightness-val");
  const contrastVal = document.getElementById("contrast-val");
  const saturationVal = document.getElementById("saturation-val");
  const exposureVal = document.getElementById("exposure-val");
  const blurVal = document.getElementById("blur-val");

  // Filters
  const filterBtns = document.querySelectorAll(".filter-btn");

  // Transform
  const btnRotateLeft = document.getElementById("btn-rotate-left");
  const btnRotateRight = document.getElementById("btn-rotate-right");
  const btnFlipH = document.getElementById("btn-flip-h");
  const btnFlipV = document.getElementById("btn-flip-v");
  const btnResetTransform = document.getElementById("btn-reset-transform");

  // Crop
  const btnCropStart = document.getElementById("btn-crop-start");
  const btnCropApply = document.getElementById("btn-crop-apply");
  const btnCropCancel = document.getElementById("btn-crop-cancel");
  const cropOverlay = document.getElementById("crop-overlay");
  const cropBox = document.getElementById("crop-box");

  // Text
  const textInput = document.getElementById("text-input");
  const fontSizeSlider = document.getElementById("font-size");
  const fontSizeVal = document.getElementById("font-size-val");
  const fontFamilySelect = document.getElementById("font-family");
  const textColorInput = document.getElementById("text-color");
  const btnAddText = document.getElementById("btn-add-text");
  const btnRemoveText = document.getElementById("btn-remove-text");

  // Export
  const exportFormat = document.getElementById("export-format");
  const jpgQualityGroup = document.getElementById("jpg-quality-group");
  const jpgQuality = document.getElementById("jpg-quality");
  const jpgQualityVal = document.getElementById("jpg-quality-val");

  // ========== State ==========
  let originalImage = null;       // HTMLImageElement of original upload
  let originalFileName = "";
  let originalFileType = "";
  let workingCanvas = null;       // Offscreen canvas holding current pixel state (after crop/transform)
  let history = [];               // Array of ImageData snapshots
  let historyIndex = -1;
  const MAX_HISTORY = 30;

  // Current adjustment values (applied on top of workingCanvas)
  let adjustments = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    exposure: 0,
    blur: 0
  };
  let activeFilter = "none"; // none | grayscale | sepia | invert
  let rotation = 0;          // 0, 90, 180, 270
  let flipH = false;
  let flipV = false;

  // Text overlays: { text, x, y, size, font, color }
  let textLayers = [];

  // Before/After mode
  let showingOriginal = false;

  // Crop state
  let isCropping = false;
  let cropStart = null;
  let cropRect = null; // {x, y, w, h} in display coordinates

  // Debounce for continuous slider updates
  let renderPending = false;

  // ========== Utility ==========
  function showToast(message, isError) {
    toastEl.textContent = message;
    toastEl.className = "toast show" + (isError ? " error" : "");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2800);
  }

  function enableControls(enabled) {
    const controls = [
      brightnessSlider, contrastSlider, saturationSlider, exposureSlider, blurSlider,
      btnRotateLeft, btnRotateRight, btnFlipH, btnFlipV, btnResetTransform,
      btnCropStart, textInput, fontSizeSlider, fontFamilySelect, textColorInput,
      btnAddText, btnRemoveText, exportFormat, jpgQuality,
      btnReset, btnDownload, btnBeforeAfter
    ];
    controls.forEach(function (el) {
      if (el) el.disabled = !enabled;
    });
    filterBtns.forEach(function (btn) {
      btn.disabled = !enabled;
    });
    btnUndo.disabled = !enabled || historyIndex <= 0;
    btnRedo.disabled = !enabled || historyIndex >= history.length - 1;
  }

  // ========== Image Loading ==========
  function loadImageFromFile(file) {
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      showToast("Unsupported file type. Use JPG, PNG, or WEBP.", true);
      return;
    }

    // Soft limit ~25 MB
    if (file.size > 25 * 1024 * 1024) {
      showToast("Image is very large. Performance may be affected.", true);
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        // Cap extremely large dimensions to protect memory
        const MAX_DIM = 4096;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > MAX_DIM || h > MAX_DIM) {
          const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
          const temp = document.createElement("canvas");
          temp.width = w;
          temp.height = h;
          const tctx = temp.getContext("2d");
          tctx.drawImage(img, 0, 0, w, h);
          const scaled = new Image();
          scaled.onload = function () {
            setupImage(scaled, file.name, file.type);
          };
          scaled.src = temp.toDataURL("image/png");
        } else {
          setupImage(img, file.name, file.type);
        }
      };
      img.onerror = function () {
        showToast("Failed to load image.", true);
      };
      img.src = e.target.result;
    };
    reader.onerror = function () {
      showToast("Failed to read file.", true);
    };
    reader.readAsDataURL(file);
  }

  function setupImage(img, fileName, fileType) {
    originalImage = img;
    originalFileName = fileName || "image";
    originalFileType = fileType || "image/png";

    // Create working canvas at full resolution
    workingCanvas = document.createElement("canvas");
    workingCanvas.width = img.naturalWidth;
    workingCanvas.height = img.naturalHeight;
    const wctx = workingCanvas.getContext("2d");
    wctx.drawImage(img, 0, 0);

    // Reset state
    adjustments = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, blur: 0 };
    activeFilter = "none";
    rotation = 0;
    flipH = false;
    flipV = false;
    textLayers = [];
    showingOriginal = false;
    isCropping = false;
    cropRect = null;

    // Reset UI controls
    brightnessSlider.value = 0;
    contrastSlider.value = 0;
    saturationSlider.value = 0;
    exposureSlider.value = 0;
    blurSlider.value = 0;
    brightnessVal.textContent = "0";
    contrastVal.textContent = "0";
    saturationVal.textContent = "0";
    exposureVal.textContent = "0";
    blurVal.textContent = "0";
    filterBtns.forEach(function (b) {
      b.classList.toggle("active", b.dataset.filter === "none");
    });
    textInput.value = "";
    fontSizeSlider.value = 32;
    fontSizeVal.textContent = "32";
    btnBeforeAfter.classList.remove("active");
    hideCropUI();

    // History
    history = [];
    historyIndex = -1;
    pushHistory();

    // Show canvas
    emptyState.style.display = "none";
    canvasContainer.style.display = "flex";
    bottomBar.style.display = "flex";

    enableControls(true);
    updateImageInfo();
    render();
    showToast("Image loaded");
  }

  function updateImageInfo() {
    if (!originalImage) {
      imageInfo.textContent = "";
      return;
    }
    const type = (originalFileType || "").replace("image/", "").toUpperCase() || "IMG";
    imageInfo.textContent =
      originalImage.naturalWidth + " × " + originalImage.naturalHeight + "  ·  " + type;
  }

  // ========== History (Undo / Redo) ==========
  function pushHistory() {
    // Store a snapshot of the working canvas + metadata
    if (!workingCanvas) return;

    // Trim future if we branched
    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }

    const snapshot = {
      imageData: workingCanvas.getContext("2d").getImageData(0, 0, workingCanvas.width, workingCanvas.height),
      width: workingCanvas.width,
      height: workingCanvas.height,
      adjustments: Object.assign({}, adjustments),
      activeFilter: activeFilter,
      rotation: rotation,
      flipH: flipH,
      flipV: flipV,
      textLayers: textLayers.map(function (t) { return Object.assign({}, t); })
    };

    history.push(snapshot);
    if (history.length > MAX_HISTORY) {
      history.shift();
    } else {
      historyIndex++;
    }
    updateUndoRedoButtons();
  }

  function restoreFromHistory(index) {
    if (index < 0 || index >= history.length) return;
    const snap = history[index];
    historyIndex = index;

    workingCanvas.width = snap.width;
    workingCanvas.height = snap.height;
    workingCanvas.getContext("2d").putImageData(snap.imageData, 0, 0);

    adjustments = Object.assign({}, snap.adjustments);
    activeFilter = snap.activeFilter;
    rotation = snap.rotation;
    flipH = snap.flipH;
    flipV = snap.flipV;
    textLayers = snap.textLayers.map(function (t) { return Object.assign({}, t); });

    // Sync UI
    brightnessSlider.value = adjustments.brightness;
    contrastSlider.value = adjustments.contrast;
    saturationSlider.value = adjustments.saturation;
    exposureSlider.value = adjustments.exposure;
    blurSlider.value = adjustments.blur;
    brightnessVal.textContent = adjustments.brightness;
    contrastVal.textContent = adjustments.contrast;
    saturationVal.textContent = adjustments.saturation;
    exposureVal.textContent = adjustments.exposure;
    blurVal.textContent = adjustments.blur;
    filterBtns.forEach(function (b) {
      b.classList.toggle("active", b.dataset.filter === activeFilter);
    });

    updateUndoRedoButtons();
    render();
  }

  function updateUndoRedoButtons() {
    btnUndo.disabled = historyIndex <= 0;
    btnRedo.disabled = historyIndex >= history.length - 1 || history.length === 0;
  }

  function undo() {
    if (historyIndex > 0) {
      restoreFromHistory(historyIndex - 1);
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      restoreFromHistory(historyIndex + 1);
    }
  }

  // ========== Rendering ==========
  /**
   * Build CSS filter string from current adjustments + filter.
   * Applied when drawing the working canvas onto the display canvas.
   */
  function buildFilterString() {
    const parts = [];
    // Exposure approximated via brightness boost
    const brightness = 100 + adjustments.brightness + adjustments.exposure * 0.6;
    const contrast = 100 + adjustments.contrast;
    const saturation = 100 + adjustments.saturation;

    parts.push("brightness(" + brightness + "%)");
    parts.push("contrast(" + contrast + "%)");
    parts.push("saturate(" + saturation + "%)");

    if (adjustments.blur > 0) {
      parts.push("blur(" + adjustments.blur + "px)");
    }

    if (activeFilter === "grayscale") {
      parts.push("grayscale(100%)");
    } else if (activeFilter === "sepia") {
      parts.push("sepia(100%)");
    } else if (activeFilter === "invert") {
      parts.push("invert(100%)");
    }

    return parts.join(" ");
  }

  /**
   * Compute the size of the canvas after rotation.
   */
  function getTransformedSize() {
    if (!workingCanvas) return { w: 0, h: 0 };
    const rot = ((rotation % 360) + 360) % 360;
    if (rot === 90 || rot === 270) {
      return { w: workingCanvas.height, h: workingCanvas.width };
    }
    return { w: workingCanvas.width, h: workingCanvas.height };
  }

  /**
   * Main render: draw working canvas → mainCanvas with filters, transforms, text.
   * Export path uses the same logic but at full resolution.
   */
  function render() {
    if (!workingCanvas || !originalImage) return;
    if (showingOriginal) {
      renderOriginal();
      return;
    }

    const size = getTransformedSize();
    const displayW = size.w;
    const displayH = size.h;

    // Size the visible canvas to the transformed dimensions
    mainCanvas.width = displayW;
    mainCanvas.height = displayH;
    overlayCanvas.width = displayW;
    overlayCanvas.height = displayH;

    // Apply CSS filters while drawing
    ctx.save();
    ctx.filter = buildFilterString();

    // Center and apply rotation + flips
    ctx.translate(displayW / 2, displayH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    if (flipH) ctx.scale(-1, 1);
    if (flipV) ctx.scale(1, -1);

    // Draw working image centered
    ctx.drawImage(
      workingCanvas,
      -workingCanvas.width / 2,
      -workingCanvas.height / 2
    );
    ctx.restore();

    // Draw text layers (in display space, not rotated with image for simplicity)
    drawTextLayers(ctx);

    // Clear overlay (used for crop guides etc.)
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }

  function renderOriginal() {
    if (!originalImage) return;
    mainCanvas.width = originalImage.naturalWidth;
    mainCanvas.height = originalImage.naturalHeight;
    overlayCanvas.width = mainCanvas.width;
    overlayCanvas.height = mainCanvas.height;
    ctx.filter = "none";
    ctx.drawImage(originalImage, 0, 0);
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }

  function drawTextLayers(targetCtx) {
    textLayers.forEach(function (layer) {
      targetCtx.save();
      targetCtx.font = layer.size + "px " + layer.font;
      targetCtx.fillStyle = layer.color;
      targetCtx.textBaseline = "top";
      // Soft shadow for readability
      targetCtx.shadowColor = "rgba(0,0,0,0.6)";
      targetCtx.shadowBlur = 3;
      targetCtx.shadowOffsetX = 1;
      targetCtx.shadowOffsetY = 1;
      targetCtx.fillText(layer.text, layer.x, layer.y);
      targetCtx.restore();
    });
  }

  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(function () {
      renderPending = false;
      render();
    });
  }

  // ========== Adjustments ==========
  function onAdjustmentChange() {
    adjustments.brightness = parseInt(brightnessSlider.value, 10);
    adjustments.contrast = parseInt(contrastSlider.value, 10);
    adjustments.saturation = parseInt(saturationSlider.value, 10);
    adjustments.exposure = parseInt(exposureSlider.value, 10);
    adjustments.blur = parseFloat(blurSlider.value);

    brightnessVal.textContent = adjustments.brightness;
    contrastVal.textContent = adjustments.contrast;
    saturationVal.textContent = adjustments.saturation;
    exposureVal.textContent = adjustments.exposure;
    blurVal.textContent = adjustments.blur;

    scheduleRender();
  }

  // Commit adjustment to history on slider release
  function onAdjustmentCommit() {
    pushHistory();
  }

  // ========== Filters ==========
  function setFilter(name) {
    activeFilter = name;
    filterBtns.forEach(function (b) {
      b.classList.toggle("active", b.dataset.filter === name);
    });
    scheduleRender();
    pushHistory();
  }

  // ========== Transforms ==========
  function rotate(dir) {
    rotation = (rotation + dir * 90 + 360) % 360;
    scheduleRender();
    pushHistory();
  }

  function flip(horizontal) {
    if (horizontal) flipH = !flipH;
    else flipV = !flipV;
    scheduleRender();
    pushHistory();
  }

  function resetTransform() {
    rotation = 0;
    flipH = false;
    flipV = false;
    scheduleRender();
    pushHistory();
  }

  // ========== Crop ==========
  function startCrop() {
    if (!workingCanvas) return;
    isCropping = true;
    cropRect = null;
    cropStart = null;
    cropOverlay.style.display = "block";
    cropBox.style.display = "none";
    btnCropStart.style.display = "none";
    btnCropApply.style.display = "block";
    btnCropCancel.style.display = "block";
    btnCropApply.disabled = true;
    btnCropCancel.disabled = false;
    showToast("Drag on the image to select crop area");
  }

  function hideCropUI() {
    isCropping = false;
    cropOverlay.style.display = "none";
    cropBox.style.display = "none";
    btnCropStart.style.display = "block";
    btnCropApply.style.display = "none";
    btnCropCancel.style.display = "none";
    btnCropStart.disabled = !workingCanvas;
    cropRect = null;
    cropStart = null;
  }

  function cancelCrop() {
    hideCropUI();
  }

  /**
   * Map display coordinates (relative to the visible canvas element)
   * back to the current mainCanvas pixel coordinates.
   */
  function getCanvasCoords(clientX, clientY) {
    const rect = mainCanvas.getBoundingClientRect();
    const scaleX = mainCanvas.width / rect.width;
    const scaleY = mainCanvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function onCropPointerDown(e) {
    if (!isCropping) return;
    e.preventDefault();
    const pt = getCanvasCoords(e.clientX || (e.touches && e.touches[0].clientX), e.clientY || (e.touches && e.touches[0].clientY));
    cropStart = pt;
    cropRect = { x: pt.x, y: pt.y, w: 0, h: 0 };
    updateCropBoxVisual();
  }

  function onCropPointerMove(e) {
    if (!isCropping || !cropStart) return;
    e.preventDefault();
    const pt = getCanvasCoords(e.clientX || (e.touches && e.touches[0].clientX), e.clientY || (e.touches && e.touches[0].clientY));
    const x = Math.min(cropStart.x, pt.x);
    const y = Math.min(cropStart.y, pt.y);
    const w = Math.abs(pt.x - cropStart.x);
    const h = Math.abs(pt.y - cropStart.y);
    cropRect = { x: x, y: y, w: w, h: h };
    updateCropBoxVisual();
    btnCropApply.disabled = w < 4 || h < 4;
  }

  function onCropPointerUp() {
    // Keep selection; user must click Apply
  }

  function updateCropBoxVisual() {
    if (!cropRect) {
      cropBox.style.display = "none";
      return;
    }
    const rect = mainCanvas.getBoundingClientRect();
    const containerRect = canvasContainer.getBoundingClientRect();
    const scaleX = rect.width / mainCanvas.width;
    const scaleY = rect.height / mainCanvas.height;

    // Position relative to canvasContainer
    const offsetLeft = rect.left - containerRect.left;
    const offsetTop = rect.top - containerRect.top;

    cropBox.style.display = "block";
    cropBox.style.left = offsetLeft + cropRect.x * scaleX + "px";
    cropBox.style.top = offsetTop + cropRect.y * scaleY + "px";
    cropBox.style.width = cropRect.w * scaleX + "px";
    cropBox.style.height = cropRect.h * scaleY + "px";
  }

  /**
   * Apply crop: take the selected region from the *currently rendered* image
   * (including filters/transforms) and make it the new working canvas.
   * This bakes filters into the pixels for simplicity and correctness after crop.
   */
  function applyCrop() {
    if (!cropRect || cropRect.w < 4 || cropRect.h < 4) {
      showToast("Select a larger area to crop", true);
      return;
    }

    // Render current state at full res into a temp canvas (without text for crop source)
    const size = getTransformedSize();
    const temp = document.createElement("canvas");
    temp.width = size.w;
    temp.height = size.h;
    const tctx = temp.getContext("2d");
    tctx.filter = buildFilterString();
    tctx.translate(size.w / 2, size.h / 2);
    tctx.rotate((rotation * Math.PI) / 180);
    if (flipH) tctx.scale(-1, 1);
    if (flipV) tctx.scale(1, -1);
    tctx.drawImage(workingCanvas, -workingCanvas.width / 2, -workingCanvas.height / 2);

    // Clamp crop rect
    const sx = Math.max(0, Math.floor(cropRect.x));
    const sy = Math.max(0, Math.floor(cropRect.y));
    const sw = Math.min(Math.floor(cropRect.w), temp.width - sx);
    const sh = Math.min(Math.floor(cropRect.h), temp.height - sy);

    if (sw < 2 || sh < 2) {
      showToast("Crop area too small", true);
      return;
    }

    // New working canvas = cropped region
    workingCanvas = document.createElement("canvas");
    workingCanvas.width = sw;
    workingCanvas.height = sh;
    workingCanvas.getContext("2d").drawImage(temp, sx, sy, sw, sh, 0, 0, sw, sh);

    // Reset transforms & adjustments (baked in)
    adjustments = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, blur: 0 };
    activeFilter = "none";
    rotation = 0;
    flipH = false;
    flipV = false;
    textLayers = []; // text was not baked; clear for simplicity

    // Sync UI
    brightnessSlider.value = 0;
    contrastSlider.value = 0;
    saturationSlider.value = 0;
    exposureSlider.value = 0;
    blurSlider.value = 0;
    brightnessVal.textContent = "0";
    contrastVal.textContent = "0";
    saturationVal.textContent = "0";
    exposureVal.textContent = "0";
    blurVal.textContent = "0";
    filterBtns.forEach(function (b) {
      b.classList.toggle("active", b.dataset.filter === "none");
    });

    hideCropUI();
    pushHistory();
    render();
    updateImageInfo();
    showToast("Crop applied");
  }

  // ========== Text ==========
  function addText() {
    const text = textInput.value.trim();
    if (!text) {
      showToast("Enter some text first", true);
      return;
    }
    if (!workingCanvas) return;

    const size = getTransformedSize();
    const fontSize = parseInt(fontSizeSlider.value, 10);
    const layer = {
      text: text,
      x: Math.round(size.w * 0.1),
      y: Math.round(size.h * 0.1 + textLayers.length * (fontSize + 8)),
      size: fontSize,
      font: fontFamilySelect.value,
      color: textColorInput.value
    };
    textLayers.push(layer);
    textInput.value = "";
    scheduleRender();
    pushHistory();
    showToast("Text added");
  }

  function removeAllText() {
    if (textLayers.length === 0) return;
    textLayers = [];
    scheduleRender();
    pushHistory();
    showToast("Text removed");
  }

  // ========== Before / After ==========
  function toggleBeforeAfter() {
    if (!originalImage) return;
    showingOriginal = !showingOriginal;
    btnBeforeAfter.classList.toggle("active", showingOriginal);
    render();
  }

  // ========== Reset ==========
  function resetAll() {
    if (!originalImage) return;
    // Re-setup from original
    setupImage(originalImage, originalFileName, originalFileType);
    showToast("All edits reset");
  }

  // ========== Export / Download ==========
  function downloadImage() {
    if (!workingCanvas) {
      showToast("No image to download", true);
      return;
    }

    try {
      // Render full-resolution export (same pipeline as display)
      const size = getTransformedSize();
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = size.w;
      exportCanvas.height = size.h;
      const ectx = exportCanvas.getContext("2d");

      ectx.filter = buildFilterString();
      ectx.translate(size.w / 2, size.h / 2);
      ectx.rotate((rotation * Math.PI) / 180);
      if (flipH) ectx.scale(-1, 1);
      if (flipV) ectx.scale(1, -1);
      ectx.drawImage(workingCanvas, -workingCanvas.width / 2, -workingCanvas.height / 2);
      ectx.setTransform(1, 0, 0, 1, 0, 0);
      ectx.filter = "none";
      drawTextLayers(ectx);

      const format = exportFormat.value || "image/png";
      const quality = format === "image/jpeg" ? parseFloat(jpgQuality.value) : undefined;
      const ext = format === "image/jpeg" ? "jpg" : "png";

      // Strip original extension and add new one
      let baseName = originalFileName.replace(/\.[^.]+$/, "") || "lenslab-edit";
      const fileName = baseName + "-edited." + ext;

      exportCanvas.toBlob(
        function (blob) {
          if (!blob) {
            showToast("Export failed", true);
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast("Downloaded " + fileName);
        },
        format,
        quality
      );
    } catch (err) {
      console.error(err);
      showToast("Download failed", true);
    }
  }

  // ========== Event Listeners ==========
  // File open
  btnOpen.addEventListener("click", function () { fileInput.click(); });
  btnChoose.addEventListener("click", function () { fileInput.click(); });
  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files[0]) {
      loadImageFromFile(fileInput.files[0]);
      fileInput.value = "";
    }
  });

  // Drag & drop
  ["dragenter", "dragover", "dragleave", "drop"].forEach(function (evt) {
    canvasWrap.addEventListener(evt, function (e) {
      e.preventDefault();
      e.stopPropagation();
    });
  });
  canvasWrap.addEventListener("dragenter", function () {
    emptyState.classList.add("drag-over");
  });
  canvasWrap.addEventListener("dragleave", function (e) {
    if (!canvasWrap.contains(e.relatedTarget)) {
      emptyState.classList.remove("drag-over");
    }
  });
  canvasWrap.addEventListener("drop", function (e) {
    emptyState.classList.remove("drag-over");
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      loadImageFromFile(files[0]);
    }
  });

  // Header actions
  btnUndo.addEventListener("click", undo);
  btnRedo.addEventListener("click", redo);
  btnReset.addEventListener("click", resetAll);
  btnDownload.addEventListener("click", downloadImage);
  btnBeforeAfter.addEventListener("click", toggleBeforeAfter);

  // Adjustments – live update + commit on release
  [brightnessSlider, contrastSlider, saturationSlider, exposureSlider, blurSlider].forEach(function (slider) {
    slider.addEventListener("input", onAdjustmentChange);
    slider.addEventListener("change", onAdjustmentCommit);
  });

  // Filters
  filterBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setFilter(btn.dataset.filter);
    });
  });

  // Transform
  btnRotateLeft.addEventListener("click", function () { rotate(-1); });
  btnRotateRight.addEventListener("click", function () { rotate(1); });
  btnFlipH.addEventListener("click", function () { flip(true); });
  btnFlipV.addEventListener("click", function () { flip(false); });
  btnResetTransform.addEventListener("click", resetTransform);

  // Crop
  btnCropStart.addEventListener("click", startCrop);
  btnCropApply.addEventListener("click", applyCrop);
  btnCropCancel.addEventListener("click", cancelCrop);

  cropOverlay.addEventListener("mousedown", onCropPointerDown);
  cropOverlay.addEventListener("mousemove", onCropPointerMove);
  cropOverlay.addEventListener("mouseup", onCropPointerUp);
  cropOverlay.addEventListener("mouseleave", onCropPointerUp);
  cropOverlay.addEventListener("touchstart", onCropPointerDown, { passive: false });
  cropOverlay.addEventListener("touchmove", onCropPointerMove, { passive: false });
  cropOverlay.addEventListener("touchend", onCropPointerUp);

  // Text
  fontSizeSlider.addEventListener("input", function () {
    fontSizeVal.textContent = fontSizeSlider.value;
  });
  btnAddText.addEventListener("click", addText);
  btnRemoveText.addEventListener("click", removeAllText);
  textInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") addText();
  });

  // Export format
  exportFormat.addEventListener("change", function () {
    jpgQualityGroup.style.display = exportFormat.value === "image/jpeg" ? "block" : "none";
  });
  jpgQuality.addEventListener("input", function () {
    jpgQualityVal.textContent = Math.round(parseFloat(jpgQuality.value) * 100) + "%";
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  });

  // Window resize – re-render to keep crispness
  let resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (workingCanvas) scheduleRender();
    }, 100);
  });

  // Initial state
  enableControls(false);
})();
 
 