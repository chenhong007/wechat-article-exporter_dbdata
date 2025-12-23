<script setup lang="ts">
import { AG_GRID_LOCALE_CN } from '@ag-grid-community/locale';
import {
  type ColDef,
  type GetRowIdParams,
  type GridApi,
  type GridOptions,
  type GridReadyEvent,
  type ICellRendererParams,
  type IDateFilterParams,
  type SelectionChangedEvent,
  themeQuartz,
  type ValueFormatterParams,
  type ValueGetterParams,
} from 'ag-grid-community';
import { AgGridVue } from 'ag-grid-vue3';
import { formatTimeStamp } from '#shared/utils/helpers';
import { getArticleList } from '~/apis';
import GlobalSearchAccountDialog from '~/components/global/SearchAccountDialog.vue';
import GridAccountActions from '~/components/grid/AccountActions.vue';
import GridCredentialStatus from '~/components/grid/CredentialStatus.vue';
import GridLoading from '~/components/grid/Loading.vue';
import GridLoadProgress from '~/components/grid/LoadProgress.vue';
import GridNoRows from '~/components/grid/NoRows.vue';
import ConfirmModal from '~/components/modal/Confirm.vue';
import LoginModal from '~/components/modal/Login.vue';
import toastFactory from '~/composables/toast';
import useLoginCheck from '~/composables/useLoginCheck';
import { IMAGE_PROXY, isDev, websiteName } from '~/config';
import { deleteAccountData } from '~/store/v2';
import { getArticleCache, hitCache } from '~/store/v2/article';
import { getAllInfo, getInfoCache, type Info, importInfos } from '~/store/v2/info';
import type { AccountManifest } from '~/types/account';
import type { Preferences } from '~/types/preferences';
import { exportAccountJsonFile } from '~/utils/exporter';
import { 
  syncArticlesToBackend, 
  batchSyncArticlesToBackend,
  syncInfoToBackend,
  restoreDataFromBackend,
  hasLocalData,
  hasBackendData,
} from '~/composables/useBackendSync';

useHead({
  title: `公众号管理 | ${websiteName}`,
});

interface PromiseInstance {
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
}

const toast = toastFactory();
const modal = useModal();
const { checkLogin } = useLoginCheck();

const { getSyncTimestamp } = useSyncDeadline();

/**
 * 验证 fakeid 是否有效
 */
function isValidFakeid(fakeid: string | undefined | null): boolean {
  if (!fakeid || typeof fakeid !== 'string') {
    return false;
  }
  const trimmed = fakeid.trim();
  const base64Pattern = /^[A-Za-z0-9+/=]{10,50}$/;
  return trimmed.length >= 10 && base64Pattern.test(trimmed);
}

/**
 * 检测并显示无效的公众号数据（仅开发模式）
 */
async function validateAccountData() {
  const allAccounts = await getAllInfo();
  const invalidAccounts = allAccounts.filter(acc => !isValidFakeid(acc.fakeid));
  
  if (invalidAccounts.length === 0) {
    toast.success('数据验证', '所有公众号数据都是有效的');
  } else {
    console.warn('发现无效的公众号数据:', invalidAccounts);
    const names = invalidAccounts.map(acc => `${acc.nickname || '未知'} (fakeid: ${acc.fakeid})`).join('\n');
    toast.warning(
      '数据验证',
      `发现 ${invalidAccounts.length} 个公众号数据无效，建议删除后重新添加：\n${names}`
    );
  }
}

const preferences = usePreferences();

// 账号事件总线，用于和 Credentials 面板保持列表同步
const { accountEventBus } = useAccountEventBus();
accountEventBus.on(event => {
  if (event === 'account-added' || event === 'account-removed') {
    refresh();
  }
});

const searchAccountDialogRef = ref<typeof GlobalSearchAccountDialog | null>(null);

