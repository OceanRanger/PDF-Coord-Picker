// ==================== 全局变量 ====================
let pdfDoc = null;
let pageNum = 1;
let pdfPages = 0;
let pageHeight = 0;
let pageWidth = 0;
let scale = 2.0;
const padding = 40; // 画布周围的留白（像素）

// 缩放配置
const ZOOM_CONFIG = {
    min: 0.5,      // 最小缩放 50%
    max: 3.0,      // 最大缩放 300%
    step: 0.1,     // 每次调整 10%
    default: 2.0   // 默认 200%
};
let canvas = null;
let ctx = null;
let currentPage = null;

// 矩形数据
let rectangles = [];

// 选中状态
let selectedRectId = null;

// 拖拽状态
let isDragging = false;
let isResizing = false;
let resizeHandle = null;
let dragStartX = 0;
let dragStartY = 0;
let originalRect = null;

// 控制点大小
const HANDLE_SIZE = 8;
const HANDLE_OFFSET = HANDLE_SIZE / 2;

// 自由绘制状态
let isDrawingMode = false;
let isDrawing = false;
let drawStartX = 0;
let drawStartY = 0;

// ==================== 辅助线配置 ====================
const GUIDE_LINE_COLOR = 'rgba(0, 123, 255, 0.5)'; // 蓝色半透明
const GUIDE_LINE_WIDTH = 1;
const GUIDE_LINE_DASH = [5, 5]; // 虚线样式
let activeGuideLines = []; // 当前显示的辅助线

// ==================== Toast 提示系统 ====================

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓',
        error: '✕',
        warning: '!',
        info: 'i'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-message">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    // 自动移除
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, duration);
}

// ==================== 确认对话框 ====================

let confirmCallback = null;

function showConfirm(message, title = '确认操作', onConfirm = null) {
    const dialog = document.getElementById('confirmDialog');
    const messageEl = document.getElementById('confirmMessage');
    const titleEl = document.getElementById('confirmTitle');

    messageEl.textContent = message;
    titleEl.textContent = title;
    confirmCallback = onConfirm;

    dialog.classList.add('show');

    // 聚焦确定按钮
    setTimeout(() => {
        document.getElementById('confirmOkBtn').focus();
    }, 100);
}

function closeConfirm() {
    const dialog = document.getElementById('confirmDialog');
    dialog.classList.remove('show');
    confirmCallback = null;
}

// 绑定确认按钮事件
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('confirmOkBtn').addEventListener('click', function() {
        if (confirmCallback) {
            confirmCallback();
        }
        closeConfirm();
    });
});

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    canvas = document.getElementById('pdfCanvas');
    ctx = canvas.getContext('2d');

    // 绑定事件
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    document.getElementById('prevPage').addEventListener('click', onPrevPage);
    document.getElementById('nextPage').addEventListener('click', onNextPage);
    document.getElementById('addRectBtn').addEventListener('click', addRectangle);
    document.getElementById('drawRectBtn').addEventListener('click', toggleDrawingMode);
    document.getElementById('copyAllBtn').addEventListener('click', copyAllCoordinates);
    document.getElementById('clearAllBtn').addEventListener('click', clearAll);

    // 绑定缩放控制事件
    document.getElementById('zoomFit').addEventListener('click', zoomToFit);

    // 缩放滑块事件（实时更新）
    const zoomSlider = document.getElementById('zoomSlider');
    zoomSlider.addEventListener('input', setZoomFromSlider);

    // 缩放输入框事件
    const zoomInput = document.getElementById('zoomLevel');
    zoomInput.addEventListener('change', setZoomFromInput);
    zoomInput.addEventListener('focus', function() {
        this.select();
    });

    // 绑定画布事件（新的交互方式）
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);

    // 设置 PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/pdf.worker.min.js';

    // 绑定模态框事件
    document.querySelector('.close').addEventListener('click', hideModal);
    document.getElementById('modalCancel').addEventListener('click', hideModal);
    document.getElementById('modalConfirm').addEventListener('click', confirmModal);
});

