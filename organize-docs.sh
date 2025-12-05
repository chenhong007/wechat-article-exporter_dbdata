#!/bin/bash

# 整理所有文档到 doc 目录

set -e

PROJECT_DIR="/home/wechat-article-exporter"
DOC_DIR="$PROJECT_DIR/doc"

echo "📚 开始整理文档..."
echo "================================"

# 创建 doc 目录
mkdir -p "$DOC_DIR"
echo "✅ 创建 doc 目录"

# 移动根目录的文档
echo ""
echo "📝 移动根目录文档..."

# 文档列表（保留 README.md 在根目录）
docs_to_move=(
    "CHANGELOG.md"
    "CODE_OF_CONDUCT.md"
    "DEPLOY_SCRIPTS_README.md"
    "IMPLEMENTATION_SUMMARY.md"
    "todos.md"
)

# 如果存在其他新增的文档
if [ -f "$PROJECT_DIR/FIX_502_ERROR.md" ]; then
    docs_to_move+=("FIX_502_ERROR.md")
fi

if [ -f "$PROJECT_DIR/FINAL_REPORT.md" ]; then
    docs_to_move+=("FINAL_REPORT.md")
fi

# 移动文档
for doc in "${docs_to_move[@]}"; do
    if [ -f "$PROJECT_DIR/$doc" ]; then
        mv "$PROJECT_DIR/$doc" "$DOC_DIR/"
        echo "  ✓ $doc"
    else
        echo "  ⚠ $doc (未找到)"
    fi
done

# 查找并移动其他目录的 readme
echo ""
echo "📝 移动其他目录的文档..."

# utils/readme.md
if [ -f "$PROJECT_DIR/utils/readme.md" ]; then
    mv "$PROJECT_DIR/utils/readme.md" "$DOC_DIR/utils-readme.md"
    echo "  ✓ utils/readme.md → utils-readme.md"
fi

# shared 目录的 md 文件
if [ -d "$PROJECT_DIR/shared" ]; then
    find "$PROJECT_DIR/shared" -name "*.md" -type f | while read -r file; do
        filename=$(basename "$file")
        mv "$file" "$DOC_DIR/shared-$filename"
        echo "  ✓ shared/$filename → shared-$filename"
    done
fi

# 创建文档索引
echo ""
echo "📋 创建文档索引..."

cat > "$DOC_DIR/README.md" << 'EOF'
# 项目文档目录

本目录包含项目的所有文档。

## 📚 文档列表

### 核心文档
- **[../README.md](../README.md)** - 项目主文档（位于根目录）
- **[CHANGELOG.md](CHANGELOG.md)** - 更新日志
- **[todos.md](todos.md)** - 待办事项

### 部署文档
- **[DEPLOY_SCRIPTS_README.md](DEPLOY_SCRIPTS_README.md)** - 自动部署脚本使用说明
- **[FIX_502_ERROR.md](FIX_502_ERROR.md)** - 502 错误修复指南（如果存在）

### 开发文档
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - 功能实现总结
- **[utils-readme.md](utils-readme.md)** - 工具函数说明（如果存在）
- **[shared-*.md](.)** - 共享模块文档（如果存在）

### 社区文档
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** - 行为准则

## 📝 文档规范

### 文档命名

- 使用小写字母和连字符：`my-document.md`
- 重要文档使用大写：`README.md`, `CHANGELOG.md`
- 技术文档使用描述性名称：`deployment-guide.md`

### 文档结构

```markdown
# 文档标题

简要说明文档内容...

## 目录
- [章节1](#章节1)
- [章节2](#章节2)

## 章节1

内容...

## 章节2

内容...
```

### 更新日志格式

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 规范：

```markdown
## [版本号] - 日期

### Added
- 新增功能

### Changed
- 变更内容

### Fixed
- 修复内容
```

## 🔗 相关链接

- [项目主页](https://github.com/wechat-article/wechat-article-exporter)
- [问题反馈](https://github.com/wechat-article/wechat-article-exporter/issues)
- [贡献指南](../README.md#贡献)

---

📅 最后更新：2025-12-05
EOF

echo "  ✓ README.md (索引文件)"

# 显示结果
echo ""
echo "================================"
echo "✅ 文档整理完成！"
echo "================================"
echo ""
echo "📁 文档目录: $DOC_DIR"
echo ""
echo "📋 已整理的文档:"
ls -1 "$DOC_DIR/" | while read -r file; do
    echo "  • $file"
done

echo ""
echo "💡 提示:"
echo "  • 项目主文档 README.md 保留在根目录"
echo "  • 查看文档索引: cat doc/README.md"
echo "  • 所有文档已移至 doc/ 目录"