const addBtnLoading = ref(false);
function addAccount() {
  if (!checkLogin()) return;

  searchAccountDialogRef.value!.open();
}
async function onSelectAccount(account: Info) {
  // 验证公众号数据完整性
  if (!account.fakeid || !account.fakeid.trim()) {
    toast.error(
      '添加失败', 
      `公众号【${account.nickname || '未知'}】的数据不完整，缺少有效的 fakeid`
    );
    return;
  }

  addBtnLoading.value = true;
  try {
    await loadAccountArticle(account, false);
    await refresh();
    toast.success('公众号添加成功', `已成功添加公众号【${account.nickname}】，并拉取了第一页文章数据`);
    // 通知 Credentials 面板按钮立即变更为"已添加"
    accountEventBus.emit('account-added', { fakeid: account.fakeid });
  } catch (error: any) {
    const errorMsg = error.message || '未知错误';
    // 针对 200002 错误提供更友好的提示
    if (errorMsg.includes('200002') || errorMsg.includes('invalid args') || errorMsg.includes('无效')) {
      toast.error(
        '添加失败', 
        `无法添加公众号【${account.nickname}】，数据验证失败。错误: ${errorMsg}`
      );
    } else {
      toast.error('添加失败', errorMsg);
    }
  } finally {
    addBtnLoading.value = false;
  }
}

const isCanceled = ref(false);
const timer = ref<number | null>(null);

const syncToTimestamp = getSyncTimestamp();

async function _load(account: Info, begin: number, loadMore: boolean, promise: PromiseInstance) {
  if (isCanceled.value) {
    isCanceled.value = false;
    promise.reject(new Error('已取消'));
    return;
  }

  syncingRowId.value = account.fakeid;
  isSyncing.value = true;

  const [articles, completed] = await getArticleList(account, begin);
  if (isCanceled.value) {
    isCanceled.value = false;
    promise.reject(new Error('已取消'));
    return;
  }
  if (completed) {
    await updateRow(account.fakeid);
    syncingRowId.value = null;
    isSyncing.value = false;
    promise.resolve(account);
    return;
  }

  const count = articles.filter(article => article.itemidx === 1).length;
  begin += count;

  // 加载可用的缓存
  const lastArticle = articles.at(-1);
  if (lastArticle && lastArticle.create_time < account.last_update_time!) {
    // 检查是否存在比 lastArticle 更早的缓存数据
    if (await hitCache(account.fakeid, lastArticle.create_time)) {
      const cachedArticles = await getArticleCache(account.fakeid, lastArticle.create_time);

      // 更新 begin 参数
      const count = cachedArticles.filter(article => article.itemidx === 1).length;
      begin += count;
      articles.push(...cachedArticles);
    }
  }
  if (articles.at(-1)!.create_time < syncToTimestamp) {
    // 已同步到配置的时间范围
    await updateRow(account.fakeid);
    syncingRowId.value = null;
    isSyncing.value = false;
    promise.resolve(account);
    return;
  }

  await updateRow(account.fakeid);
  if (loadMore) {
    timer.value = window.setTimeout(
      () => {
        if (isCanceled.value) {
          console.warn('已取消');
          isCanceled.value = false;
          promise.reject(new Error('已取消'));
          return;
        }
        _load(account, begin, true, promise);
      },
      ((preferences.value as unknown as Preferences).accountSyncSeconds || 5) * 1000
    );
  } else {
    syncingRowId.value = null;
    isSyncing.value = false;
    promise.resolve(account);
  }
}

// 同步指定公众号
async function loadAccountArticle(account: Info, loadMore = true) {
  return new Promise((resolve, reject) => {
    const promise: PromiseInstance = { resolve, reject };

    _load(account, 0, loadMore, promise)
      .then(async (result) => {
        // 同步完成后，自动上传到后端服务器
        try {
          // 同步文章数据
          const syncResult = await syncArticlesToBackend(account.fakeid, false);
          if (syncResult.success) {
            console.log(`[后端同步] ${account.nickname}: ${syncResult.message}`);
          } else {
            console.warn(`[后端同步] ${account.nickname}: ${syncResult.message}`);
          }
          
          // 同步公众号信息
          const infoCache = await getInfoCache(account.fakeid);
          if (infoCache) {
            await syncInfoToBackend(infoCache);
            console.log(`[后端同步] ${account.nickname}: 公众号信息已同步`);
          }
        } catch (error: any) {
          console.error(`[后端同步失败] ${account.nickname}:`, error);
          // 不影响主流程，只记录错误
        }
        resolve(result);
      })
      .catch(e => {
        syncingRowId.value = null;
        isSyncing.value = false;

        if (e.message === 'session expired') {
          modal.open(LoginModal);
        }
        reject(e);
      });
  });
}