// ==================== 模态框相关 ====================

let pendingRectData = null;

function showModal(x, y, width, height) {
    pendingRectData = { x, y, width, height };
    document.getElementById('modalLabel').value = '';
    document.getElementById('modalText').value = '';
    document.getElementById('rectModal').classList.add('show');
    document.getElementById('modalLabel').focus();
}

function hideModal() {
    document.getElementById('rectModal').classList.remove('show');
    pendingRectData = null;
    drawRectanglesOnCanvas();
}

function confirmModal() {
    if (!pendingRectData) return;

    const label = document.getElementById('modalLabel').value.trim();
    const text = document.getElementById('modalText').value.trim();

    if (!label) {
        showToast('请输入标签名称', 'warning');
        return;
    }

    const { x, y, width, height } = pendingRectData;
    const fontSize = 10;

    const rect = {
        id: Date.now(),
        label: label,
        text: text,
        fontSize: fontSize,
        x: x,
        y: y,
        width: width,
        height: height,
        pageNum: pageNum,
        selected: true
    };

    updateRectCoords(rect);

    rectangles.forEach(r => r.selected = false);
    selectedRectId = rect.id;

    rectangles.push(rect);

    document.getElementById('rectModal').classList.remove('show');
    pendingRectData = null;

    drawRectanglesOnCanvas();
    updateCoordinateList();
}

// ==================== PDF 加载和渲染 ====================

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        showToast('请选择 PDF 文件', 'error');
        return;
    }

    document.getElementById('fileName').textContent = file.name;

    try {
        const arrayBuffer = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
        pdfPages = pdfDoc.numPages;
        pageNum = 1;

        // 隐藏空状态，显示画布
        document.getElementById('emptyState').classList.add('hidden');
        document.querySelector('.canvas-wrapper').classList.add('has-pdf');

        updatePageNav();
        await renderPage(pageNum);

        // 初始化缩放显示
        updateZoomDisplay();

        showToast('PDF 加载成功', 'success');
    } catch (error) {
        console.error('加载 PDF 失败:', error);
        showToast('加载 PDF 失败: ' + error.message, 'error');
    }
}

// ==================== 坐标转换 ====================

function canvasToPdfCoords(canvasX, canvasY) {
    const rawPdfX = canvasX / scale;
    const rawPdfY = canvasY / scale;
    const itextX = rawPdfX;
    const itextY = pageHeight - rawPdfY;
    return { x: itextX, y: itextY };
}

function updateRectCoords(rect) {
    const topLeft = canvasToPdfCoords(rect.x, rect.y + rect.height);
    const bottomRight = canvasToPdfCoords(rect.x + rect.width, rect.y);

    rect.coords = {
        leftX: topLeft.x.toFixed(2),
        bottomY: bottomRight.y.toFixed(2),
        rightX: bottomRight.x.toFixed(2),
        topY: topLeft.y.toFixed(2)
    };
}

// ==================== 辅助线检测 ====================

/**
 * 检测并返回十字辅助线
 * @param {Object} targetRect - 当前操作的矩形
 * @returns {Array} - 辅助线数组
 */
function detectGuideLines(targetRect) {
    const guides = [];
    const centerX = targetRect.x + targetRect.width / 2;
    const centerY = targetRect.y + targetRect.height / 2;

    // 垂直线（从矩形中心向上下延伸）
    guides.push({
        type: 'vertical',
        x: centerX,
        y1: 0,
        y2: canvas.height
    });

    // 水平线（从矩形中心向左右延伸）
    guides.push({
        type: 'horizontal',
        y: centerY,
        x1: 0,
        x2: canvas.width
    });

    // 左边缘垂直线
    guides.push({
        type: 'vertical',
        x: targetRect.x,
        y1: 0,
        y2: canvas.height
    });

    // 右边缘垂直线
    guides.push({
        type: 'vertical',
        x: targetRect.x + targetRect.width,
        y1: 0,
        y2: canvas.height
    });

    // 上边缘水平线
    guides.push({
        type: 'horizontal',
        y: targetRect.y,
        x1: 0,
        x2: canvas.width
    });

    // 下边缘水平线
    guides.push({
        type: 'horizontal',
        y: targetRect.y + targetRect.height,
        x1: 0,
        x2: canvas.width
    });

    return guides;
}

