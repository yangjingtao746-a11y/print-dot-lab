const canvas = document.querySelector("#preview");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const fileInput = document.querySelector("#fileInput");
const dropzone = document.querySelector(".dropzone");
const clearImageBtn = document.querySelector("#clearImageBtn");
const uploadPreview = document.querySelector("#uploadPreview");
const uploadHint = document.querySelector("#uploadHint");
const downloadBtn = document.querySelector("#downloadBtn");
const downloadSvgBtn = document.querySelector("#downloadSvgBtn");
const stashBtn = document.querySelector("#stashBtn");
const compareBtn = document.querySelector("#compareBtn");
const clearCacheBtn = document.querySelector("#clearCacheBtn");
const closeCompareBtn = document.querySelector("#closeCompareBtn");
const resetBtn = document.querySelector("#resetBtn");
const sampleBtn = document.querySelector("#sampleBtn");
const transparentOnly = document.querySelector("#transparentOnly");
const invertOutput = document.querySelector("#invertOutput");
const blurFirst = document.querySelector("#blurFirst");
const keepHue = document.querySelector("#keepHue");
const grainMode = document.querySelector("#grainMode");
const grainShape = document.querySelector("#grainShape");
const grainText = document.querySelector("#grainText");
const grainFont = document.querySelector("#grainFont");
const grainFontName = document.querySelector("#grainFontName");
const statusText = document.querySelector("#status");
const dimensionBadge = document.querySelector("#dimensionBadge");
const stashTray = document.querySelector("#stashTray");
const stashCount = document.querySelector("#stashCount");
const stashPanel = document.querySelector(".stash-panel");
const stashBookmark = document.querySelector("#stashBookmark");
const comparePanel = document.querySelector("#comparePanel");
const compareGrid = document.querySelector("#compareGrid");
const zoomModal = document.querySelector("#zoomModal");
const zoomImage = document.querySelector("#zoomImage");
const closeZoomBtn = document.querySelector("#closeZoomBtn");

const controls = {
  threshold: document.querySelector("#threshold"),
  contrast: document.querySelector("#contrast"),
  grain: document.querySelector("#grain"),
  noise: document.querySelector("#noise"),
  edge: document.querySelector("#edge"),
  bg: document.querySelector("#bg"),
  blur: document.querySelector("#blur"),
  size: document.querySelector("#size"),
  hue: document.querySelector("#hue"),
  saturation: document.querySelector("#saturation"),
  lightness: document.querySelector("#lightness"),
  textStroke: document.querySelector("#textStroke"),
};

const outputs = {
  threshold: document.querySelector("#thresholdValue"),
  contrast: document.querySelector("#contrastValue"),
  grain: document.querySelector("#grainValue"),
  noise: document.querySelector("#noiseValue"),
  edge: document.querySelector("#edgeValue"),
  bg: document.querySelector("#bgValue"),
  blur: document.querySelector("#blurValue"),
  size: document.querySelector("#sizeValue"),
  hue: document.querySelector("#hueValue"),
  saturation: document.querySelector("#saturationValue"),
  lightness: document.querySelector("#lightnessValue"),
  textStroke: document.querySelector("#textStrokeValue"),
};

const defaults = {
  threshold: 142,
  contrast: 1.35,
  grain: 7,
  noise: 22,
  edge: 64,
  bg: 235,
  blur: 2,
  size: 1200,
  hue: 0,
  saturation: 100,
  lightness: 24,
  textStroke: 0,
};

let sourceImage = null;
let sourceName = "print-effect";
let renderTimer = 0;
let stashItems = [];
let selectedStashId = null;
let customFontFace = null;
let customFontUrl = "";
let customFontFamily = "system-ui, sans-serif";

function values() {
  return {
    threshold: Number(controls.threshold.value),
    contrast: Number(controls.contrast.value),
    grain: Number(controls.grain.value),
    noise: Number(controls.noise.value),
    edge: Number(controls.edge.value),
    bg: Number(controls.bg.value),
    blur: Number(controls.blur.value),
    size: Number(controls.size.value),
    hue: Number(controls.hue.value),
    saturation: Number(controls.saturation.value),
    lightness: Number(controls.lightness.value),
    textStroke: Number(controls.textStroke.value),
  };
}

