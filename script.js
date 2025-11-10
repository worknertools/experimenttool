(() => {
  'use strict';
  const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';
  const DEFAULT_FOREGROUND_COLOR = '#000000';
  const canvas = document.getElementById('pixelCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const fileInput = document.getElementById('fileInput');
  const errorEl = document.getElementById('error');
  const uploadPreview = document.getElementById('uploadPreview');
  const uploadIcon = document.getElementById('uploadIcon');
  const emptyState = document.getElementById('emptyState');
  const previewCanvas = document.getElementById('previewCanvas');
  const exportPNGButton = document.getElementById('exportPNG');
  const exportSVGButton = document.getElementById('exportSVG');
  const resetLabel = document.querySelector('.panel__reset-label');
  const gridSizeSlider = document.getElementById('gridSize');
  const edgeSlider = document.getElementById('edgeThreshold');
  const detailSlider = document.getElementById('detailLevel');
  const lineSlider = document.getElementById('lineThickness');
  const gridSizeVal = document.getElementById('gridSizeVal');
  const edgeThresholdVal = document.getElementById('edgeThresholdVal');
  const detailLevelVal = document.getElementById('detailLevelVal');
  const lineThicknessVal = document.getElementById('lineThicknessVal');
  const bgSwatches = Array.from(document.querySelectorAll('.bg-swatch[data-color]'));
  const customBgColorPicker = document.getElementById('customColorPicker');
  const fgSwatches = Array.from(document.querySelectorAll('.fg-swatch[data-color]'));
  const customFgColorPicker = document.getElementById('customFgColorPicker');
  const styleButtons = document.querySelectorAll('.style-button');
  let styleMode = 'square'; // Default style
  let processedImage = null;
  let hasImage = false;
  let gridSize = 10,edgeThreshold = 30,detailLevel = 1,lineThickness = 1;
  let backgroundColor = DEFAULT_BACKGROUND_COLOR;
  let foregroundColor = DEFAULT_FOREGROUND_COLOR;
  let typingTimeout = null;
  let offsetX = 0,offsetY = 0;
  let isDragging = false;
  let dragStartX = 0,dragStartY = 0;
  let cachedEdges = null;
  let isExportingPNG = false;
  let isExportingSVG = false;
  let isFirstAnimation = true;
  function debounce(func, delay) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  }
  function fillCanvasBackground(color) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  function clearCanvas() {
    fillCanvasBackground(backgroundColor);
  }
  function updateEmptyState() {
    updateBackgroundVisuals();
  }
  function resetUploadPreview() {
    uploadPreview.src = '';
    uploadPreview.classList.add('hidden');
    uploadIcon.classList.remove('hidden');
  }
  function resetState() {
    processedImage = null;
    hasImage = false;
    cachedEdges = null;
    resetUploadPreview();
    clearCanvas();
    setError(null);
    updateEmptyState();
    fileInput.value = '';
    offsetX = 0;
    offsetY = 0;
  }
  function setError(message) {
    if (!message) {
      errorEl.classList.add('hidden');
      errorEl.textContent = '';
      return;
    }
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
  function getReadableTextColor(hex) {
    const normalized = hex.replace('#', '').trim();
    const expanded = normalized.length === 3 ?
    normalized.split('').map(char => char + char).join('') :
    normalized;
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return 'rgba(0, 0, 0, 0.3)';
    }
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.5 ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.68)';
  }
  function updateBackgroundVisuals() {
    previewCanvas.style.backgroundColor = backgroundColor;
    previewCanvas.style.backgroundImage = 'none';
    emptyState.style.backgroundColor = backgroundColor;
    emptyState.style.backgroundImage = 'none';
    const textColor = getReadableTextColor(backgroundColor);
    emptyState.style.color = textColor;
    const chars = document.querySelectorAll('.typing-char');
    if (hasImage || backgroundColor !== DEFAULT_BACKGROUND_COLOR) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
      emptyState.classList.add('hidden');
      chars.forEach(char => {
        char.classList.remove('typing-char--visible');
      });
    } else {
      emptyState.classList.remove('hidden');
      if (!typingTimeout) {
        runTypingAnimation(chars);
      }
    }
  }
  function runTypingAnimation(chars) {
    if (isFirstAnimation) {
      chars.forEach((char, index) => {
        setTimeout(() => {
          char.classList.add('typing-char--visible');
        }, index * 35);
      });
      typingTimeout = setTimeout(() => runTypingAnimation(chars), chars.length * 35 + 1000);
      isFirstAnimation = false;
    } else {
      chars.forEach(char => {
        char.classList.remove('typing-char--visible');
      });
      setTimeout(() => {
        chars.forEach((char, index) => {
          setTimeout(() => {
            char.classList.add('typing-char--visible');
          }, index * 35);
        });
        typingTimeout = setTimeout(() => runTypingAnimation(chars), chars.length * 35 + 1000);
      }, 100);
    }
  }
  function detectEdges(imageData, edgeThresholdValue, detailLevelValue) {
    const { data, width, height } = imageData;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      gray[i] = data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11;
    }
    const magnitude = new Float32Array(width * height);
    const direction = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const gx =
        gray[(y - 1) * width + (x + 1)] + 2 * gray[y * width + (x + 1)] + gray[(y + 1) * width + (x + 1)] - (
        gray[(y - 1) * width + (x - 1)] + 2 * gray[y * width + (x - 1)] + gray[(y + 1) * width + (x - 1)]);
        const gy =
        gray[(y - 1) * width + (x - 1)] + 2 * gray[(y - 1) * width + x] + gray[(y - 1) * width + (x + 1)] - (
        gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)]);
        const idx = y * width + x;
        magnitude[idx] = Math.sqrt(gx * gx + gy * gy) / 4; // Normalize to 0-255 approx
        direction[idx] = Math.atan2(gy, gx);
      }
    }
    const edges = [];
    const threshold = Math.max(edgeThresholdValue - detailLevelValue * 5, 1);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (magnitude[idx] <= threshold) continue;
        let dir = (direction[idx] * 180 / Math.PI + 180) % 180; // Normalize to 0-180
        let d;
        if (dir < 22.5 || dir >= 157.5) d = 0; // horizontal
        else if (dir < 67.5) d = 45;else
          if (dir < 112.5) d = 90; // vertical
          else d = 135;
        let n1 = 0,n2 = 0;
        if (d === 0) {
          n1 = magnitude[idx - 1];
          n2 = magnitude[idx + 1];
        } else if (d === 45) {
          n1 = magnitude[idx + width - 1];
          n2 = magnitude[idx - width + 1];
        } else if (d === 90) {
          n1 = magnitude[idx - width];
          n2 = magnitude[idx + width];
        } else if (d === 135) {
          n1 = magnitude[idx + width + 1];
          n2 = magnitude[idx - width - 1];
        }
        if (magnitude[idx] >= n1 && magnitude[idx] >= n2) {
          edges.push(idx);
        }
      }
    }
    return edges;
  }
  function prepareImage(image) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = width;
    fullCanvas.height = height;
    const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
    if (!fullCtx) throw new Error('Unable to prepare canvas context');
    fullCtx.drawImage(image, 0, 0, width, height);
    const original = fullCtx.getImageData(0, 0, width, height);
    const targetSize = 360;
    const maxDimension = Math.max(width, height);
    const scale = maxDimension > targetSize ? targetSize / maxDimension : 1;
    const previewWidth = Math.max(1, Math.round(width * scale));
    const previewHeight = Math.max(1, Math.round(height * scale));
    const previewCanvasEl = document.createElement('canvas');
    previewCanvasEl.width = previewWidth;
    previewCanvasEl.height = previewHeight;
    const previewCtx = previewCanvasEl.getContext('2d', { willReadFrequently: true });
    if (!previewCtx) throw new Error('Unable to prepare preview context');
    previewCtx.drawImage(image, 0, 0, previewWidth, previewHeight);
    const preview = previewCtx.getImageData(0, 0, previewWidth, previewHeight);
    return {
      original,
      preview,
      originalWidth: width,
      originalHeight: height,
      previewWidth,
      previewHeight,
      scale };

  }
  function renderPreview() {
    if (!processedImage) return;
    fillCanvasBackground(backgroundColor);
    const { preview, previewWidth, previewHeight } = processedImage;
    if (cachedEdges === null) {
      cachedEdges = detectEdges(preview, edgeThreshold, detailLevel);
    }
    const uniformScale = Math.min(canvas.width / previewWidth, canvas.height / previewHeight);
    const canvasOffsetX = (canvas.width - previewWidth * uniformScale) / 2 + offsetX;
    const canvasOffsetY = (canvas.height - previewHeight * uniformScale) / 2 + offsetY;
    const step = Math.max(1, gridSize);
    const baseSize = uniformScale * step;
    const thicknessFactor = 1 + (lineThickness - 1) * 0.25;
    const rectSize = baseSize * thicknessFactor;
    const thicknessOffset = (rectSize - baseSize) / 2;
    ctx.fillStyle = foregroundColor;
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < cachedEdges.length; i += step) {
      const index = cachedEdges[i];
      const y = Math.floor(index / previewWidth);
      const x = index % previewWidth;
      const drawX = canvasOffsetX + x * uniformScale - thicknessOffset;
      const drawY = canvasOffsetY + y * uniformScale - thicknessOffset;
      if (styleMode === 'square') {
        ctx.fillRect(drawX, drawY, rectSize, rectSize);
      } else {
        ctx.beginPath();
        ctx.arc(drawX + rectSize / 2, drawY + rectSize / 2, rectSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    updateCursor();
  }
  let redrawRequest = null;
  function scheduleRedraw() {
    if (!hasImage) return;
    if (redrawRequest === null) {
      redrawRequest = requestAnimationFrame(() => {
        renderPreview();
        redrawRequest = null;
      });
    }
  }
  function setBackgroundColor(color) {
    backgroundColor = color.toUpperCase();
    updateBackgroundVisuals();
    clearCanvas();
    if (hasImage) {
      scheduleRedraw();
    }
  }
  function setForegroundColor(color) {
    foregroundColor = color.toUpperCase();
    if (hasImage) {
      scheduleRedraw();
    }
  }
  function handleFileChange(event) {var _event$target$files;
    const file = (_event$target$files = event.target.files) === null || _event$target$files === void 0 ? void 0 : _event$target$files[0];
    if (!file) {
      setError(null);
      resetState();
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      resetState();
      return;
    }
    setError(null);
    gridSizeSlider.value = 10;
    edgeSlider.value = 30;
    detailSlider.value = 1;
    lineSlider.value = 1;
    gridSizeVal.textContent = '10';
    edgeThresholdVal.textContent = '30';
    detailLevelVal.textContent = '1';
    lineThicknessVal.textContent = '1';
    gridSize = 10;
    edgeThreshold = 30;
    detailLevel = 1;
    lineThickness = 1;
    setBackgroundColor(DEFAULT_BACKGROUND_COLOR);
    customBgColorPicker.value = DEFAULT_BACKGROUND_COLOR;
    setForegroundColor(DEFAULT_FOREGROUND_COLOR);
    customFgColorPicker.value = DEFAULT_FOREGROUND_COLOR;
    styleButtons.forEach(b => b.classList.remove('active'));
    document.querySelector('.style-button[data-style="square"]').classList.add('active');
    styleMode = 'square';
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        setError('Unable to read the file, please try another image');
        resetState();
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          processedImage = prepareImage(img);
          hasImage = true;
          uploadPreview.src = result;
          uploadPreview.classList.remove('hidden');
          uploadIcon.classList.add('hidden');
          offsetX = 0;
          offsetY = 0;
          cachedEdges = null;
          renderPreview();
          updateEmptyState();
          fileInput.value = '';
        } catch (err) {
          console.error(err);
          setError('Unable to process the image, please try another file');
          resetState();
        }
      };
      img.onerror = () => {
        setError('Unable to read the file, please try another image');
        resetState();
      };
      img.src = result;
    };
    reader.onerror = () => {
      setError('Unable to read the file, please try another image');
      resetState();
    };
    reader.readAsDataURL(file);
  }
  function handleExportPNG() {
    if (!hasImage || isExportingPNG) return;
    isExportingPNG = true;
    try {
      const { original, originalWidth, originalHeight, scale } = processedImage;
      const exportStep = Math.max(1, Math.round(gridSize / scale));
      const exportEdges = detectEdges(original, edgeThreshold, detailLevel);
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = originalWidth;
      exportCanvas.height = originalHeight;
      const exportCtx = exportCanvas.getContext('2d');
      exportCtx.fillStyle = backgroundColor;
      exportCtx.fillRect(0, 0, originalWidth, originalHeight);
      exportCtx.fillStyle = foregroundColor;
      const thicknessFactor = 1 + (lineThickness - 1) * 0.25;
      const baseStep = exportStep;
      const rectStep = baseStep * thicknessFactor;
      const thicknessOffset = (rectStep - baseStep) / 2;
      for (let i = 0; i < exportEdges.length; i += exportStep) {
        const index = exportEdges[i];
        const y = Math.floor(index / originalWidth);
        const x = index % originalWidth;
        const drawX = x - thicknessOffset;
        const drawY = y - thicknessOffset;
        if (styleMode === 'square') {
          exportCtx.fillRect(drawX, drawY, rectStep, rectStep);
        } else {
          exportCtx.beginPath();
          exportCtx.arc(drawX + rectStep / 2, drawY + rectStep / 2, rectStep / 2, 0, Math.PI * 2);
          exportCtx.fill();
        }
      }
      const link = document.createElement('a');
      link.href = exportCanvas.toDataURL('image/png');
      link.download = `outline_pixel_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setTimeout(() => {isExportingPNG = false;}, 500);
    }
  }
  function handleExportSVG() {
    if (!hasImage || isExportingSVG) return;
    isExportingSVG = true;
    try {
      const { original, originalWidth, originalHeight, scale } = processedImage;
      const exportStep = Math.max(1, Math.round(gridSize / scale));
      const edges = detectEdges(original, edgeThreshold, detailLevel);
      const thicknessFactor = 1 + (lineThickness - 1) * 0.25;
      const baseStep = exportStep;
      const rectStep = baseStep * thicknessFactor;
      const thicknessOffset = (rectStep - baseStep) / 2;
      const shapes = [];
      for (let i = 0; i < edges.length; i += exportStep) {
        const index = edges[i];
        const y = Math.floor(index / originalWidth);
        const x = index % originalWidth;
        if (styleMode === 'square') {
          shapes.push(`<rect x="${x - thicknessOffset}" y="${y - thicknessOffset}" width="${rectStep}" height="${rectStep}" />`);
        } else {
          shapes.push(`<circle cx="${x - thicknessOffset + rectStep / 2}" cy="${y - thicknessOffset + rectStep / 2}" r="${rectStep / 2}" />`);
        }
      }
      const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${originalWidth}" height="${originalHeight}" viewBox="0 0 ${originalWidth} ${originalHeight}" shape-rendering="crispEdges">` +
      `<rect width="100%" height="100%" fill="${backgroundColor}" />` + (
      shapes.length ?
      `<g fill="${foregroundColor}">${shapes.join('')}</g>` :
      '') +
      `</svg>`;
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `outline_pixel_${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setTimeout(() => {isExportingSVG = false;}, 500);
    }
  }
  const debouncedUpdateEdges = debounce(() => {
    cachedEdges = null;
    scheduleRedraw();
  }, 100);
  gridSizeSlider.addEventListener('input', event => {
    gridSize = Number(event.target.value);
    gridSizeVal.textContent = gridSize.toString();
    scheduleRedraw();
  });
  edgeSlider.addEventListener('input', event => {
    edgeThreshold = Number(event.target.value);
    edgeThresholdVal.textContent = edgeThreshold.toString();
    debouncedUpdateEdges();
  });
  detailSlider.addEventListener('input', event => {
    detailLevel = Number(event.target.value);
    detailLevelVal.textContent = detailLevel.toString();
    debouncedUpdateEdges();
  });
  lineSlider.addEventListener('input', event => {
    lineThickness = Number(event.target.value);
    lineThicknessVal.textContent = lineThickness.toString();
    scheduleRedraw();
  });
  bgSwatches.forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      if (color) {
        setBackgroundColor(color);
      }
    });
  });
  customBgColorPicker.addEventListener('input', event => {
    setBackgroundColor(event.target.value);
  });
  fgSwatches.forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      if (color) {
        setForegroundColor(color);
      }
    });
  });
  customFgColorPicker.addEventListener('input', event => {
    setForegroundColor(event.target.value);
  });
  fileInput.addEventListener('change', handleFileChange);
  exportPNGButton.addEventListener('click', handleExportPNG);
  exportSVGButton.addEventListener('click', handleExportSVG);
  resetLabel.addEventListener('click', () => {
    gridSizeSlider.value = 10;
    edgeSlider.value = 30;
    detailSlider.value = 1;
    lineSlider.value = 1;
    gridSizeVal.textContent = '10';
    edgeThresholdVal.textContent = '30';
    detailLevelVal.textContent = '1';
    lineThicknessVal.textContent = '1';
    gridSize = 10;
    edgeThreshold = 30;
    detailLevel = 1;
    lineThickness = 1;
    setBackgroundColor(DEFAULT_BACKGROUND_COLOR);
    customBgColorPicker.value = DEFAULT_BACKGROUND_COLOR;
    setForegroundColor(DEFAULT_FOREGROUND_COLOR);
    customFgColorPicker.value = DEFAULT_FOREGROUND_COLOR;
    resetState();
  });
  styleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      styleButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      styleMode = btn.dataset.style;
      if (hasImage) {
        scheduleRedraw();
      }
    });
  });
  function updateCursor() {
    if (hasImage) {
      canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
    } else {
      canvas.style.cursor = 'default';
    }
  }
  canvas.addEventListener('mousedown', e => {
    if (!hasImage || e.button !== 0) return;
    isDragging = true;
    dragStartX = e.clientX - offsetX;
    dragStartY = e.clientY - offsetY;
    canvas.classList.add('dragging');
  });
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    offsetX = e.clientX - dragStartX;
    offsetY = e.clientY - dragStartY;
    scheduleRedraw();
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      canvas.classList.remove('dragging');
      updateCursor();
    }
  });
  setBackgroundColor(DEFAULT_BACKGROUND_COLOR);
  setForegroundColor(DEFAULT_FOREGROUND_COLOR);
  updateEmptyState();
  updateCursor();
  emptyState.style.userSelect = 'text';
  emptyState.style.webkitUserSelect = 'text';
  emptyState.style.MozUserSelect = 'text';
  emptyState.style.msUserSelect = 'text';
  emptyState.style.pointerEvents = 'auto';
})();