/**
 * 绘制辅助线
 */
function drawGuideLines(guides) {
    if (!guides || guides.length === 0) return;

    ctx.save();
    ctx.strokeStyle = GUIDE_LINE_COLOR;
    ctx.lineWidth = GUIDE_LINE_WIDTH;
    ctx.setLineDash(GUIDE_LINE_DASH);

    guides.forEach(guide => {
        ctx.beginPath();
        if (guide.type === 'vertical') {
            ctx.moveTo(guide.x, guide.y1);
            ctx.lineTo(guide.x, guide.y2);
        } else {
            ctx.moveTo(guide.x1, guide.y);
            ctx.lineTo(guide.x2, guide.y);
        }
        ctx.stroke();
    });

    ctx.restore();
}

// ==================== 添加矩形 ====================

function addRectangle() {
    if (!pdfDoc) {
        showToast('请先上传 PDF 文件', 'warning');
        return;
    }

    const label = document.getElementById('fieldLabel').value.trim();
    const text = document.getElementById('fieldText').value.trim();
    const fontSize = parseInt(document.getElementById('fontSize').value);

    if (!text) {
        showToast('请输入文字内容', 'warning');
        return;
    }

    // 计算文字实际宽度和高度
    ctx.font = `${fontSize}px Helvetica`;
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize; // 文字高度约等于字体大小

    // 添加一些内边距
    const paddingX = 8;
    const paddingY = 8;

    // 使用 canvas 坐标系
    const rectWidth = textWidth + paddingX * 2;
    const rectHeight = textHeight + paddingY * 2;

    // 在 PDF 中心创建矩形
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const rect = {
        id: Date.now(),
        label: label,
        text: text,
        fontSize: fontSize,
        x: centerX - rectWidth / 2,
        y: centerY - rectHeight / 2,
        width: rectWidth,
        height: rectHeight,
        pageNum: pageNum,
        selected: true
    };

    updateRectCoords(rect);

    // 取消之前选中的矩形
    rectangles.forEach(r => r.selected = false);
    selectedRectId = rect.id;

    rectangles.push(rect);

    drawRectanglesOnCanvas();
    updateCoordinateList();

    // 清空输入框
    document.getElementById('fieldLabel').value = '';
    document.getElementById('fieldText').value = '';
}

// ==================== 自由绘制模式 ====================

function toggleDrawingMode() {
    if (!pdfDoc) {
        showToast('请先上传 PDF 文件', 'warning');
        return;
    }

    isDrawingMode = !isDrawingMode;

    const btn = document.getElementById('drawRectBtn');
    if (isDrawingMode) {
        btn.classList.add('active');
        canvas.classList.add('drawing-mode');
        showToast('已进入绘制模式，在PDF上拖拽绘制矩形', 'info', 2000);
    } else {
        btn.classList.remove('active');
        canvas.classList.remove('drawing-mode');
    }
}

function drawSelectionBox(x, y, width, height) {
    ctx.save();
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);  // 虚线效果
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = 'rgba(0, 123, 255, 0.05)';
    ctx.fillRect(x, y, width, height);
    ctx.restore();
}

// ==================== 鼠标事件处理 ====================

