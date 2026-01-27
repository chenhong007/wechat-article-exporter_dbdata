<script setup lang="ts">
import type { ICellRendererParams } from 'ag-grid-community';

interface Props {
  params: ICellRendererParams;
}

const props = defineProps<Props>();

// 文章链接
const articleLink = computed(() => {
  return props.params.value || '';
});

// 点击图标跳转
function handleClick() {
  if (articleLink.value) {
    window.open(articleLink.value, '_blank');
  }
}
</script>

<template>
  <div class="flex items-center justify-center h-full px-2">
    <button
      v-if="articleLink"
      @click.stop="handleClick"
      class="flex-shrink-0 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer transition-colors duration-150"
      :title="`点击访问链接`"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </button>
  </div>
</template>

