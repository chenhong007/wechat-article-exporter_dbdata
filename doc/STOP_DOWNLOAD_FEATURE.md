# 文章抓取停止功能实现文档

## 功能概述

在文章页面的抓取任务运行时，用户可以点击"停止"按钮来中止正在进行的抓取任务。系统会优雅地停止任务，等待当前正在进行的请求完成后，不再启动新的下载任务，并将前后端状态恢复到正常状态。

## 实现细节

### 1. 后端实现（Downloader.ts）

#### 1.1 添加停止方法

```typescript
// 停止下载任务
public stop() {
  if (!this.isProcessing) {
    return;
  }
  this.isStopping = true;
  // 取消所有待处理的请求
  this.cancelAllPending();
}
```

**功能说明：**
- 检查是否有正在进行的任务
- 设置停止标志 `isStopping`
- 调用 `cancelAllPending()` 取消所有待处理的 HTTP 请求

#### 1.2 优化任务队列处理逻辑

```typescript
private async processDownloadQueue() {
  const activePromises: Promise<any>[] = [];

  begin: while (this.urls.length > 0 || activePromises.length > 0) {
    // 检查是否需要停止
    if (this.isStopping) {
      console.debug('检测到停止信号，清空剩余任务');
      // 清空待下载队列
      this.urls.length = 0;
      break begin;
    }

    // ... 其他逻辑
  }

  // 等待所有正在进行的任务完成
  if (activePromises.length > 0) {
    console.debug(`等待 ${activePromises.length} 个正在进行的任务完成...`);
    await Promise.all(activePromises);
  }

  if (this.isStopping) {
    this.emit('download:stop');
    // 重置停止标志
    this.isStopping = false;
  }
}
```

**功能说明：**
- 在循环开始时检查停止标志
- 检测到停止信号后清空待下载队列
- 等待所有正在进行的任务完成（优雅停止）
- 触发 `download:stop` 事件
- 重置停止标志，恢复正常状态

### 2. 前端实现（article.vue）

#### 2.1 添加状态管理

```typescript
let currentDownloader: Downloader | null = null;

// 停止当前下载任务
function stopDownload() {
  if (currentDownloader) {
    currentDownloader.stop();
    toast.add({
      color: 'orange',
      title: '正在停止任务',
      description: '等待当前进行中的请求完成...',
      icon: 'i-heroicons-x-circle',
    });
  }
}
```

**功能说明：**
- `currentDownloader` 保存当前正在运行的下载器实例
- `stopDownload()` 函数调用下载器的 `stop()` 方法
- 显示友好的提示信息告知用户正在停止

#### 2.2 为每个下载函数添加停止支持

在三个下载函数中都添加了以下逻辑：

1. **设置当前下载器引用：**
```typescript
const manager = new Downloader(urls);
currentDownloader = manager;
```

2. **监听停止事件：**
```typescript
manager.on('download:stop', () => {
  console.debug('任务已停止');
  toast.add({
    color: 'amber',
    title: '【XXX】抓取已停止',
    description: `已完成:${progress_1.value}/${progress_2.value}`,
    icon: 'i-heroicons-exclamation-triangle',
  });
});
```

3. **任务结束后清理：**
```typescript
finally {
  downloadBtnLoading.value = false;
  currentDownloader = null;
}
```

#### 2.3 添加停止按钮

```vue
<UButton
  v-if="downloadBtnLoading"
  @click="stopDownload"
  color="orange"
  icon="i-heroicons-x-circle"
  class="font-mono"
>
  停止
</UButton>
```

**功能说明：**
- 只在抓取任务运行时显示（`v-if="downloadBtnLoading"`）
- 使用橙色警告色调
- 带有 X 图标，表示停止操作

## 工作流程

1. **用户点击抓取按钮**
   - 创建 Downloader 实例
   - 设置 `currentDownloader` 引用
   - 开始下载任务
   - 显示进度和停止按钮

2. **用户点击停止按钮**
   - 调用 `currentDownloader.stop()`
   - 显示"正在停止任务"提示
   - 设置 `isStopping = true`
   - 取消所有待处理的 HTTP 请求

3. **下载器停止处理**
   - 检测到停止标志
   - 清空待下载队列（不再启动新任务）
   - 等待当前正在进行的请求完成
   - 触发 `download:stop` 事件

4. **前端接收停止事件**
   - 显示"抓取已停止"提示
   - 显示已完成的进度

5. **任务清理**
   - 重置 `downloadBtnLoading = false`
   - 清空 `currentDownloader = null`
   - 重置 `isStopping = false`
   - 状态恢复正常，可以开始新的任务

## 支持的抓取类型

该停止功能支持所有三种抓取类型：

1. **文章内容抓取** (`downloadArticleHTML`)
2. **阅读量抓取** (`downloadArticleMetadata`)
3. **留言内容抓取** (`downloadArticleComment`)

## 特性

### ✅ 优雅停止
- 不会强制中断正在进行的请求
- 等待当前请求完成后再停止
- 避免数据不完整或状态混乱

### ✅ 状态恢复
- 自动重置停止标志
- 清理下载器引用
- 任务停止后可以立即开始新任务

### ✅ 用户友好
- 实时提示用户停止状态
- 显示已完成的进度
- 按钮仅在需要时显示

### ✅ 完整的事件通知
- `download:begin` - 任务开始
- `download:progress` - 进度更新
- `download:stop` - 任务停止
- `download:finish` - 任务完成

## 测试建议

1. **基本停止测试**
   - 选择大量文章
   - 点击抓取按钮
   - 等待几秒后点击停止按钮
   - 验证任务是否停止
   - 验证状态是否正确恢复

2. **立即停止测试**
   - 点击抓取按钮后立即点击停止
   - 验证是否能正确处理

3. **连续操作测试**
   - 启动任务 → 停止 → 立即重新启动
   - 验证是否能正常工作

4. **不同类型测试**
   - 分别测试文章内容、阅读量、留言内容三种抓取
   - 验证停止功能对所有类型都有效

## 注意事项

1. **正在进行的请求**：已经发出的 HTTP 请求会完成，停止功能不会强制中断它们
2. **并发控制**：停止后会等待所有并发请求完成
3. **状态一致性**：确保前后端状态始终保持一致
4. **重入保护**：`stop()` 方法有检查，避免重复调用

## 相关文件

- `utils/download/Downloader.ts` - 下载器核心实现
- `utils/download/BaseDownload.ts` - 基础下载类
- `pages/dashboard/article.vue` - 文章页面UI和逻辑
- `utils/download/types.d.ts` - 类型定义

## 更新日期

2025-12-15