function syncOutputs() {
  const current = values();
  Object.entries(current).forEach(([key, value]) => {
    outputs[key].value = ["contrast", "blur", "textStroke"].includes(key) ? value.toFixed(key === "contrast" ? 2 : 1) : Math.round(value);
  });
}

function scheduleRender() {
  syncOutputs();
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, 25);
}

function syncGrainModeUi() {
  const isShapeMode = grainMode.value === "shape";
  const isTextShape = isShapeMode && grainShape.value === "text";
  grainShape.closest("label").hidden = !isShapeMode;
  grainText.closest("label").hidden = !isTextShape;
  controls.textStroke.closest("label").hidden = !isTextShape;
  grainFont.closest("label").hidden = !isTextShape;
}

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function luma(r, g, b) {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    if (max === g) h = (b - r) / d + 2;
    if (max === b) h = (r - g) / d + 4;
    h /= 6;
  }

  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;

  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function seededNoise(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function orderedDither(x, y, scale) {
  const matrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const ix = Math.floor(x / scale) % 4;
  const iy = Math.floor(y / scale) % 4;
  return (matrix[iy][ix] / 15 - 0.5) * 80;
}

function colorForPixel(p, colorMap) {
  if (keepHue.checked) {
    const colorIndex = p * 3;
    return [colorMap[colorIndex], colorMap[colorIndex + 1], colorMap[colorIndex + 2]];
  }
  return [16, 14, 12];
}

function fillCanvasShape(context, shape, text, x, y, size, rotation = 0) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.beginPath();

  if (shape === "circle") {
    context.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    context.fill();
  } else if (shape === "triangle") {
    context.moveTo(0, -size * 0.58);
    context.lineTo(size * 0.58, size * 0.48);
    context.lineTo(-size * 0.58, size * 0.48);
    context.closePath();
    context.fill();
  } else if (shape === "heart") {
    const s = size / 32;
    context.moveTo(0, 10 * s);
    context.bezierCurveTo(-28 * s, -8 * s, -12 * s, -26 * s, 0, -12 * s);
    context.bezierCurveTo(12 * s, -26 * s, 28 * s, -8 * s, 0, 10 * s);
    context.fill();
  } else if (shape === "star") {
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? size * 0.55 : size * 0.23;
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
  } else if (shape === "square") {
    context.fillRect(-size * 0.5, -size * 0.5, size, size);
  } else if (shape === "rect") {
    context.fillRect(-size * 0.55, -size * 0.22, size * 1.1, size * 0.44);
  } else if (shape === "cross") {
    context.lineWidth = Math.max(1.5, size * 0.22);
    context.lineCap = "square";
    context.beginPath();
    context.moveTo(-size * 0.45, -size * 0.45);
    context.lineTo(size * 0.45, size * 0.45);
    context.moveTo(size * 0.45, -size * 0.45);
    context.lineTo(-size * 0.45, size * 0.45);
    context.stroke();
  } else if (shape === "text") {
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `900 ${Math.max(6, size * 0.9)}px ${customFontFamily}`;
    context.fillText(text || "TEXT", 0, 0);
    const strokeWidth = values().textStroke;
    if (strokeWidth > 0) {
      context.lineJoin = "round";
      context.lineWidth = Math.max(0.5, size * (strokeWidth / 100));
      context.strokeText(text || "TEXT", 0, 0);
    }
  }

  context.restore();
}

function fitCanvas(img, targetWidth) {
  const ratio = img.naturalHeight / img.naturalWidth;
  canvas.width = targetWidth;
  canvas.height = Math.max(1, Math.round(targetWidth * ratio));
}

function drawPlaceholder() {
  canvas.width = 1200;
  canvas.height = 1500;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.74)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#202327";
  ctx.font = "700 42px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("上传图片开始处理", canvas.width / 2, canvas.height / 2 - 12);
  ctx.fillStyle = "#6d737c";
  ctx.font = "24px system-ui";
  ctx.fillText("可导出透明底 PNG", canvas.width / 2, canvas.height / 2 + 34);
}

function setUploadPreview(src, name) {
  uploadPreview.src = src;
  uploadPreview.hidden = false;
  clearImageBtn.hidden = false;
  dropzone.classList.add("has-image");
  uploadHint.textContent = name || "已上传图片，点击叉号可移除";
}

