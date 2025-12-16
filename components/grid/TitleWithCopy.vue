<script setup lang="ts">
import type { ICellRendererParams } from 'ag-grid-community';

interface Props {
  params: ICellRendererParams;
}

const props = defineProps<Props>();
const toast = useToast();

// 标题内容
const title = computed(() => {
  return props.params.value || '';
});

// 复制状态
const copied = ref(false);

// 复制标题到剪贴板
async function copyTitle() {
  if (!title.value) return;

  try {
    await navigator.clipboard.writeText(title.value);
    copied.value = true;
    toast.add({
      color: 'green',
      title: '复制成功',
      description: '标题已复制到剪贴板',
      icon: 'i-heroicons-check-circle',
      timeout: 2000,
    });
    // 2秒后重置状态
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('复制失败:', err);
    toast.add({
      color: 'red',
      title: '复制失败',
      description: '无法复制到剪贴板',
      icon: 'i-heroicons-x-circle',
      timeout: 2000,
    });
  }
}
</script>

<template>
  <div class="flex items-center justify-start h-full gap-2 px-1 group">
    <span class="text-sm truncate flex-1" :title="title">{{ title }}</span>
    <button
      v-if="title"
      @click.stop="copyTitle"
      class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
      :class="copied ? 'text-green-600 dark:text-green-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'"
      :title="copied ? '已复制' : '复制标题'"
    >
      <svg
        v-if="!copied"
        xmlns="http://www.w3.org/2000/svg"
        class="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        class="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
    </button>
  </div>
</template>