// 同步所有公众号
async function loadSelectedAccountArticle() {
  if (!checkLogin()) return;

  isCanceled.value = false;

  try {
    const rows = getSelectedRows();
    
    if (rows.length === 0) {
      toast.error('提示', '请先选择需要同步的公众号');
      return;
    }

    // 检查是否有无效的公众号数据
    const invalidAccounts = rows.filter(acc => !acc.fakeid || !acc.fakeid.trim());
    if (invalidAccounts.length > 0) {
      const names = invalidAccounts.map(acc => acc.nickname || '未知').join('、');
      toast.error(
        '数据错误', 
        `以下公众号的数据不完整，请重新添加：${names}`
      );
      return;
    }
    
    // 逐个同步公众号（每个同步后会自动上传到后端）
    let successCount = 0;
    let failedAccounts: string[] = [];
    
    for (const account of rows) {
      try {
        await loadAccountArticle(account);
        successCount++;
      } catch (error: any) {
        console.error(`同步公众号 ${account.nickname} 失败:`, error);
        failedAccounts.push(account.nickname || account.fakeid);
      }
    }
    
    // 显示同步结果
    if (failedAccounts.length === 0) {
      toast.success('同步完成', `已成功同步 ${successCount} 个公众号并上传到服务器`);
    } else {
      toast.warning(
        '部分同步失败',
        `成功: ${successCount} 个，失败: ${failedAccounts.length} 个（${failedAccounts.join('、')}）`
      );
    }
  } catch (e: any) {
    const errorMsg = e.message || '未知错误';
    toast.error('同步失败', errorMsg);
  }
}

const isDeleting = ref(false);
const isSyncing = ref(false);
const syncingRowId = ref<string | null>(null);

let globalRowData: Info[] = [];

const filterParams: IDateFilterParams = {
  filterOptions: ['lessThan', 'greaterThan', 'inRange'],
  comparator: (filterLocalDateAtMidnight: Date, cellValue: Date) => {
    const t = filterLocalDateAtMidnight;
    if (cellValue < t) {
      return -1;
    } else if (cellValue === t) {
      return 0;
    } else {
      return 1;
    }
  },
};
const booleanColumnFilterParams = {
  suppressMiniFilter: true,
  values: [true, false],
  valueFormatter: (params: ValueFormatterParams) => (params.value ? '是' : '否'),
};

