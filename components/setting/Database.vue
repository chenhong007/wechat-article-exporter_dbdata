<template>
  <UCard class="mx-4 mt-10 flex-1">
    <template #header>
      <h3 class="text-2xl font-semibold">数据库管理</h3>
      <p class="text-sm text-slate-10 font-serif">导入导出数据库备份文件</p>
    </template>

    <div class="flex flex-col space-y-5">
      <!-- 导入数据库 -->
      <div>
        <h4 class="text-lg font-medium mb-2">导入数据库</h4>
        <p class="text-sm text-gray-500 mb-3">从 SQLite DB 文件导入数据到浏览器数据库</p>
        <div class="flex items-center gap-3">
          <input
            ref="fileInputRef"
            type="file"
            accept=".db"
            @change="handleImportFile"
            class="hidden"
          />
          <UButton
            color="primary"
            icon="i-heroicons:arrow-down-tray"
            :loading="importLoading"
            @click="triggerFileInput"
          >
            选择 DB 文件导入
          </UButton>
          <span v-if="importStats" class="text-sm text-gray-600">
            成功导入: {{ totalImported }} 条记录
          </span>
        </div>
        
        <div v-if="importLoading" class="mt-3">
          <UProgress :value="importProgress" color="primary" />
          <p class="text-sm text-gray-500 mt-1">正在导入数据...</p>
        </div>
      </div>

      <!-- 导出数据库 -->
      <div>
        <h4 class="text-lg font-medium mb-2">导出数据库</h4>
        <p class="text-sm text-gray-500 mb-3">
          将浏览器数据库导出为 SQLite DB 文件（包含文章的阅读数、点赞数、分享数、喜欢数、留言数等统计数据）
        </p>
        <div class="flex items-center gap-3 flex-wrap">
          <UButton
            color="primary"
            icon="i-heroicons:arrow-up-tray"
            :loading="exportLoading"
            @click="handleExportDatabase"
          >
            导出为 DB 文件
          </UButton>
          <UButton
            color="gray"
            variant="outline"
            icon="i-heroicons:document-text"
            :loading="metadataExportLoading === 'csv'"
            @click="handleExportMetadata('csv')"
          >
            导出统计数据为 CSV
          </UButton>
          <UButton
            color="gray"
            variant="outline"
            icon="i-heroicons:code-bracket"
            :loading="metadataExportLoading === 'json'"
            @click="handleExportMetadata('json')"
          >
            导出统计数据为 JSON
          </UButton>
        </div>
        <p class="text-xs text-gray-400 mt-2">
          CSV/JSON 格式仅导出统计数据，便于在 Excel 等工具中查看
        </p>
      </div>

      <!-- 数据统计 -->
      <div class="border-t pt-5">
        <h4 class="text-lg font-medium mb-2">数据库统计</h4>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <p class="text-sm text-gray-500">公众号数量</p>
            <p class="text-2xl font-bold">{{ dbStats.info }}</p>
          </div>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <p class="text-sm text-gray-500">文章数量</p>
            <p class="text-2xl font-bold">{{ dbStats.article }}</p>
          </div>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <p class="text-sm text-gray-500">资源数量</p>
            <p class="text-2xl font-bold">{{ dbStats.asset }}</p>
          </div>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <p class="text-sm text-gray-500">评论数量</p>
            <p class="text-2xl font-bold">{{ dbStats.comment }}</p>
          </div>
          <div class="p-3 bg-blue-50 dark:bg-blue-900/30 rounded">
            <p class="text-sm text-blue-600 dark:text-blue-400">统计数据数量</p>
            <p class="text-2xl font-bold text-blue-700 dark:text-blue-300">{{ dbStats.metadata }}</p>
          </div>
        </div>
      </div>

      <!-- 自动加载设置 -->
      <div class="border-t pt-5">
        <h4 class="text-lg font-medium mb-2">自动加载</h4>
        <p class="text-sm text-gray-500 mb-3">应用启动时会自动从 <code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">/data/wechat-backup-2025-11-12T06-46-03.db</code> 加载数据</p>
        <UButton
          color="gray"
          icon="i-heroicons:arrow-path"
          :loading="autoLoadLoading"
          @click="handleAutoLoad"
        >
          立即执行自动加载
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { 
  importFromSqlite, 
  exportToSqlite, 
  autoLoadDatabase,
  exportMetadataToCsv,
  exportMetadataToJson,
} from '~/utils/db-sync';
import { db } from '~/store/v2/db';
import toastFactory from '~/composables/toast';