function onMouseDown(e) {
    if (!pdfDoc) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 绘制模式：开始绘制矩形
    if (isDrawingMode) {
        isDrawing = true;
        drawStartX = mouseX;
        drawStartY = mouseY;
        return;
    }

    // 检查是否点击了控制点
    const handle = getResizeHandle(mouseX, mouseY);
    if (handle) {
        isResizing = true;
        resizeHandle = handle.handle;
        dragStartX = mouseX;
        dragStartY = mouseY;
        originalRect = { ...handle.rect };
        return;
    }

    // 检查是否点击了矩形
    const clickedRect = findRectAtPoint(mouseX, mouseY);
    if (clickedRect) {
        // 选中这个矩形
        rectangles.forEach(r => r.selected = false);
        clickedRect.selected = true;
        selectedRectId = clickedRect.id;

        isDragging = true;
        dragStartX = mouseX;
        dragStartY = mouseY;
        originalRect = { ...clickedRect };

        drawRectanglesOnCanvas();
        updateCoordinateList();
        return;
    }

    // 点击空白处，取消选中
    rectangles.forEach(r => r.selected = false);
    selectedRectId = null;
    drawRectanglesOnCanvas();
    updateCoordinateList();
}

function onMouseMove(e) {
    if (!pdfDoc) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 更新实时坐标显示
    const pdfCoords = canvasToPdfCoords(mouseX, mouseY);
    document.getElementById('coordX').textContent = pdfCoords.x.toFixed(2);
    document.getElementById('coordY').textContent = pdfCoords.y.toFixed(2);

    // 绘制模式：实时绘制临时矩形
    if (isDrawing && isDrawingMode) {
        drawRectanglesOnCanvas();  // 清除旧绘制
        drawSelectionBox(drawStartX, drawStartY, mouseX - drawStartX, mouseY - drawStartY);
        return;
    }

    // 处理调整大小
    if (isResizing && originalRect) {
        handleResize(mouseX, mouseY);
        return;
    }

    // 处理拖拽移动
    if (isDragging && originalRect) {
        const dx = mouseX - dragStartX;
        const dy = mouseY - dragStartY;

        const selectedRect = rectangles.find(r => r.id === selectedRectId);
        if (selectedRect) {
            selectedRect.x += dx;
            selectedRect.y += dy;

            dragStartX = mouseX;
            dragStartY = mouseY;

            updateRectCoords(selectedRect);

            // 检测并更新辅助线
            activeGuideLines = detectGuideLines(selectedRect);

            drawRectanglesOnCanvas();
            updateCoordinateListItem(selectedRect);
        }
    }

    // 处理调整大小 - 同时更新辅助线
    if (isResizing && originalRect) {
        const rect = rectangles.find(r => r.id === originalRect.id);
        if (rect) {
            activeGuideLines = detectGuideLines(rect);
        }
    }
}

function onMouseUp(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 绘制模式：结束绘制
    if (isDrawing && isDrawingMode) {
        isDrawing = false;
        isDrawingMode = false;

        // 移除绘制模式样式
        document.getElementById('drawRectBtn').classList.remove('active');
        canvas.classList.remove('drawing-mode');

        const width = mouseX - drawStartX;
        const height = mouseY - drawStartY;

        // 如果矩形太小，忽略
        if (Math.abs(width) < 5 || Math.abs(height) < 5) {
            drawRectanglesOnCanvas();
            return;
        }

        // 标准化矩形（处理负宽高）
        const finalX = width > 0 ? drawStartX : mouseX;
        const finalY = height > 0 ? drawStartY : mouseY;
        const finalWidth = Math.abs(width);
        const finalHeight = Math.abs(height);

        // 弹出模态框输入标签和文字
        showModal(finalX, finalY, finalWidth, finalHeight);
        return;
    }

    if (isResizing) {
        isResizing = false;
        resizeHandle = null;
        originalRect = null;
    }

    if (isDragging) {
        isDragging = false;
        originalRect = null;
    }

    // 清除辅助线
    if (activeGuideLines.length > 0) {
        activeGuideLines = [];
        drawRectanglesOnCanvas();
    }
}

// ==================== 控制点检测 ====================