function clearCurrentImage() {
  sourceImage = null;
  fileInput.value = "";
  uploadPreview.removeAttribute("src");
  uploadPreview.hidden = true;
  clearImageBtn.hidden = true;
  dropzone.classList.remove("has-image");
  uploadHint.textContent = "也可以把图片拖到这里";
  downloadBtn.disabled = true;
  downloadSvgBtn.disabled = true;
  stashBtn.disabled = true;
  statusText.textContent = "先上传一张图片，或使用示例图。";
  dimensionBadge.textContent = "未载入";
  drawPlaceholder();
}

function drawShapeGrains(toneMap, alphaMask, colorMap, width, height, opts) {
  const shape = grainShape.value;
  const text = grainText.value.trim() || "TEXT";
  const textParts = text.includes("\n")
    ? text.split(/\n+/).map((part) => part.trim()).filter(Boolean)
    : [text];
  const step = shape === "text" ? Math.max(5, Math.round(opts.grain * 1.9)) : Math.max(4, Math.round(opts.grain * 1.25));

  ctx.save();

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      let visibleCount = 0;
      let toneTotal = 0;
      let cr = 0;
      let cg = 0;
      let cb = 0;
      const yEnd = Math.min(height, y + step);
      const xEnd = Math.min(width, x + step);

      for (let yy = y; yy < yEnd; yy += 1) {
        for (let xx = x; xx < xEnd; xx += 1) {
          const p = yy * width + xx;
          if (alphaMask[p] === 0) continue;
          const tone = toneMap[p];
          if (tone <= 0.01) continue;
          visibleCount += 1;
          toneTotal += tone;
          const [r, g, b] = colorForPixel(p, colorMap);
          cr += r * tone;
          cg += g * tone;
          cb += b * tone;
        }
      }

      if (visibleCount === 0 || toneTotal <= 0.05) continue;

      const toneAverage = toneTotal / visibleCount;
      const skipThreshold = 0.035 + seededNoise(x, y) * 0.035;
      if (toneAverage < skipThreshold) continue;

      const cx = x + step / 2 + (seededNoise(x * 0.31, y * 0.17) - 0.5) * step * 0.1;
      const cy = y + step / 2 + (seededNoise(x * 0.19, y * 0.43) - 0.5) * step * 0.1;
      const size = shape === "text"
        ? step * clamp(0.18 + Math.sqrt(toneAverage) * 0.82, 0.2, 0.94)
        : step * clamp(0.16 + Math.sqrt(toneAverage) * 1.45, 0.18, 1.62);
      const rotationAmount = shape === "text" ? Math.PI * 0.18 : Math.PI * 0.45;
      const rotation = (seededNoise(x * 0.73, y * 0.91) - 0.5) * rotationAmount;

      ctx.fillStyle = `rgb(${Math.round(cr / toneTotal)}, ${Math.round(cg / toneTotal)}, ${Math.round(cb / toneTotal)})`;
      ctx.strokeStyle = ctx.fillStyle;
      const textIndex = Math.floor(seededNoise(x * 1.37, y * 1.61) * textParts.length);

      if (shape === "text") {
        fillCanvasShape(ctx, shape, textParts[textIndex] || "TEXT", cx, cy, size, rotation);
      } else {
        fillCanvasShape(ctx, shape, textParts[textIndex] || "TEXT", cx, cy, size, rotation);
      }
    }
  }

  ctx.restore();
}