const columnDefs = ref<ColDef[]>([
  {
    colId: 'fakeid',
    headerName: 'fakeid',
    field: 'fakeid',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    minWidth: 200,
    cellClass: 'font-mono',
    initialHide: true,
  },
  {
    colId: 'round_head_img',
    headerName: '头像',
    field: 'round_head_img',
    sortable: false,
    filter: false,
    cellRenderer: (params: ICellRendererParams) => {
      return `<img alt="" src="${IMAGE_PROXY + params.value}" style="height: 30px; width: 30px; object-fit: cover; border: 1px solid #e5e7eb; border-radius: 100%;" />`;
    },
    cellClass: 'flex justify-center items-center',
    minWidth: 80,
  },
  {
    colId: 'nickname',
    headerName: '名称',
    field: 'nickname',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    filterParams: {
      filterOptions: ['contains', 'notContains'],
      maxNumConditions: 1,
    },
    tooltipField: 'nickname',
    minWidth: 200,
  },
  {
    colId: 'create_time',
    headerName: '添加时间',
    field: 'create_time',
    valueFormatter: p => (p.value ? formatTimeStamp(p.value) : ''),
    filter: 'agDateColumnFilter',
    filterParams: filterParams,
    filterValueGetter: (params: ValueGetterParams) => {
      return new Date(params.getValue('create_time') * 1000);
    },
    sort: 'desc',
    minWidth: 180,
    initialHide: true,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    colId: 'update_time',
    headerName: '最后同步时间',
    field: 'update_time',
    valueFormatter: p => (p.value ? formatTimeStamp(p.value) : ''),
    filter: 'agDateColumnFilter',
    filterParams: filterParams,
    filterValueGetter: (params: ValueGetterParams) => {
      return new Date(params.getValue('update_time') * 1000);
    },
    minWidth: 180,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    colId: 'total_count',
    headerName: '消息总数',
    field: 'total_count',
    cellDataType: 'number',
    cellRenderer: 'agAnimateShowChangeCellRenderer',
    filter: 'agNumberColumnFilter',
    cellClass: 'flex justify-center items-center font-mono',
    minWidth: 150,
  },
  {
    colId: 'count',
    headerName: '已加载消息数',
    field: 'count',
    cellDataType: 'number',
    cellRenderer: 'agAnimateShowChangeCellRenderer',
    filter: 'agNumberColumnFilter',
    cellClass: 'flex justify-center items-center font-mono',
    minWidth: 150,
  },
  {
    colId: 'articles',
    headerName: '已加载文章数',
    field: 'articles',
    cellDataType: 'number',
    cellRenderer: 'agAnimateShowChangeCellRenderer',
    filter: 'agNumberColumnFilter',
    cellClass: 'flex justify-center items-center font-mono',
    minWidth: 150,
    initialHide: true,
  },
  {
    colId: 'load_percent',
    headerName: '加载进度',
    valueGetter: params => params.data.count / params.data.total_count,
    cellDataType: 'number',
    cellRenderer: GridLoadProgress,
    filter: 'agNumberColumnFilter',
    minWidth: 200,
  },
  {
    colId: 'completed',
    headerName: '已加载完成',
    field: 'completed',
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: booleanColumnFilterParams,
    cellClass: 'flex justify-center items-center',
    headerClass: 'justify-center',
    minWidth: 150,
  },
  {
    colId: 'credential',
    headerName: 'Credential',
    field: 'fakeid',
    sortable: false,
    filter: false,
    cellRenderer: GridCredentialStatus,
    cellClass: 'flex justify-center items-center',
    headerClass: 'justify-center',
    minWidth: 150,
    headerTooltip: '用于获取阅读量、留言等数据的凭证状态',
  },
  {
    colId: 'action',
    headerName: '操作',
    field: 'fakeid',
    sortable: false,
    filter: false,
    cellRenderer: GridAccountActions,
    cellRendererParams: {
      onSync: (params: ICellRendererParams) => {
        // if (!checkLogin()) return;

        // 验证公众号数据完整性
        if (!params.data.fakeid || !params.data.fakeid.trim()) {
          toast.error(
            '数据错误', 
            `公众号【${params.data.nickname || '未知'}】的数据不完整，请删除后重新添加`
          );
          return;
        }

        isCanceled.value = false;
        loadAccountArticle(params.data)
          .then(() => {
            toast.success('同步完成', `公众号【${params.data.nickname}】的文章已同步完毕`);
          })
          .catch(e => {
            const errorMsg = e.message || '未知错误';
            // 针对 200002 错误提供更友好的提示
            if (errorMsg.includes('200002') || errorMsg.includes('invalid args') || errorMsg.includes('无效')) {
              toast.error(
                '同步失败', 
                `公众号【${params.data.nickname}】的数据可能已损坏，建议删除后重新添加。错误: ${errorMsg}`
              );
            } else {
              toast.error('同步失败', errorMsg);
            }
          });
      },
      onStop: (params: ICellRendererParams) => {
        isCanceled.value = true;
        if (timer.value) {
          window.clearTimeout(timer.value);
          timer.value = null;
        }

        syncingRowId.value = null;
        isSyncing.value = false;
      },
      isDeleting: isDeleting,
      isSyncing: isSyncing,
      syncingRowId: syncingRowId,
    },
    cellClass: 'flex justify-center items-center',
    maxWidth: 100,
    pinned: 'right',
  },
]);