function getResizeHandle(mouseX, mouseY) {
    const tolerance = 10;

    for (let i = rectangles.length - 1; i >= 0; i--) {
        const rect = rectangles[i];
        if (rect.pageNum !== pageNum) continue;

        const handles = getResizeHandles(rect);

        for (let handle of handles) {
            if (Math.abs(mouseX - handle.x) < tolerance &&
                Math.abs(mouseY - handle.y) < tolerance) {
                return { handle: handle.type, rect: rect };
            }
        }
    }

    return null;
}

function getResizeHandles(rect) {
    const x = rect.x;
    const y = rect.y;
    const w = rect.width;
    const h = rect.height;

    return [
        { x: x, y: y, type: 'nw' },
        { x: x + w / 2, y: y, type: 'n' },
        { x: x + w, y: y, type: 'ne' },
        { x: x + w, y: y + h / 2, type: 'e' },
        { x: x + w, y: y + h, type: 'se' },
        { x: x + w / 2, y: y + h, type: 's' },
        { x: x, y: y + h, type: 'sw' },
        { x: x, y: y + h / 2, type: 'w' }
    ];
}

function findRectAtPoint(x, y) {
    // 从后往前检查，这样后添加的矩形优先
    for (let i = rectangles.length - 1; i >= 0; i--) {
        const rect = rectangles[i];
        if (rect.pageNum === pageNum &&
            x >= rect.x && x <= rect.x + rect.width &&
            y >= rect.y && y <= rect.y + rect.height) {
            return rect;
        }
    }
    return null;
}

// ==================== 调整大小 ====================

function handleResize(mouseX, mouseY) {
    if (!originalRect || !resizeHandle) return;

    const rect = rectangles.find(r => r.id === originalRect.id);
    if (!rect) return;

    const dx = mouseX - dragStartX;
    const dy = mouseY - dragStartY;

    switch (resizeHandle) {
        case 'nw':
            rect.width = Math.max(20, originalRect.width - dx);
            rect.height = Math.max(20, originalRect.height - dy);
            rect.x = originalRect.x + (originalRect.width - rect.width);
            rect.y = originalRect.y + (originalRect.height - rect.height);
            break;
        case 'n':
            rect.height = Math.max(20, originalRect.height - dy);
            rect.y = originalRect.y + (originalRect.height - rect.height);
            break;
        case 'ne':
            rect.width = Math.max(20, originalRect.width + dx);
            rect.height = Math.max(20, originalRect.height - dy);
            rect.y = originalRect.y + (originalRect.height - rect.height);
            break;
        case 'e':
            rect.width = Math.max(20, originalRect.width + dx);
            break;
        case 'se':
            rect.width = Math.max(20, originalRect.width + dx);
            rect.height = Math.max(20, originalRect.height + dy);
            break;
        case 's':
            rect.height = Math.max(20, originalRect.height + dy);
            break;
        case 'sw':
            rect.width = Math.max(20, originalRect.width - dx);
            rect.height = Math.max(20, originalRect.height + dy);
            rect.x = originalRect.x + (originalRect.width - rect.width);
            break;
        case 'w':
            rect.width = Math.max(20, originalRect.width - dx);
            rect.x = originalRect.x + (originalRect.width - rect.width);
            break;
    }

    updateRectCoords(rect);
    drawRectanglesOnCanvas();
    updateCoordinateListItem(rect);
}

// ==================== 缩放控制 ====================

// 更新缩放显示
function updateZoomDisplay() {
    const percentage = Math.round(scale * 100);
    const input = document.getElementById('zoomLevel');
    const slider = document.getElementById('zoomSlider');
    input.value = percentage;
    slider.value = percentage;
}

// 设置缩放值（从输入框或滑块）
function setZoom(value) {
    // 验证输入
    if (isNaN(value)) {
        value = ZOOM_CONFIG.default * 100;
    } else {
        value = Math.max(ZOOM_CONFIG.min * 100, Math.min(ZOOM_CONFIG.max * 100, value));
    }

    scale = value / 100;
    renderPage(pageNum);
    updateZoomDisplay();
}

// 从输入框设置缩放
function setZoomFromInput() {
    const input = document.getElementById('zoomLevel');
    setZoom(parseFloat(input.value));
}

