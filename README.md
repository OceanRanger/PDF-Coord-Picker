# PDF 坐标拾取工具 / PDF Coordinate Picker

一个用于在 PDF 模板上通过拖拽方式精确获取字段坐标的工具，适用于 iText PDF 开发。

A tool for accurately picking field coordinates on PDF templates via drag-and-drop, designed for iText PDF development.

## 快速开始 / Quick Start

```bash
# 启动服务 / Start server
python -m http.server 8765
```

访问 http://localhost:8765

## 使用方法 / Usage

1. 上传 PDF 文件 / Upload PDF file
2. 点击"自由绘制" / Click "自由绘制"
3. 在 PDF 上拖拽绘制矩形 / Drag to draw rectangles
4. 点击"复制所有坐标" / Click "复制所有坐标"

## 坐标格式 / Coordinate Format

输出 iText Rectangle 格式（llx, lly, urx, ury）：

```
// Field Label
196f, 648f, 486f, 669f
```

**参数说明 / Parameters**：

- `196f` - 左下角X / Lower-left X
- `648f` - 左下角Y / Lower-left Y
- `486f` - 右上角X / Upper-right X
- `669f` - 右上角Y / Upper-right Y

**在代码中使用 / Usage in code**：

```java
Rectangle rect = new Rectangle(196f, 648f, 486f, 669f);
```

## 功能 / Features

- 拖拽绘制矩形 / Drag to draw rectangles
- 自动坐标转换 / Automatic coordinate conversion
- 多页 PDF 支持 / Multi-page PDF support
- 缩放控制 / Zoom control (50%-300%)
- 辅助线对齐 / Alignment guide lines

## 技术栈 / Tech Stack

- PDF.js
- Vanilla JavaScript
- CSS3
