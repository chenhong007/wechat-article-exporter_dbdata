<template>
  <div :class="isDev ? 'debug-screens' : ''" class="flex flex-col h-screen">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <UNotifications />
    <UModals />
  </div>
</template>

<script setup lang="ts">
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import { isDev } from '~/config';
import { isChromeBrowser } from '~/utils';
import { autoLoadDatabase } from '~/utils/db-sync';

const runtimeConfig = useRuntimeConfig();

ModuleRegistry.registerModules([AllEnterpriseModule]);
LicenseManager.setLicenseKey(runtimeConfig.public.aggridLicense);

if (!isChromeBrowser()) {
  alert('为了更好的用户体验，推荐使用 Chrome 浏览器。');
}

// 在应用启动时自动加载数据库
onMounted(async () => {
  try {
    const loaded = await autoLoadDatabase();
    if (loaded) {
      console.log('✅ 数据库自动加载成功');
    }
  } catch (error) {
    console.error('❌ 数据库自动加载失败:', error);
  }
});
</script>

<style>
@import 'style.css';
</style>
