<script setup lang="ts">
import type { ICellRendererParams } from 'ag-grid-community';
import { CREDENTIAL_LIVE_MINUTES } from '~/config';
import { db } from '~/store/v2/db';
import toastFactory from '~/composables/toast';
import useCredentialCache from '~/composables/useCredentialCache';

interface Props {
  params: ICellRendererParams & {
    onRefresh?: (params: ICellRendererParams) => void;
  };
}
const props = defineProps<Props>();

const toast = toastFactory();

// 获取统一缓存的 credentials
const { credentials } = useCredentialCache();

// 当前公众号的 fakeid (即 biz)
const fakeid = computed(() => props.params.data?.fakeid);

// 查找当前公众号的 credential
const credential = computed(() => {
  if (!fakeid.value) return null;
  return credentials.value.find(c => c.biz === fakeid.value);
});

// 是否有有效的 credential
const hasValidCredential = computed(() => {
  if (!credential.value) return false;
  return Date.now() < credential.value.timestamp + 1000 * 60 * CREDENTIAL_LIVE_MINUTES;
});

// 是否有过期的 credential
const hasExpiredCredential = computed(() => {
  if (!credential.value) return false;
  return !hasValidCredential.value;
});

// 操作中状态
const copying = ref(false);

/**
 * 获取公众号的第一篇文章链接（用于刷新Credential）
 */
async function getFirstArticleLink(biz: string): Promise<string | null> {
  try {
    const articles = await db.article
      .where('fakeid')
      .equals(biz)
      .reverse()
      .sortBy('create_time');
    
    if (articles.length > 0) {
      return articles[0].link;
    }
    return null;
  } catch (error) {
    console.error('获取文章链接失败:', error);
    return null;
  }
}

/**
 * 复制文章链接到剪贴板，用户需要在微信中打开
 */
async function copyArticleLink() {
  if (copying.value || !fakeid.value) return;
  
  copying.value = true;
  
  try {
    const articleLink = await getFirstArticleLink(fakeid.value);
    
    if (!articleLink) {
      toast.error('获取失败', `公众号【${props.params.data?.nickname || fakeid.value}】没有缓存的文章，请先同步文章列表`);
      return;
    }
    
    // 复制链接到剪贴板
    await navigator.clipboard.writeText(articleLink);
    
    toast.success('链接已复制', `请在微信中打开此链接以获取 Credential（确保 wxdown-service 正在运行）`);
  } catch (error: any) {
    toast.error('复制失败', error?.message || '未知错误');
  } finally {
    copying.value = false;
  }
}
</script>

<template>
  <div class="flex items-center justify-center gap-2 h-full">
    <!-- 有效状态 -->
    <template v-if="hasValidCredential">
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
        有效
      </span>
    </template>
    
    <!-- 过期状态 -->
    <template v-else-if="hasExpiredCredential">
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
        <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
        过期
      </span>
      <UTooltip text="复制文章链接，在微信中打开以刷新">
        <UButton
          size="2xs"
          color="orange"
          variant="soft"
          :loading="copying"
          :disabled="copying"
          @click="copyArticleLink"
        >
          <UIcon v-if="!copying" name="i-lucide:copy" class="size-3" />
          复制
        </UButton>
      </UTooltip>
    </template>
    
    <!-- 无状态 -->
    <template v-else>
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        <span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
        无
      </span>
      <UTooltip text="复制文章链接，在微信中打开以获取">
        <UButton
          size="2xs"
          color="blue"
          variant="soft"
          :loading="copying"
          :disabled="copying"
          @click="copyArticleLink"
        >
          <UIcon v-if="!copying" name="i-lucide:copy" class="size-3" />
          复制
        </UButton>
      </UTooltip>
    </template>
  </div>
</template>