// 从滑块设置缩放
function setZoomFromSlider() {
    const slider = document.getElementById('zoomSlider');
    setZoom(parseFloat(slider.value));
}

// 适应页面
function zoomToFit() {
    const container = document.querySelector('.canvas-container');
    const containerWidth = container.clientWidth - padding * 2;
    const containerHeight = container.clientHeight - padding * 2;

    const scaleX = containerWidth / pageWidth;
    const scaleY = containerHeight / pageHeight;
    scale = Math.min(scaleX, scaleY, 1.5);

    renderPage(pageNum);
    updateZoomDisplay();
}

// ==================== 绘制功能 ====================

// 保存 PDF 渲染结果的离屏 canvas
let pdfCanvas = null;
let pdfCtx = null;

async function renderPage(num) {
    if (!pdfDoc) return;

    try {
        const page = await pdfDoc.getPage(num);
        currentPage = page;

        const viewport = page.getViewport({ scale: 1 });
        pageHeight = viewport.height;
        pageWidth = viewport.width;

        // 使用当前 scale 值，不再自动计算
        const scaledViewport = page.getViewport({ scale: scale });

        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;

        // 创建或更新离屏 canvas 用于缓存 PDF
        if (!pdfCanvas) {
            pdfCanvas = document.createElement('canvas');
            pdfCtx = pdfCanvas.getContext('2d');
        }
        pdfCanvas.width = scaledViewport.width;
        pdfCanvas.height = scaledViewport.height;

        // 渲染 PDF 到离屏 canvas
        const renderContext = {
            canvasContext: pdfCtx,
            viewport: scaledViewport
        };
        await page.render(renderContext).promise;

        // 将 PDF 绘制到主 canvas
        ctx.drawImage(pdfCanvas, 0, 0);

        drawRectanglesOnCanvas();

        document.getElementById('pageInfo').textContent = `第 ${num} / ${pdfPages} 页`;

    } catch (error) {
        console.error('渲染页面失败:', error);
    }
}

function drawRectanglesOnCanvas() {
    // 从离屏 canvas 绘制 PDF
    if (pdfCanvas) {
        ctx.drawImage(pdfCanvas, 0, 0);
    }

    // 绘制辅助线（在矩形之前）
    if (activeGuideLines.length > 0) {
        drawGuideLines(activeGuideLines);
    }

    // 绘制所有矩形
    rectangles.forEach(rect => {
        if (rect.pageNum === pageNum) {
            ctx.save();

            // 绘制矩形边框
            ctx.strokeStyle = rect.selected ? '#007bff' : '#ff0000';
            ctx.lineWidth = rect.selected ? 3 : 2;
            ctx.setLineDash([]);

            ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

            // 绘制半透明填充
            ctx.fillStyle = rect.selected ? 'rgba(0, 123, 255, 0.1)' : 'rgba(255, 0, 0, 0.1)';
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

            // 绘制文字
            if (rect.text) {
                ctx.font = `${rect.fontSize}px Helvetica`;
                ctx.fillStyle = rect.selected ? '#007bff' : 'red';
                ctx.fillText(rect.text, rect.x + 5, rect.y + rect.fontSize + 5);
            }

            // 如果选中，绘制控制点
            if (rect.selected) {
                drawResizeHandles(rect);
            }

            ctx.restore();
        }
    });
}

function drawResizeHandles(rect) {
    const handles = getResizeHandles(rect);
    ctx.save();

    handles.forEach(handle => {
        ctx.fillStyle = '#007bff';
        ctx.fillRect(
            handle.x - HANDLE_OFFSET,
            handle.y - HANDLE_OFFSET,
            HANDLE_SIZE,
            HANDLE_SIZE
        );
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            handle.x - HANDLE_OFFSET,
            handle.y - HANDLE_OFFSET,
            HANDLE_SIZE,
            HANDLE_SIZE
        );
    });

    ctx.restore();
}

// ==================== 坐标列表更新 ====================