function render() {
  if (!sourceImage) {
    drawPlaceholder();
    return;
  }

  const opts = values();
  fitCanvas(sourceImage, opts.size);

  const work = document.createElement("canvas");
  work.width = canvas.width;
  work.height = canvas.height;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  wctx.filter = blurFirst.checked && opts.blur > 0 ? `blur(${opts.blur}px)` : "none";
  wctx.drawImage(sourceImage, 0, 0, work.width, work.height);
  wctx.filter = "none";

  const image = wctx.getImageData(0, 0, work.width, work.height);
  const data = image.data;
  const width = image.width;
  const height = image.height;
  const gray = new Float32Array(width * height);
  const alphaMask = new Uint8ClampedArray(width * height);
  const colorMap = new Uint8ClampedArray(width * height * 3);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = luma(r, g, b);
    const saturation = max - min;
    const whiteness = transparentOnly.checked && brightness > opts.bg && saturation < 34;

    gray[p] = clamp((brightness - 128) * opts.contrast + 128);
    alphaMask[p] = whiteness ? 0 : 255;

    if (keepHue.checked) {
      const [h, s] = rgbToHsl(r, g, b);
      const saturation = clamp(Math.max(0.35, s) * (opts.saturation / 100), 0, 1);
      const [cr, cg, cb] = hslToRgb(h + opts.hue, saturation, opts.lightness / 100);
      const ci = p * 3;
      colorMap[ci] = cr;
      colorMap[ci + 1] = cg;
      colorMap[ci + 2] = cb;
    }
  }

  const out = ctx.createImageData(width, height);
  const outData = out.data;
  const shapedMode = grainMode.value === "shape";
  const toneMap = shapedMode ? new Float32Array(width * height) : null;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const outIndex = p * 4;

      if (alphaMask[p] === 0) {
        outData[outIndex + 3] = 0;
        continue;
      }

      const left = gray[y * width + Math.max(0, x - 1)];
      const right = gray[y * width + Math.min(width - 1, x + 1)];
      const top = gray[Math.max(0, y - 1) * width + x];
      const bottom = gray[Math.min(height - 1, y + 1) * width + x];
      const edge = Math.abs(right - left) + Math.abs(bottom - top);
      const pattern = orderedDither(x, y, opts.grain);
      const jitter = (seededNoise(x, y) - 0.5) * opts.noise;
      const adjusted = gray[p] + pattern + jitter - edge * (opts.edge / 150);
      const isInk = adjusted < opts.threshold || edge > 255 - opts.edge;
      const finalInk = invertOutput.checked ? !isInk : isInk;

      if (shapedMode) {
        let tone = clamp((opts.threshold - adjusted + 90) / 180, 0, 1);
        if (edge > 255 - opts.edge) tone = Math.max(tone, 0.85);
        toneMap[p] = invertOutput.checked ? 1 - tone : tone;
      }

      if (finalInk) {
        const speckle = seededNoise(x * 0.41, y * 0.63);
        const punch = speckle > 0.04 || edge > 36;
        if (shapedMode) {
          outData[outIndex + 3] = 0;
        } else {
          const [cr, cg, cb] = colorForPixel(p, colorMap);
          outData[outIndex] = cr;
          outData[outIndex + 1] = cg;
          outData[outIndex + 2] = cb;
          outData[outIndex + 3] = punch ? 255 : 0;
        }
      } else {
        outData[outIndex + 3] = transparentOnly.checked ? 0 : 255;
        outData[outIndex] = 255;
        outData[outIndex + 1] = 255;
        outData[outIndex + 2] = 255;
      }
    }
  }

  ctx.clearRect(0, 0, width, height);
  ctx.putImageData(out, 0, 0);

  if (shapedMode) {
    drawShapeGrains(toneMap, alphaMask, colorMap, width, height, opts);
  }

  downloadBtn.disabled = false;
  downloadSvgBtn.disabled = false;
  stashBtn.disabled = false;
  statusText.textContent = "拖动左侧参数，可以继续微调黑白、颗粒和去底力度。";
  dimensionBadge.textContent = `${width} x ${height}`;
}

function loadImageFromFile(file) {
  if (!file || !file.type.startsWith("image/")) return;

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    sourceImage = img;
    sourceName = file.name.replace(/\.[^.]+$/, "") || "print-effect";
    setUploadPreview(url, file.name);
    scheduleRender();
  };
  img.src = url;
}

function triggerDownload(url, filename, revoke = false) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  if (revoke) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCanvasPng(targetCanvas = canvas, filename = `${sourceName}-transparent-print.png`) {
  targetCanvas.toBlob((blob) => {
    triggerDownload(URL.createObjectURL(blob), filename, true);
  }, "image/png");
}

function svgFromCanvas(targetCanvas, targetCtx) {
  const image = targetCtx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
  const data = image.data;
  const paths = [];

  for (let y = 0; y < targetCanvas.height; y += 1) {
    let x = 0;
    while (x < targetCanvas.width) {
      let index = (y * targetCanvas.width + x) * 4;
      const visible = data[index + 3] > 127;

      if (!visible) {
        x += 1;
        continue;
      }

      const start = x;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      while (x < targetCanvas.width) {
        index = (y * targetCanvas.width + x) * 4;
        const sameColor = data[index] === r && data[index + 1] === g && data[index + 2] === b;
        const keepGoing = data[index + 3] > 127 && sameColor;
        if (!keepGoing) break;
        x += 1;
      }
      const fill = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      paths.push(`<path fill="${fill}" d="M${start} ${y}h${x - start}v1H${start}z"/>`);
    }
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${targetCanvas.width}" height="${targetCanvas.height}" viewBox="0 0 ${targetCanvas.width} ${targetCanvas.height}" shape-rendering="crispEdges">`,
    paths.join(""),
    "</svg>",
  ].join("");
}

