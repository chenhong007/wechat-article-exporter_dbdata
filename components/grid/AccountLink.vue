<script setup lang="ts">
import type { ICellRendererParams } from 'ag-grid-community';

interface Props {
  params: ICellRendererParams;
}

const props = defineProps<Props>();

// 构建公众号主页链接
const accountLink = computed(() => {
  const fakeid = props.params.data?.fakeid;
  if (!fakeid) return null;
  return `https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=${fakeid}#wechat_redirect`;
});

// 公众号名称
const accountName = computed(() => {
  return props.params.value || '未知公众号';
});

// 点击跳转
function handleClick() {
  if (accountLink.value) {
    window.open(accountLink.value, '_blank');
  }
}
</script>

<template>
  <div class="flex items-center justify-center h-full">
    <button
      v-if="accountLink"
      @click.stop="handleClick"
      class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2 cursor-pointer transition-colors duration-150 font-medium"
      :title="`点击访问 ${accountName} 的公众号主页`"
    >
      {{ accountName }}
    </button>
    <span v-else class="text-gray-500">{{ accountName }}</span>
  </div>
</template>

