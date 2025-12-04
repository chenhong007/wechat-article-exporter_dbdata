<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-lg font-semibold mb-3">后端存储设置</h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        配置文章数据的后端存储和同步策略。数据会优先从本地缓存读取，超过缓存时间后从服务器获取。
      </p>
    </div>

    <!-- 存储统计信息 -->
    <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="font-medium">存储统计</h4>
        <UButton
          size="xs"
          color="gray"
          icon="i-heroicons-arrow-path"
          :loading="loadingStats"
          @click="loadStorageStats"
        >
          刷新
        </UButton>
      </div>

      <div v-if="storageStats" class="grid grid-cols-3 gap-4">
        <div class="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {{ storageStats.accountCount }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">公众号数量</div>
        </div>
        <div class="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div class="text-2xl font-bold text-green-600 dark:text-green-400">
            {{ storageStats.totalArticles }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">文章总数</div>
        </div>
        <div class="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
          <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {{ storageStats.storageKeys }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">存储键数量</div>
        </div>
      </div>

      <div v-else-if="loadingStats" class="text-center py-8 text-gray-500">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin h-6 w-6 mx-auto mb-2" />
        <p>加载统计信息...</p>
      </div>

      <div v-else class="text-center py-8 text-gray-500">
        <p>暂无统计数据</p>
        <UButton size="xs" color="gray" class="mt-2" @click="loadStorageStats">
          点击加载
        </UButton>
      </div>
    </div>

    <!-- 缓存设置 -->
    <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <h4 class="font-medium">缓存设置</h4>
      
      <div class="space-y-2">
        <label class="text-sm text-gray-600 dark:text-gray-400">
          本地缓存有效期（分钟）
        </label>
        <UInput
          v-model="cacheExpiryMinutes"
          type="number"
          min="1"
          max="1440"
          placeholder="30"
        />
        <p class="text-xs text-gray-500">
          设置本地缓存的有效时间，超过此时间将从服务器重新获取数据。默认 30 分钟。
        </p>
      </div>

      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">自动同步到服务器</p>
          <p class="text-xs text-gray-500">公众号同步完成后自动上传到服务器</p>
        </div>
        <UToggle v-model="autoSyncToBackend" />
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <h4 class="font-medium">数据操作</h4>
      
      <div class="grid grid-cols-2 gap-3">
        <UButton
          color="blue"
          icon="i-heroicons-arrow-up-tray"
          :loading="syncingAll"
          block
          @click="syncAllToBackend"
        >
          全部同步到服务器
        </UButton>
        
        <UButton
          color="gray"
          icon="i-heroicons-trash"
          block
          @click="clearLocalCache"
        >
          清除本地缓存
        </UButton>
      </div>

      <p class="text-xs text-gray-500">
        <UIcon name="i-heroicons-information-circle" class="inline" />
        全部同步会将本地所有公众号的文章数据上传到服务器
      </p>
    </div>

    <!-- 状态提示 -->
    <div v-if="lastSyncTime" class="text-xs text-gray-500 text-center">
      上次同步: {{ formatTime(lastSyncTime) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { 
  getBackendStorageStats, 
  batchSyncArticlesToBackend 
} from '~/composables/useBackendSync';
import { getAllInfo } from '~/store/v2/info';

const toast = useToast();

// 存储统计
const storageStats = ref<{
  accountCount: number;
  totalArticles: number;
  storageKeys: number;
} | null>(null);
const loadingStats = ref(false);

// 缓存设置
const cacheExpiryMinutes = ref(30);
const autoSyncToBackend = ref(true);

// 同步状态
const syncingAll = ref(false);
const lastSyncTime = ref<number | null>(null);

// 加载存储统计
async function loadStorageStats() {
  loadingStats.value = true;
  try {
    storageStats.value = await getBackendStorageStats();
  } catch (error: any) {
    console.error('加载存储统计失败:', error);
    toast.add({
      color: 'red',
      title: '加载失败',
      description: error.message || '获取存储统计信息失败',
    });
  } finally {
    loadingStats.value = false;
  }
}

// 同步所有数据到后端
async function syncAllToBackend() {
  syncingAll.value = true;
  try {
    // 获取所有公众号
    const allAccounts = await getAllInfo();
    if (allAccounts.length === 0) {
      toast.add({
        color: 'yellow',
        title: '提示',
        description: '没有可同步的公众号',
      });
      return;
    }

    const fakeids = allAccounts.map(acc => acc.fakeid);
    const result = await batchSyncArticlesToBackend(fakeids);

    if (result.success) {
      lastSyncTime.value = Date.now();
      toast.add({
        color: 'green',
        title: '同步成功',
        description: result.message,
      });
      
      // 刷新统计
      await loadStorageStats();
    } else {
      toast.add({
        color: 'red',
        title: '同步失败',
        description: result.message,
      });
    }
  } catch (error: any) {
    console.error('同步到后端失败:', error);
    toast.add({
      color: 'red',
      title: '同步失败',
      description: error.message || '同步数据到服务器失败',
    });
  } finally {
    syncingAll.value = false;
  }
}

// 清除本地缓存
function clearLocalCache() {
  // 清除缓存元数据
  const keys = Object.keys(localStorage).filter(key => key.startsWith('backend-sync-meta'));
  keys.forEach(key => localStorage.removeItem(key));
  
  toast.add({
    color: 'green',
    title: '清除成功',
    description: `已清除 ${keys.length} 个缓存记录`,
  });
}

// 格式化时间
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN');
}

// 页面加载时获取统计
onMounted(() => {
  loadStorageStats();
  
  // 从 localStorage 加载设置
  const savedExpiry = localStorage.getItem('backend-cache-expiry');
  if (savedExpiry) {
    cacheExpiryMinutes.value = Number.parseInt(savedExpiry);
  }
  
  const savedAutoSync = localStorage.getItem('backend-auto-sync');
  if (savedAutoSync !== null) {
    autoSyncToBackend.value = savedAutoSync === 'true';
  }
});

// 监听设置变化并保存
watch(cacheExpiryMinutes, (value) => {
  localStorage.setItem('backend-cache-expiry', String(value));
});

watch(autoSyncToBackend, (value) => {
  localStorage.setItem('backend-auto-sync', String(value));
});
</script>