const gridOptions: GridOptions = {
  localeText: AG_GRID_LOCALE_CN,
  rowNumbers: true,
  loadingOverlayComponent: GridLoading,
  noRowsOverlayComponent: GridNoRows,
  getRowId: (params: GetRowIdParams) => String(params.data.fakeid),
  sideBar: {
    toolPanels: [
      {
        id: 'columns',
        labelDefault: 'Columns',
        labelKey: 'columns',
        iconKey: 'columns',
        toolPanel: 'agColumnsToolPanel',
        minWidth: 225,
        maxWidth: 225,
        width: 225,
        toolPanelParams: {
          suppressRowGroups: true,
          suppressValues: true,
          suppressPivotMode: true,
        },
      },
    ],
    position: 'right',
  },
  enableCellTextSelection: true,
  tooltipShowDelay: 0,
  tooltipShowMode: 'whenTruncated',
  suppressContextMenu: true,
  defaultColDef: {
    sortable: true,
    filter: true,
    flex: 1,
    enableCellChangeFlash: false,
    suppressHeaderMenuButton: true,
    suppressHeaderContextMenu: true,
    enableValue: true,
    enableRowGroup: true,
  },
  selectionColumnDef: {
    sortable: true,
    width: 80,
    pinned: 'left',
  },
  rowSelection: {
    mode: 'multiRow',
    headerCheckbox: true,
    selectAll: 'filtered',
  },
  theme: themeQuartz.withParams({
    borderColor: '#e5e7eb',
    rowBorder: true,
    columnBorder: true,
    headerFontWeight: 700,
    oddRowBackgroundColor: '#00005506',
    sidePanelBorder: true,
  }),
};

const gridApi = shallowRef<GridApi | null>(null);
async function onGridReady(params: GridReadyEvent) {
  gridApi.value = params.api;

  restoreColumnState();
  
  // 检查本地是否有数据，如果没有则尝试从后端恢复
  await checkAndRestoreData();
  
  refresh();
}

// 数据恢复状态
const isRestoring = ref(false);
const showRestorePrompt = ref(false);
const backendDataInfo = ref<{ accountCount: number; totalArticles: number } | null>(null);

/**
 * 检查本地数据并提示恢复
 */
async function checkAndRestoreData() {
  try {
    // 检查本地是否有数据
    const hasLocal = await hasLocalData();
    
    if (!hasLocal) {
      // 本地没有数据，检查后端是否有数据
      const backendInfo = await hasBackendData();
      
      if (backendInfo.hasData) {
        // 后端有数据，显示恢复提示
        backendDataInfo.value = {
          accountCount: backendInfo.accountCount,
          totalArticles: backendInfo.totalArticles,
        };
        showRestorePrompt.value = true;
      }
    }
  } catch (error) {
    console.error('检查数据状态失败:', error);
  }
}

/**
 * 从后端恢复数据
 */
async function restoreFromBackend() {
  isRestoring.value = true;
  showRestorePrompt.value = false;
  
  try {
    const result = await restoreDataFromBackend();
    
    if (result.success) {
      toast.success('数据恢复成功', result.message);
      await refresh();
    } else {
      toast.error('数据恢复失败', result.message);
    }
  } catch (error: any) {
    console.error('恢复数据失败:', error);
    toast.error('数据恢复失败', error.message || '未知错误');
  } finally {
    isRestoring.value = false;
  }
}

/**
 * 手动触发数据恢复（从服务器恢复）
 */
async function manualRestoreFromBackend() {
  isRestoring.value = true;
  
  try {
    const result = await restoreDataFromBackend();
    
    if (result.success) {
      toast.success('数据恢复成功', result.message);
      await refresh();
    } else {
      toast.warning('恢复提示', result.message || '后端没有可恢复的数据');
    }
  } catch (error: any) {
    console.error('恢复数据失败:', error);
    toast.error('数据恢复失败', error.message || '未知错误');
  } finally {
    isRestoring.value = false;
  }
}