const toast = toastFactory();

// 文件输入引用
const fileInputRef = ref<HTMLInputElement | null>(null);

// 导入状态
const importLoading = ref(false);
const importProgress = ref(0);
const importStats = ref<any>(null);

// 导出状态
const exportLoading = ref(false);

// 自动加载状态
const autoLoadLoading = ref(false);

// Metadata 导出状态
const metadataExportLoading = ref<'csv' | 'json' | null>(null);

// 数据库统计
const dbStats = ref({
  info: 0,
  article: 0,
  asset: 0,
  comment: 0,
  metadata: 0,
});

// 计算总导入数
const totalImported = computed(() => {
  if (!importStats.value) return 0;
  return Object.values(importStats.value).reduce((sum: number, val: any) => sum + (val || 0), 0);
});

// 触发文件选择
function triggerFileInput() {
  fileInputRef.value?.click();
}

// 处理导入文件
async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  
  if (!file) return;

  try {
    importLoading.value = true;
    importProgress.value = 0;
    
    // 模拟进度
    const progressInterval = setInterval(() => {
      if (importProgress.value < 90) {
        importProgress.value += 10;
      }
    }, 200);

    const stats = await importFromSqlite(file);
    
    clearInterval(progressInterval);
    importProgress.value = 100;
    
    importStats.value = stats;
    
    toast.success('导入成功', `成功导入 ${totalImported.value} 条记录`);
    
    // 刷新统计
    await refreshStats();
  } catch (error) {
    console.error('导入失败:', error);
    toast.error('导入失败', (error as Error).message);
  } finally {
    importLoading.value = false;
    importProgress.value = 0;
    // 清空文件选择
    if (input) {
      input.value = '';
    }
  }
}

// 处理导出数据库
async function handleExportDatabase() {
  try {
    exportLoading.value = true;
    
    const blob = await exportToSqlite();
    
    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `wechat-backup-${timestamp}.db`;
    
    // 下载文件
    downloadBlob(blob, filename);
    
    toast.success('导出成功', `数据库已导出为 ${filename}`);
  } catch (error) {
    console.error('导出失败:', error);
    toast.error('导出失败', (error as Error).message);
  } finally {
    exportLoading.value = false;
  }
}

// 导出 Metadata 数据（CSV/JSON 格式，便于查看）
async function handleExportMetadata(format: 'csv' | 'json') {
  try {
    metadataExportLoading.value = format;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    let blob: Blob;
    let filename: string;
    
    if (format === 'csv') {
      blob = await exportMetadataToCsv();
      filename = `wechat-metadata-${timestamp}.csv`;
    } else {
      blob = await exportMetadataToJson();
      filename = `wechat-metadata-${timestamp}.json`;
    }
    
    downloadBlob(blob, filename);
    
    toast.success('导出成功', `统计数据已导出为 ${filename}`);
  } catch (error) {
    console.error('导出 Metadata 失败:', error);
    toast.error('导出失败', (error as Error).message);
  } finally {
    metadataExportLoading.value = null;
  }
}

// 通用下载 Blob 函数
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 处理自动加载
async function handleAutoLoad() {
  try {
    autoLoadLoading.value = true;
    
    const loaded = await autoLoadDatabase();
    
    if (loaded) {
      toast.success('自动加载成功', '数据已从备份文件加载');
      await refreshStats();
    } else {
      toast.info('提示', '数据库已有数据或备份文件不存在');
    }
  } catch (error) {
    console.error('自动加载失败:', error);
    toast.error('自动加载失败', (error as Error).message);
  } finally {
    autoLoadLoading.value = false;
  }
}

// 刷新统计数据
async function refreshStats() {
  dbStats.value.info = await db.info.count();
  dbStats.value.article = await db.article.count();
  dbStats.value.asset = await db.asset.count();
  dbStats.value.comment = await db.comment.count();
  dbStats.value.metadata = await db.metadata.count();
}

// 组件挂载时刷新统计
onMounted(() => {
  refreshStats();
});
</script>

