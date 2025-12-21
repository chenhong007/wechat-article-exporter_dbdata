<template>
  <USelectMenu
    v-model="selected"
    size="md"
    color="gray"
    multiple
    searchable
    searchable-placeholder="搜索公众号名称..."
    clear-search-on-close
    :options="optionsWithSelectAll"
    option-attribute="nickname"
    placeholder="请选择公众号 (可多选)"
    @update:model-value="handleSelectionChange"
  >
    <template #label>
      <span v-if="selected && selected.length === 0" class="text-gray-500">请选择公众号 (可多选)</span>
      <span v-else-if="selected && selected.length === sortedAccountInfos.length" class="font-semibold">全部公众号 ({{ selected.length }}个)</span>
      <span v-else-if="selected && selected.length === 1" class="font-semibold">{{ selected[0].nickname }}</span>
      <span v-else-if="selected && selected.length > 1 && selected.length <= 3" class="font-semibold">{{ selected.map(s => s.nickname).join('、') }}</span>
      <span v-else-if="selected && selected.length > 3" class="font-semibold">{{ selected.slice(0, 2).map(s => s.nickname).join('、') }} 等{{ selected.length }}个</span>
    </template>
    <template #option="{ option: account }">
      <template v-if="account.isSelectAll">
        <UIcon 
          :name="isAllSelected ? 'i-heroicons-check-circle-20-solid' : 'i-heroicons-check-circle'" 
          class="w-5 h-5"
          :class="isAllSelected ? 'text-primary' : 'text-gray-400'"
        />
        <span class="font-semibold text-primary">{{ account.nickname }}</span>
      </template>
      <template v-else>
        <UAvatar :src="account.round_head_img" size="sm" />
        <div>
          <p class="text-[16px]">{{ account.nickname }}</p>
          <p class="text-gray-500 text-sm">已加载文章数: {{ account.articles }}</p>
        </div>
      </template>
    </template>
  </USelectMenu>
</template>

<script setup lang="ts">
import { getAllInfo, type Info } from '~/store/v2/info';

// 已缓存的公众号信息
const cachedAccountInfos = await getAllInfo();
const sortedAccountInfos = computed(() => {
  cachedAccountInfos.sort((a, b) => {
    return a.articles > b.articles ? -1 : 1;
  });
  return cachedAccountInfos;
});

const selected = defineModel<Info[]>();

// 判断是否全选
const isAllSelected = computed(() => {
  return selected.value && selected.value.length === sortedAccountInfos.value.length && sortedAccountInfos.value.length > 0;
});

// 创建一个特殊的"全选"选项
const selectAllOption = {
  fakeid: '__SELECT_ALL__',
  nickname: '【全选所有公众号】',
  completed: false,
  count: 0,
  articles: 0,
  total_count: 0,
  isSelectAll: true,
} as Info & { isSelectAll: boolean };

// 在选项列表顶部添加"全选"选项
const optionsWithSelectAll = computed(() => {
  return [selectAllOption, ...sortedAccountInfos.value];
});

// 处理选择变化
function handleSelectionChange(newSelection: Info[]) {
  // 检查是否选择了"全选"选项
  const hasSelectAll = newSelection.some(item => (item as any).isSelectAll);
  
  if (hasSelectAll) {
    // 如果选择了"全选"，则选择所有真实的公众号
    if (isAllSelected.value) {
      // 如果已经全选，则取消全选
      selected.value = [];
    } else {
      // 否则全选所有公众号
      selected.value = [...sortedAccountInfos.value];
    }
  } else {
    // 正常选择
    selected.value = newSelection.filter(item => !(item as any).isSelectAll);
  }
}
</script>