function onColumnStateChange() {
  if (gridApi.value) {
    saveColumnState();
  }
}
function saveColumnState() {
  const state = gridApi.value?.getColumnState();
  localStorage.setItem('agGridColumnState-account', JSON.stringify(state));
}

function restoreColumnState() {
  const stateStr = localStorage.getItem('agGridColumnState-account');
  if (stateStr) {
    const state = JSON.parse(stateStr);
    gridApi.value?.applyColumnState({
      state,
      applyOrder: true,
    });
  }
}

async function refresh() {
  globalRowData = await getAllInfo();
  gridApi.value?.setGridOption('rowData', globalRowData);
}

async function updateRow(fakeid: string) {
  const rowNode = gridApi.value?.getRowNode(fakeid);
  if (rowNode) {
    const info = await getInfoCache(fakeid);
    rowNode.updateData(info);
  }
}

// 当前是否有选中的行
const hasSelectedRows = ref(false);
function onSelectionChanged(evt: SelectionChangedEvent) {
  hasSelectedRows.value = (evt.selectedNodes?.map(node => node.data) || []).length > 0;
}
function getSelectedRows() {
  const rows: Info[] = [];
  gridApi.value?.forEachNodeAfterFilterAndSort(node => {
    if (node.isSelected()) {
      rows.push(node.data);
    }
  });
  return rows;
}

// 删除所选的公众号数据
function deleteSelectedAccounts() {
  const rows = getSelectedRows();
  const ids = rows.map(info => info.fakeid);
  modal.open(ConfirmModal, {
    title: '确定要删除所选公众号的数据吗？',
    description: '删除之后，该公众号的所有数据(包括已下载的文章和留言等)都将被清空。',
    async onConfirm() {
      try {
        isDeleting.value = true;
        await deleteAccountData(ids);
        // 通知 Credentials 面板这些公众号已被移除
        ids.forEach(fakeid => accountEventBus.emit('account-removed', { fakeid: fakeid }));
      } finally {
        isDeleting.value = false;
        await refresh();
      }
    },
  });
}

// 导入公众号
const fileRef = ref<HTMLInputElement | null>(null);
const importBtnLoading = ref(false);
function importAccount() {
  fileRef.value!.click();
}
async function handleFileChange(evt: Event) {
  const files = (evt.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    const file = files[0];

    try {
      importBtnLoading.value = true;

      // 使用 FileReader 读取文件内容
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          if (typeof e.target?.result === 'string') {
            resolve(e.target.result);
          } else {
            reject(new Error('读取文件失败'));
          }
        };
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsText(file, 'UTF-8');
      });

      // 解析 JSON
      const jsonData = JSON.parse(fileContent);
      if (jsonData.usefor !== 'wechat-article-exporter') {
        // 文件格式不正确
        toast.error('导入公众号失败', '导入文件格式不正确，请选择该网站导出的文件进行导入。');
        return;
      }
      const infos = jsonData.accounts;
      if (!infos || infos.length <= 0) {
        // 文件格式不正确
        toast.error('导入公众号失败', '导入文件格式不正确，请选择该网站导出的文件进行导入。');
        return;
      }

      await importInfos(infos);
      await refresh();
    } catch (error) {
      console.error('导入公众号时 JSON 解析失败:', error);
      toast.error('导入公众号', (error as Error).message);
    } finally {
      importBtnLoading.value = false;
    }
  }
}