function downloadPng() {
  if (!sourceImage) return;
  downloadCanvasPng();
}

function downloadSvg() {
  if (!sourceImage) return;

  const svg = svgFromCanvas(canvas, ctx);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(URL.createObjectURL(blob), `${sourceName}-transparent-print.svg`, true);
}

function paramsSummary(params) {
  return `阈值 ${params.threshold} / 颗粒 ${params.grain} / 色相 ${params.hue}`;
}

function drawDataUrlToCanvas(dataUrl, callback) {
  const img = new Image();
  img.onload = () => {
    const target = document.createElement("canvas");
    target.width = img.naturalWidth;
    target.height = img.naturalHeight;
    const targetCtx = target.getContext("2d", { willReadFrequently: true });
    targetCtx.drawImage(img, 0, 0);
    callback(target, targetCtx);
  };
  img.src = dataUrl;
}

function stashCurrent() {
  if (!sourceImage) return;

  const id = Date.now();
  const params = values();
  const item = {
    id,
    name: `${sourceName}-${stashItems.length + 1}`,
    width: canvas.width,
    height: canvas.height,
    params,
    keepHue: keepHue.checked,
    invert: invertOutput.checked,
    blurFirst: blurFirst.checked,
    grainMode: grainMode.value,
    grainShape: grainShape.value,
    grainText: grainText.value.trim(),
    liked: false,
    dataUrl: canvas.toDataURL("image/png"),
  };

  stashItems = [item, ...stashItems].slice(0, 12);
  selectedStashId = id;
  renderStash();
  statusText.textContent = "已暂存当前效果。点击对比暂存可以平铺查看和选择下载。";
}

function renderStash() {
  stashCount.textContent = String(stashItems.length);
  compareBtn.disabled = stashItems.length === 0;
  clearCacheBtn.disabled = stashItems.length === 0;

  if (stashItems.length === 0) {
    stashTray.innerHTML = `<div class="stash-empty">暂无暂存项</div>`;
    compareGrid.innerHTML = "";
    comparePanel.hidden = true;
    return;
  }

  stashTray.innerHTML = stashItems.map((item, index) => `
    <button class="stash-item" type="button" data-id="${item.id}">
      <img src="${item.dataUrl}" alt="暂存 ${index + 1}">
      <span class="stash-meta">
        <strong>${item.name}</strong>
        <span>${item.width} x ${item.height}</span>
      </span>
    </button>
  `).join("");

  document.querySelectorAll(".stash-item").forEach((button) => {
    button.addEventListener("click", () => {
      selectedStashId = Number(button.dataset.id);
      openCompare();
    });
  });
}

function clearCache() {
  stashItems = [];
  selectedStashId = null;
  renderStash();
  statusText.textContent = sourceImage ? "已清理暂存缓存，当前预览仍保留。" : "已清理暂存缓存。";
}

function deleteStashItem(id) {
  stashItems = stashItems.filter((item) => item.id !== id);
  if (selectedStashId === id) selectedStashId = stashItems[0]?.id || null;
  renderStash();
  if (stashItems.length > 0 && !comparePanel.hidden) openCompare();
  statusText.textContent = "已删除暂存版本。";
}

function toggleLikeStashItem(id) {
  const item = stashItems.find((entry) => entry.id === id);
  if (!item) return;
  item.liked = !item.liked;
  openCompare();
}

function openZoom(item) {
  zoomImage.src = item.dataUrl;
  zoomImage.alt = `${item.name} 放大预览`;
  zoomModal.hidden = false;
}

function closeZoom() {
  zoomModal.hidden = true;
  zoomImage.removeAttribute("src");
}