function updateCoordinateList() {
    const listContainer = document.getElementById('coordinateList');

    if (rectangles.length === 0) {
        listContainer.innerHTML = '<p class="empty-hint">暂无坐标数据</p>';
        return;
    }

    let html = '';
    rectangles.forEach((rect, index) => {
        const { leftX, bottomY, rightX, topY } = rect.coords;
        // 简化格式：只显示坐标数字
        const coords = `${leftX}f, ${bottomY}f, ${rightX}f, ${topY}f`;

        html += `
            <div class="coord-item ${rect.selected ? 'selected' : ''}" data-id="${rect.id}">
                <div class="coord-header">
                    <span class="coord-title">${rect.label || '字段 ' + (index + 1)}</span>
                    <button class="btn-delete" onclick="deleteRect(${rect.id})">删除</button>
                </div>
                <div class="coord-code">${coords}</div>
                <div class="coord-info">标签: ${rect.label} ${rect.text ? '| 文字: ' + rect.text : ''} | ${rect.fontSize}pt</div>
            </div>
        `;
    });

    listContainer.innerHTML = html;
}

function updateCoordinateListItem(rect) {
    const item = document.querySelector(`.coord-item[data-id="${rect.id}"]`);
    if (!item) return;

    const { leftX, bottomY, rightX, topY } = rect.coords;
    // 简化格式：只显示坐标数字
    const coords = `${leftX}f, ${bottomY}f, ${rightX}f, ${topY}f`;

    const codeElement = item.querySelector('.coord-code');
    if (codeElement) {
        codeElement.textContent = coords;
    }
}

// ==================== 删除矩形 ====================

async function deleteRect(id) {
    rectangles = rectangles.filter(r => r.id !== id);
    if (selectedRectId === id) {
        selectedRectId = null;
    }
    drawRectanglesOnCanvas();
    updateCoordinateList();
}

async function clearAll() {
    if (rectangles.length === 0) return;

    showConfirm('确定要清空所有矩形吗？此操作不可撤销。', '清空所有矩形', () => {
        rectangles = [];
        selectedRectId = null;
        drawRectanglesOnCanvas();
        updateCoordinateList();
        showToast('已清空所有矩形', 'success');
    });
}

// ==================== 页面导航 ====================

function onPrevPage() {
    if (pageNum <= 1) return;
    pageNum--;
    renderPage(pageNum);
    updatePageNav();
}

function onNextPage() {
    if (!pdfDoc || pageNum >= pdfPages) return;
    pageNum++;
    renderPage(pageNum);
    updatePageNav();
}

function updatePageNav() {
    document.getElementById('prevPage').disabled = pageNum <= 1;
    document.getElementById('nextPage').disabled = !pdfDoc || pageNum >= pdfPages;
}

// ==================== 复制功能 ====================

function copyCoordinate(text) {
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '已复制!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 1500);
        showToast('坐标已复制到剪贴板', 'success', 1500);
    }).catch(err => {
        console.error('复制失败:', err);
        showToast('复制失败: ' + err.message, 'error');
    });
}

function copyAllCoordinates() {
    if (rectangles.length === 0) {
        showToast('没有可复制的坐标', 'warning');
        return;
    }

    let text = '';
    rectangles.forEach((rect, index) => {
        const { leftX, bottomY, rightX, topY } = rect.coords;
        const coords = `${leftX}f, ${bottomY}f, ${rightX}f, ${topY}f`;
        text += `// ${rect.label}\n`;
        text += `${coords}\n\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyAllBtn');
        const originalText = btn.textContent;
        btn.textContent = '已复制!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 1500);
        showToast('所有坐标已复制到剪贴板', 'success', 1500);
    }).catch(err => {
        console.error('复制失败:', err);
        showToast('复制失败: ' + err.message, 'error');
    });
}

// ==================== 全局函数导出 ====================
window.deleteRect = deleteRect;
window.copyCoordinate = copyCoordinate;
window.closeConfirm = closeConfirm;
