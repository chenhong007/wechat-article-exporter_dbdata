<template>
  <div class="p-8">
    <h1 class="text-3xl font-bold mb-6">数据库同步功能测试</h1>
    
    <div class="space-y-6">
      <!-- 导入测试 -->
      <div class="border p-4 rounded">
        <h2 class="text-xl font-semibold mb-3">导入测试</h2>
        <input
          ref="fileInput"
          type="file"
          accept=".db"
          @change="testImport"
          class="mb-3"
        />
        <div v-if="importResult">
          <p class="text-green-600">导入成功！</p>
          <pre class="bg-gray-100 p-2 rounded mt-2">{{ JSON.stringify(importResult, null, 2) }}</pre>
        </div>
      </div>

      <!-- 导出测试 -->
      <div class="border p-4 rounded">
        <h2 class="text-xl font-semibold mb-3">导出测试</h2>
        <button
          @click="testExport"
          class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          :disabled="exportLoading"
        >
          {{ exportLoading ? '导出中...' : '导出数据库' }}
        </button>
        <div v-if="exportSuccess" class="mt-3">
          <p class="text-green-600">导出成功！</p>
        </div>
      </div>

      <!-- 自动加载测试 -->
      <div class="border p-4 rounded">
        <h2 class="text-xl font-semibold mb-3">自动加载测试</h2>
        <button
          @click="testAutoLoad"
          class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          :disabled="autoLoadLoading"
        >
          {{ autoLoadLoading ? '加载中...' : '测试自动加载' }}
        </button>
        <div v-if="autoLoadResult !== null" class="mt-3">
          <p :class="autoLoadResult ? 'text-green-600' : 'text-yellow-600'">
            {{ autoLoadResult ? '自动加载成功！' : '数据库已有数据或文件不存在' }}
          </p>
        </div>
      </div>

      <!-- 数据统计 -->
      <div class="border p-4 rounded">
        <h2 class="text-xl font-semibold mb-3">当前数据库统计</h2>
        <button
          @click="refreshStats"
          class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 mb-3"
        >
          刷新统计
        </button>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <p class="text-gray-600">公众号数量</p>
            <p class="text-2xl font-bold">{{ stats.info }}</p>
          </div>
          <div>
            <p class="text-gray-600">文章数量</p>
            <p class="text-2xl font-bold">{{ stats.article }}</p>
          </div>
          <div>
            <p class="text-gray-600">资源数量</p>
            <p class="text-2xl font-bold">{{ stats.asset }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { importFromSqlite, exportToSqlite, autoLoadDatabase } from '~/utils/db-sync';
import { db } from '~/store/v2/db';

const fileInput = ref<HTMLInputElement | null>(null);
const importResult = ref<any>(null);
const exportLoading = ref(false);
const exportSuccess = ref(false);
const autoLoadLoading = ref(false);
const autoLoadResult = ref<boolean | null>(null);

const stats = ref({
  info: 0,
  article: 0,
  asset: 0,
});

async function testImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  
  if (!file) return;

  try {
    const result = await importFromSqlite(file);
    importResult.value = result;
    await refreshStats();
    alert('导入成功！');
  } catch (error) {
    console.error('导入失败:', error);
    alert('导入失败: ' + (error as Error).message);
  }
}

async function testExport() {
  try {
    exportLoading.value = true;
    exportSuccess.value = false;
    
    const blob = await exportToSqlite();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `test-export-${timestamp}.db`;
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    exportSuccess.value = true;
    alert('导出成功！');
  } catch (error) {
    console.error('导出失败:', error);
    alert('导出失败: ' + (error as Error).message);
  } finally {
    exportLoading.value = false;
  }
}

async function testAutoLoad() {
  try {
    autoLoadLoading.value = true;
    autoLoadResult.value = null;
    
    const result = await autoLoadDatabase();
    autoLoadResult.value = result;
    
    if (result) {
      await refreshStats();
    }
  } catch (error) {
    console.error('自动加载失败:', error);
    alert('自动加载失败: ' + (error as Error).message);
  } finally {
    autoLoadLoading.value = false;
  }
}

async function refreshStats() {
  stats.value.info = await db.info.count();
  stats.value.article = await db.article.count();
  stats.value.asset = await db.asset.count();
}

onMounted(() => {
  refreshStats();
});
</script>