async function loadGrainFont(file) {
  if (!file) return;

  if (customFontFace) {
    document.fonts.delete(customFontFace);
    customFontFace = null;
  }
  if (customFontUrl) {
    URL.revokeObjectURL(customFontUrl);
    customFontUrl = "";
  }

  customFontUrl = URL.createObjectURL(file);
  const family = `grain-font-${Date.now()}`;
  customFontFace = new FontFace(family, `url(${customFontUrl})`);

  try {
    await customFontFace.load();
    document.fonts.add(customFontFace);
    customFontFamily = `"${family}", system-ui, sans-serif`;
    grainFontName.textContent = file.name;
    scheduleRender();
  } catch (error) {
    customFontFamily = "system-ui, sans-serif";
    grainFontName.textContent = "字体读取失败";
  }
}

function clearGrainFont() {
  if (customFontFace) {
    document.fonts.delete(customFontFace);
    customFontFace = null;
  }
  if (customFontUrl) {
    URL.revokeObjectURL(customFontUrl);
    customFontUrl = "";
  }
  customFontFamily = "system-ui, sans-serif";
  grainFont.value = "";
  grainFontName.textContent = "未导入字体";
}

function openCompare() {
  if (stashItems.length === 0) return;

  comparePanel.hidden = false;
  compareGrid.innerHTML = stashItems.map((item, index) => {
    const selected = item.id === selectedStashId ? " selected" : "";
    const liked = item.liked ? " liked" : "";
    const heart = item.liked ? "♥" : "♡";
    const mode = item.keepHue ? "保留色相" : "黑色墨稿";
    const invert = item.invert ? " / 已反转" : "";
    const blur = item.blurFirst ? " / 已模糊" : "";
    const shape = item.grainMode === "shape"
      ? (item.grainShape === "text" ? `内容:${item.grainText || "TEXT"}` : item.grainShape)
      : "像素";
    return `
      <article class="compare-card${selected}${liked}" data-id="${item.id}">
        <button class="card-delete" type="button" data-action="delete" data-id="${item.id}" aria-label="删除此暂存">×</button>
        <img src="${item.dataUrl}" alt="对比版本 ${index + 1}">
        <button class="card-like${item.liked ? " is-liked" : ""}" type="button" data-action="like" data-id="${item.id}" aria-label="标注喜欢">${heart}</button>
        <div class="compare-info">
          <strong>${item.name}</strong>
          <span>${item.width} x ${item.height}</span>
          <span>${paramsSummary(item.params)}</span>
          <span>${mode}${invert}${blur} / ${shape}</span>
        </div>
        <div class="compare-actions">
          <button type="button" data-action="png" data-id="${item.id}">PNG</button>
          <button type="button" data-action="svg" data-id="${item.id}">SVG</button>
        </div>
      </article>
    `;
  }).join("");

  compareGrid.querySelectorAll(".compare-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      selectedStashId = Number(card.dataset.id);
      openCompare();
    });
    card.addEventListener("dblclick", (event) => {
      if (event.target.closest("button")) return;
      const item = stashItems.find((entry) => entry.id === Number(card.dataset.id));
      if (item) openZoom(item);
    });
  });

  compareGrid.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "delete") {
        deleteStashItem(Number(button.dataset.id));
        return;
      }
      if (button.dataset.action === "like") {
        toggleLikeStashItem(Number(button.dataset.id));
        return;
      }
      const item = stashItems.find((entry) => entry.id === Number(button.dataset.id));
      if (!item) return;
      if (button.dataset.action === "png") {
        triggerDownload(item.dataUrl, `${item.name}.png`);
      } else {
        drawDataUrlToCanvas(item.dataUrl, (target, targetCtx) => {
          const svg = svgFromCanvas(target, targetCtx);
          const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
          triggerDownload(URL.createObjectURL(blob), `${item.name}.svg`, true);
        });
      }
    });
  });

  comparePanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetControls() {
  Object.entries(defaults).forEach(([key, value]) => {
    controls[key].value = value;
  });
  transparentOnly.checked = true;
  invertOutput.checked = false;
  blurFirst.checked = false;
  keepHue.checked = false;
  grainMode.value = "pixel";
  grainShape.value = "circle";
  grainText.value = "TEXT";
  clearGrainFont();
  syncGrainModeUi();
  scheduleRender();
}