// 导出公众号
const exportBtnLoading = ref(false);
function exportAccount() {
  exportBtnLoading.value = true;
  try {
    const rows = getSelectedRows();
    const data: AccountManifest = {
      version: '1.0',
      usefor: 'wechat-article-exporter',
      accounts: rows,
    };
    exportAccountJsonFile(data, '公众号');
    toast.success('导出公众号', `成功导出了 ${rows.length} 个公众号`);
  } finally {
    exportBtnLoading.value = false;
  }
}
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">公众号管理</h1>
    </Teleport>

    <div class="flex flex-col h-full divide-y divide-gray-200">
      <!-- 顶部操作区 -->
      <header class="flex items-center gap-3 px-3 py-3">
        <UButton icon="i-lucide:user-plus" color="blue" :disabled="isDeleting || addBtnLoading" @click="addAccount">
          {{ addBtnLoading ? '添加中...' : '添加' }}
        </UButton>
        <UButton icon="i-lucide:arrow-down-to-line" color="blue" :loading="importBtnLoading" @click="importAccount">
          批量导入
          <input ref="fileRef" type="file" accept=".json" class="hidden" @change="handleFileChange" />
        </UButton>
        <UButton
          icon="i-lucide:arrow-up-from-line"
          color="blue"
          :loading="exportBtnLoading"
          :disabled="!hasSelectedRows"
          @click="exportAccount"
        >
          批量导出
        </UButton>
        <UButton
          color="rose"
          icon="i-lucide:user-minus"
          class="disabled:opacity-35"
          :loading="isDeleting"
          :disabled="!hasSelectedRows"
          @click="deleteSelectedAccounts"
          >删除</UButton
        >
        <UButton
          color="black"
          icon="i-heroicons:arrow-path-rounded-square-20-solid"
          class="disabled:opacity-35"
          :loading="isSyncing"
          :disabled="isDeleting || !hasSelectedRows"
          @click="loadSelectedAccountArticle"
          >同步</UButton
        >
        <!-- 从服务器恢复数据 -->
        <UButton
          color="gray"
          icon="i-lucide:cloud-download"
          variant="outline"
          :loading="isRestoring"
          @click="manualRestoreFromBackend"
          >从服务器恢复</UButton
        >
        <!-- 开发模式：数据验证工具 -->
        <UButton
          v-if="isDev"
          color="gray"
          icon="i-heroicons:shield-check-20-solid"
          variant="outline"
          @click="validateAccountData"
          >验证数据</UButton
        >
      </header>

      <!-- 数据表格 -->
      <ag-grid-vue
        style="width: 100%; height: 100%"
        :rowData="globalRowData"
        :columnDefs="columnDefs"
        :gridOptions="gridOptions"
        @grid-ready="onGridReady"
        @selection-changed="onSelectionChanged"
        @column-moved="onColumnStateChange"
        @column-visible="onColumnStateChange"
        @column-pinned="onColumnStateChange"
        @column-resized="onColumnStateChange"
      ></ag-grid-vue>
    </div>

    <!-- 添加公众号弹框 -->
    <GlobalSearchAccountDialog ref="searchAccountDialogRef" @select:account="onSelectAccount" />

    <!-- 数据恢复提示弹框 -->
    <UModal v-model:open="showRestorePrompt">
      <template #content>
        <div class="p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <UIcon name="i-lucide:cloud-download" class="text-blue-600 text-xl" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900">发现云端数据</h3>
          </div>
          
          <p class="text-gray-600 mb-4">
            检测到本地没有公众号数据，但服务器上有您之前采集的数据：
          </p>
          
          <div class="bg-gray-50 rounded-lg p-4 mb-6">
            <div class="flex justify-between items-center mb-2">
              <span class="text-gray-500">公众号数量</span>
              <span class="font-semibold text-gray-900">{{ backendDataInfo?.accountCount || 0 }} 个</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-500">文章数量</span>
              <span class="font-semibold text-gray-900">{{ backendDataInfo?.totalArticles || 0 }} 篇</span>
            </div>
          </div>
          
          <p class="text-sm text-gray-500 mb-6">
            是否从服务器恢复这些数据到本地浏览器？
          </p>
          
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="showRestorePrompt = false"
            >
              暂不恢复
            </UButton>
            <UButton
              color="blue"
              :loading="isRestoring"
              @click="restoreFromBackend"
            >
              立即恢复
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