function createSample() {
  const sample = document.createElement("canvas");
  sample.width = 900;
  sample.height = 1080;
  const s = sample.getContext("2d");

  s.fillStyle = "#fff";
  s.fillRect(0, 0, sample.width, sample.height);
  s.lineJoin = "round";
  s.lineCap = "round";
  s.strokeStyle = "#6f879a";
  s.fillStyle = "#8ca7ba";

  s.beginPath();
  s.moveTo(260, 250);
  s.lineTo(210, 420);
  s.lineTo(140, 850);
  s.lineTo(340, 910);
  s.lineTo(450, 870);
  s.lineTo(560, 910);
  s.lineTo(760, 850);
  s.lineTo(690, 420);
  s.lineTo(640, 250);
  s.closePath();
  s.fill();
  s.lineWidth = 30;
  s.stroke();

  s.fillStyle = "#7894a9";
  s.fillRect(310, 255, 280, 560);
  s.strokeRect(310, 255, 280, 560);

  s.fillStyle = "#aec0cc";
  s.beginPath();
  s.moveTo(330, 240);
  s.lineTo(450, 325);
  s.lineTo(570, 240);
  s.lineTo(600, 330);
  s.lineTo(450, 380);
  s.lineTo(300, 330);
  s.closePath();
  s.fill();
  s.stroke();

  s.fillStyle = "#6d879a";
  s.fillRect(245, 470, 170, 130);
  s.fillRect(485, 470, 170, 130);
  s.strokeRect(245, 470, 170, 130);
  s.strokeRect(485, 470, 170, 130);

  s.strokeStyle = "#4d6476";
  s.lineWidth = 9;
  for (let x = 350; x <= 550; x += 40) {
    s.beginPath();
    s.moveTo(x, 345);
    s.lineTo(x, 820);
    s.stroke();
  }
  for (let y = 420; y <= 850; y += 58) {
    s.beginPath();
    s.moveTo(185, y);
    s.lineTo(715, y + Math.sin(y) * 4);
    s.stroke();
  }
  s.fillStyle = "#d5dadb";
  for (let y = 390; y <= 760; y += 58) {
    s.beginPath();
    s.arc(450, y, 14, 0, Math.PI * 2);
    s.fill();
    s.stroke();
  }

  const img = new Image();
  img.onload = () => {
    sourceImage = img;
    sourceName = "sample-jacket";
    setUploadPreview(img.src, "sample-jacket.png");
    scheduleRender();
  };
  img.src = sample.toDataURL("image/png");
}

fileInput.addEventListener("change", (event) => {
  loadImageFromFile(event.target.files[0]);
});

clearImageBtn.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  clearCurrentImage();
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragging");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragging");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragging");
  loadImageFromFile(event.dataTransfer.files[0]);
});

Object.values(controls).forEach((control) => {
  control.addEventListener("input", scheduleRender);
});

transparentOnly.addEventListener("change", scheduleRender);
invertOutput.addEventListener("change", scheduleRender);
blurFirst.addEventListener("change", scheduleRender);
keepHue.addEventListener("change", scheduleRender);
grainMode.addEventListener("change", () => {
  syncGrainModeUi();
  scheduleRender();
});
grainShape.addEventListener("change", () => {
  syncGrainModeUi();
  scheduleRender();
});
grainText.addEventListener("input", scheduleRender);
grainFont.addEventListener("change", (event) => {
  loadGrainFont(event.target.files[0]);
});
downloadBtn.addEventListener("click", downloadPng);
downloadSvgBtn.addEventListener("click", downloadSvg);
stashBtn.addEventListener("click", stashCurrent);
compareBtn.addEventListener("click", openCompare);
clearCacheBtn.addEventListener("click", clearCache);
closeCompareBtn.addEventListener("click", () => {
  comparePanel.hidden = true;
});
stashPanel.addEventListener("click", (event) => {
  if (event.target.closest(".stash-item") || event.target.closest(".stash-bookmark")) return;
  stashPanel.classList.add("is-collapsed");
});
stashBookmark.addEventListener("click", (event) => {
  event.stopPropagation();
  stashPanel.classList.remove("is-collapsed");
});
closeZoomBtn.addEventListener("click", closeZoom);
zoomModal.addEventListener("click", (event) => {
  if (event.target === zoomModal) closeZoom();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !zoomModal.hidden) closeZoom();
});
resetBtn.addEventListener("click", resetControls);
sampleBtn.addEventListener("click", createSample);

syncOutputs();
syncGrainModeUi();
renderStash();
drawPlaceholder();
