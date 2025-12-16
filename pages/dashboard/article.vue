<script setup lang="ts">
import { AG_GRID_LOCALE_CN } from '@ag-grid-community/locale';
import type { ColDef, GridApi, GridReadyEvent, IDateFilterParams, ValueGetterParams } from 'ag-grid-community';
import {
  type FilterChangedEvent,
  type GetRowIdParams,
  type GridOptions,
  type ICellRendererParams,
  themeQuartz,
  type ValueFormatterParams,
} from 'ag-grid-community';
import { AgGridVue } from 'ag-grid-vue3';
import type { PreviewArticle } from '#components';
import { readBlob } from '#shared/utils';
import {
  durationToSeconds,
  formatElapsedTime,
  formatItemShowType,
  formatTimeStamp,
  sleep,
} from '#shared/utils/helpers';
import { normalizeHtml } from '#shared/utils/html';
import GridActions from '~/components/grid/Actions.vue';
import GridAlbum from '~/components/grid/Album.vue';
import GridCoverTooltip from '~/components/grid/CoverTooltip.vue';
import GridLinkWithIcon from '~/components/grid/LinkWithIcon.vue';
import GridLoading from '~/components/grid/Loading.vue';
import GridNoRows from '~/components/grid/NoRows.vue';
import GridStatusBar from '~/components/grid/StatusBar.vue';
import GridTitleWithCopy from '~/components/grid/TitleWithCopy.vue';
import AccountSelectorForArticle from '~/components/selector/AccountSelectorForArticle.vue';
import AccountMultiSelectorForArticle from '~/components/selector/AccountMultiSelectorForArticle.vue';
import { isDev } from '~/config';
import { articleDeleted, getArticleCache } from '~/store/v2/article';
import { batchCheckCommentCache, getCommentCache } from '~/store/v2/comment';
import { batchCheckHtmlCache, getHtmlCache } from '~/store/v2/html';
import { type Info } from '~/store/v2/info';
import { batchGetMetadataCache, getMetadataCache, type Metadata } from '~/store/v2/metadata';
import type { Preferences } from '~/types/preferences';
import type { AppMsgEx } from '~/types/types';
import { Downloader } from '~/utils/download/Downloader';
import { Exporter } from '~/utils/download/Exporter';
import type { ArticleMetadata, DownloaderStatus, ExporterStatus } from '~/utils/download/types';
import { batchGetArticlesFromBackend } from '~/composables/useBackendSync';

let globalRowData: Article[] = [];

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
    headerName: 'ID',
    field: 'aid',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    minWidth: 150,
    initialHide: true,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '链接',
    field: 'link',
    cellDataType: 'text',
    sortable: false,
    filter: false,
    minWidth: 200,
    cellRenderer: GridLinkWithIcon,
    cellClass: 'flex items-center',
  },
  {
    headerName: '标题',
    field: 'title',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    filterParams: {
      filterOptions: ['contains', 'notContains'],
      maxNumConditions: 1,
    },
    tooltipField: 'title',
    minWidth: 200,
    cellRenderer: GridTitleWithCopy,
  },
  {
    headerName: '封面',
    field: 'cover',
    sortable: false,
    filter: false,
    cellRenderer: (params: ICellRendererParams) => {
      return `<img alt="" src="${params.value}" style="height: 40px; width: 40px; object-fit: cover;" />`;
    },
    tooltipField: 'cover',
    tooltipComponent: GridCoverTooltip,
    minWidth: 80,
    hide: true,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '摘要',
    field: 'digest',
    sortable: false,
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    filterParams: {
      filterOptions: ['contains', 'notContains'],
      maxNumConditions: 1,
    },
    tooltipField: 'digest',
    minWidth: 200,
    initialHide: true,
  },
  {
    headerName: '创建时间',
    field: 'create_time',
    valueFormatter: p => formatTimeStamp(p.value),
    filter: 'agDateColumnFilter',
    filterParams: filterParams,
    filterValueGetter: (params: ValueGetterParams) => {
      return new Date(params.getValue('create_time') * 1000);
    },
    minWidth: 180,
    initialHide: true,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '发布时间',
    field: 'update_time',
    minWidth: 180,
    valueFormatter: p => formatTimeStamp(p.value),
    filter: 'agDateColumnFilter',
    filterParams: filterParams,
    filterValueGetter: (params: ValueGetterParams) => {
      return new Date(params.getValue('update_time') * 1000);
    },
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '是否已删除',
    field: 'is_deleted',
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: booleanColumnFilterParams,
    minWidth: 150,
    initialHide: true,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '内容已下载',
    field: 'contentDownload',
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: booleanColumnFilterParams,
    minWidth: 150,
    cellClass: 'flex justify-center items-center',
  },
  {
    field: 'commentDownload',
    headerName: '留言已下载',
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: booleanColumnFilterParams,
    minWidth: 150,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '阅读',
    field: 'readNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '点赞',
    field: 'oldLikeNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '分享',
    field: 'shareNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '喜欢',
    field: 'likeNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '留言',
    field: 'commentNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    field: 'account_name',
    headerName: '公众号',
    cellDataType: 'text',
    filter: 'agSetColumnFilter',
    minWidth: 150,
    cellClass: 'flex justify-center items-center',
  },
  {
    field: 'author_name',
    headerName: '作者',
    cellDataType: 'text',
    filter: 'agSetColumnFilter',
    minWidth: 150,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '是否原创',
    valueGetter: p => p.data && p.data.copyright_stat === 1 && p.data.copyright_type === 1,
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: booleanColumnFilterParams,
    minWidth: 150,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '文章类型',
    field: 'item_show_type',
    valueFormatter: p => formatItemShowType(p.value),
    filter: 'agSetColumnFilter',
    filterParams: {
      valueFormatter: (p: ValueFormatterParams) => formatItemShowType(p.value),
    },
    minWidth: 150,
    initialHide: true,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '媒体时长',
    field: 'media_duration',
    valueGetter: params => durationToSeconds(params.data.media_duration), // 用于排序和过滤
    valueFormatter: params => params.data.media_duration,
    filter: 'agNumberColumnFilter',
    comparator: (a, b) => a - b,
    minWidth: 150,
    initialHide: true,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '所属合集',
    field: 'appmsg_album_infos',
    cellRenderer: GridAlbum,
    sortable: false,
    filter: false,
    valueFormatter: p => p.value.map((album: any) => album.title).join(','),
    minWidth: 150,
    initialHide: true,
  },
  {
    headerName: '操作',
    field: 'link',
    sortable: false,
    filter: false,
    cellRenderer: GridActions,
    cellRendererParams: {
      onPreview: (params: ICellRendererParams) => {
        preview(params.data);
      },
      onGotoLink: (params: ICellRendererParams) => {
        window.open(params.value, '_blank');
      },
    },
    maxWidth: 100,
    pinned: 'right',
    cellClass: 'flex justify-center items-center',
  },
]);

const gridOptions: GridOptions = {
  localeText: AG_GRID_LOCALE_CN,
  rowNumbers: true,
  loadingOverlayComponent: GridLoading,
  noRowsOverlayComponent: GridNoRows,
  getRowId: (params: GetRowIdParams) => String(params.data.aid),
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
      {
        id: 'filters',
        labelDefault: 'Filters',
        labelKey: 'filters',
        iconKey: 'filter',
        toolPanel: 'agFiltersToolPanel',
        minWidth: 180,
        maxWidth: 400,
        width: 250,
      },
    ],
    position: 'right',
  },
  statusBar: {
    statusPanels: [
      {
        statusPanel: GridStatusBar,
        align: 'left',
      },
    ],
  },
  enableCellTextSelection: true,
  tooltipShowDelay: 0,
  tooltipShowMode: 'whenTruncated',
  suppressContextMenu: true,
  defaultColDef: {
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

const loading = ref(false);

const gridApi = shallowRef<GridApi | null>(null);
function onGridReady(params: GridReadyEvent) {
  gridApi.value = params.api;

  restoreColumnState();
}

function onColumnStateChange() {
  if (gridApi.value) {
    saveColumnState();
  }
}
function saveColumnState() {
  const state = gridApi.value?.getColumnState();
  localStorage.setItem('agGridColumnState', JSON.stringify(state));
}

function restoreColumnState() {
  const stateStr = localStorage.getItem('agGridColumnState');
  if (stateStr) {
    const state = JSON.parse(stateStr);
    gridApi.value?.applyColumnState({
      state,
      applyOrder: true,
    });
  }
}

function onFilterChanged(event: FilterChangedEvent) {
  event.api.deselectAll();
}

const preferences = usePreferences();
const hideDeleted = computed(() => (preferences.value as unknown as Preferences).hideDeleted);

const previewArticleRef = ref<typeof PreviewArticle | null>(null);

function preview(article: Article) {
  previewArticleRef.value!.open(article);
}

// 当前页面的数据模型
interface Article extends AppMsgEx, Partial<ArticleMetadata> {
  /**
   * 公众号 fakeid (即 biz)
   */
  fakeid: string;

  /**
   * 公众号名称
   */
  account_name?: string;

  /**
   * 是否被选中
   */
  // checked: boolean;

  /**
   * 是否显示
   */
  // display: boolean;
  /**
   * 文章内容是否已下载
   */
  contentDownload: boolean;

  /**
   * 留言内容是否已下载
   */
  commentDownload: boolean;
}

useHead({
  title: '文章链接 | 微信公众号文章导出',
});

// 筛选条件
const selectedAccounts = ref<Info[]>([]);
const timeRange = ref<'today' | 'week' | 'month' | 'custom' | 'all'>('all');
const customStartDate = ref<Date | null>(null);
const customEndDate = ref<Date | null>(null);
const titleSearch = ref('');
const searchMode = ref<'and' | 'or'>('and');

// 时间范围选项
const timeRangeOptions = [
  { label: '全部时间', value: 'all' },
  { label: '今天', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '自定义时间', value: 'custom' },
];

// 搜索模式选项
const searchModeOptions = [
  { label: 'AND (所有关键词)', value: 'and' },
  { label: 'OR (任一关键词)', value: 'or' },
];

// 计算显示的时间范围描述
const timeRangeDescription = computed(() => {
  const filter = getTimeRangeTimestamps();
  if (!filter) {
    return '全部时间';
  }
  
  const startDate = new Date(filter.start * 1000);
  const endDate = new Date(filter.end * 1000);
  
  const formatDate = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  
  const formatTime = (date: Date) => {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };
  
  if (timeRange.value === 'today') {
    return `今天 (${formatDate(startDate)} 00:00 至 ${formatTime(endDate)})`;
  } else if (timeRange.value === 'week') {
    return `本周 (${formatDate(startDate)} 至 ${formatDate(endDate)} ${formatTime(endDate)})`;
  } else if (timeRange.value === 'month') {
    return `本月 (${formatDate(startDate)} 至 ${formatDate(endDate)} ${formatTime(endDate)})`;
  } else if (timeRange.value === 'custom') {
    return `自定义 (${formatDate(startDate)} 至 ${formatDate(endDate)})`;
  }
  
  return '';
});

function getSelectedRows() {
  return gridApi.value?.getSelectedRows() || [];
}

// 获取时间范围的时间戳范围
function getTimeRangeTimestamps(): { start: number; end: number } | null {
  const now = new Date();
  
  // 今天0点0分0秒
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  
  // 当前时间
  const nowTimestamp = now.getTime() / 1000;

  switch (timeRange.value) {
    case 'all':
      return null; // 不过滤时间
    case 'today':
      // 今天：从今天0点到现在
      return { start: todayStart.getTime() / 1000, end: nowTimestamp };
    case 'week': {
      // 本周：从本周一0点到现在
      const weekStart = new Date(now);
      const day = now.getDay(); // 0(周日) 到 6(周六)
      const daysToMonday = (day + 6) % 7; // 距离本周一的天数（周一为0，周日为6）
      weekStart.setDate(now.getDate() - daysToMonday);
      weekStart.setHours(0, 0, 0, 0);
      return { start: weekStart.getTime() / 1000, end: nowTimestamp };
    }
    case 'month': {
      // 本月：从本月1日0点到现在
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start: monthStart.getTime() / 1000, end: nowTimestamp };
    }
    case 'custom':
      if (customStartDate.value && customEndDate.value) {
        // 自定义时间：从开始日期0点到结束日期23:59:59
        const start = new Date(customStartDate.value);
        start.setHours(0, 0, 0, 0);
        const end = new Date(customEndDate.value);
        end.setHours(23, 59, 59, 999);
        return { start: start.getTime() / 1000, end: end.getTime() / 1000 };
      }
      return null;
    default:
      return null;
  }
}

// 根据标题搜索过滤文章
function filterByTitle(article: Article): boolean {
  if (!titleSearch.value.trim()) {
    return true;
  }

  const keywords = titleSearch.value
    .trim()
    .split(/\s+/)
    .map(k => k.toLowerCase());
  const title = article.title.toLowerCase();

  if (searchMode.value === 'and') {
    // AND 模式：所有关键词都要匹配
    return keywords.every(keyword => title.includes(keyword));
  } else {
    // OR 模式：任一关键词匹配即可
    return keywords.some(keyword => title.includes(keyword));
  }
}

// 刷新数据
async function refreshTableData() {
  if (!selectedAccounts.value || selectedAccounts.value.length === 0) {
    showToast('提示', '请先选择公众号');
    return;
  }

  loading.value = true;
  const timeRangeFilter = getTimeRangeTimestamps();

  // 调试信息：输出时间范围
  if (timeRangeFilter) {
    console.log('时间范围筛选:', {
      start: new Date(timeRangeFilter.start * 1000).toLocaleString('zh-CN'),
      end: new Date(timeRangeFilter.end * 1000).toLocaleString('zh-CN'),
      startTimestamp: timeRangeFilter.start,
      endTimestamp: timeRangeFilter.end,
    });
  } else {
    console.log('时间范围筛选: 全部时间');
  }

  try {
    const startTime = performance.now();
    
    // 优先从后端服务器批量获取数据
    const fakeids = selectedAccounts.value.map(acc => acc.fakeid);
    console.log('[数据加载] 尝试从后端服务器获取数据...');
    
    const backendArticlesMap = await batchGetArticlesFromBackend(fakeids);
    console.log(`[数据加载] 从后端获取了 ${backendArticlesMap.size} 个公众号的数据`);

    // 第一步：收集所有文章数据（只做时间过滤和标题过滤）
    const allArticlesWithAccount: { article: typeof backendArticlesMap extends Map<string, infer T> ? T[number] : never; account: Info }[] = [];
    
    for (const account of selectedAccounts.value) {
      let data = backendArticlesMap.get(account.fakeid);
      
      // 如果后端没有数据，回退到本地 IndexedDB
      if (!data || data.length === 0) {
        console.log(`[数据加载] 公众号 ${account.nickname} 后端无数据，从本地加载...`);
        data = await getArticleCache(account.fakeid, Date.now());
      }

      // 时间过滤和标题过滤
      for (const article of data) {
        if (timeRangeFilter) {
          if (article.update_time < timeRangeFilter.start || article.update_time > timeRangeFilter.end) {
            continue;
          }
        }
        
        // 先做标题过滤（在批量查询缓存之前过滤掉不需要的文章）
        const tempArticle = { ...article, title: article.title } as Article;
        if (filterByTitle(tempArticle)) {
          allArticlesWithAccount.push({ article, account });
        }
      }
    }

    console.log(`[数据加载] 过滤后共 ${allArticlesWithAccount.length} 篇文章，开始批量查询缓存状态...`);

    // 第二步：批量查询缓存状态（性能优化的关键）
    const allUrls = allArticlesWithAccount.map(item => item.article.link);
    
    // 并行执行三个批量查询
    const [htmlCacheSet, commentCacheSet, metadataMap] = await Promise.all([
      batchCheckHtmlCache(allUrls),
      batchCheckCommentCache(allUrls),
      batchGetMetadataCache(allUrls),
    ]);

    console.log(`[数据加载] 缓存查询完成: HTML=${htmlCacheSet.size}, Comment=${commentCacheSet.size}, Metadata=${metadataMap.size}`);

    // 第三步：组装最终数据
    const articles: Article[] = allArticlesWithAccount.map(({ article, account }) => {
      const contentDownload = htmlCacheSet.has(article.link);
      const commentDownload = commentCacheSet.has(article.link);
      const metadata = metadataMap.get(article.link);
      
      if (metadata) {
        return {
          ...metadata,
          ...article,
          fakeid: account.fakeid,
          contentDownload,
          commentDownload,
          account_name: account.nickname,
        };
      } else {
        return {
          ...article,
          fakeid: account.fakeid,
          contentDownload,
          commentDownload,
          account_name: account.nickname,
        };
      }
    });

    // 过滤已删除的文章（如果设置了隐藏）
    globalRowData = articles.filter(article => (hideDeleted.value ? !article.is_deleted : true));
    // 按发布时间倒序排列
    globalRowData.sort((a, b) => b.update_time - a.update_time);
    gridApi.value?.setGridOption('rowData', globalRowData);
    
    const endTime = performance.now();
    const loadTime = ((endTime - startTime) / 1000).toFixed(2);
    
    // 显示加载结果
    console.log(`[数据加载完成] 共 ${globalRowData.length} 篇文章，耗时 ${loadTime}s`);
    
    // 检查数据来源并给出友好提示
    const fromBackend = backendArticlesMap.size > 0;
    toast.add({
      color: 'green',
      title: fromBackend ? '数据加载完成（来自服务器）' : '数据加载完成（来自本地）',
      description: `找到 ${globalRowData.length} 篇符合条件的文章，耗时 ${loadTime}s`,
      icon: 'i-heroicons-check-circle',
    });
  } catch (error) {
    console.error('[数据加载失败]', error);
    showToast('错误', '加载数据失败');
  } finally {
    loading.value = false;
  }
}

// 已弃用的旧函数，保留兼容性
async function switchTableData(fakeid: string) {
  selectedAccounts.value = selectedAccounts.value.filter(acc => acc.fakeid === fakeid);
  if (selectedAccounts.value.length === 0) {
    const account = await import('~/store/v2/info').then(m => m.getInfoCache(fakeid));
    if (account) {
      selectedAccounts.value = [account];
    }
  }
  await refreshTableData();
}

const toast = useToast();

function showToast(title: string, description: string) {
  toast.add({
    color: 'rose',
    title: title,
    description: description,
    icon: 'i-octicon:bell-24',
  });
}

function updateRow(article: Article) {
  const rowNode = gridApi.value?.getRowNode(article.aid);
  if (rowNode) {
    rowNode.updateData(article);
  }
}

const downloadBtnLoading = ref(false);
const progress_1 = ref(0);
const progress_2 = ref(0);
let currentDownloader: Downloader | null = null;

// 停止当前下载任务
function stopDownload() {
  if (currentDownloader) {
    currentDownloader.stop();
    toast.add({
      color: 'orange',
      title: '正在停止任务',
      description: '等待当前进行中的请求完成...',
      icon: 'i-heroicons-x-circle',
    });
  }
}

// 抓取文章HTML
async function downloadArticleHTML() {
  const selectedRows = getSelectedRows();
  if (selectedRows.length === 0) {
    showToast('提示', '请先选择文章');
    return;
  }

  const urls: string[] = selectedRows.map(article => article.link);

  const manager = new Downloader(urls);
  currentDownloader = manager;
  
  manager.on('download:progress', (url: string, success: boolean, status: DownloaderStatus) => {
    console.debug(
      `进度: (进行中:${status.pending.length} / 已完成:${status.completed.length} / 已失败:${status.failed.length} / 已删除:${status.deleted.length})`
    );
    progress_1.value = status.completed.length;
    if (success) {
      const article = globalRowData.find(article => article.link === url);
      if (article) {
        article.contentDownload = true;
        updateRow(article);
      } else {
        console.warn(`${url} not found in table data when update contentDownload`);
      }
    }
  });
  manager.on('download:deleted', (url: string) => {
    const article = globalRowData.find(article => article.link === url);
    if (article) {
      article.is_deleted = true;
      articleDeleted(url);
      updateRow(article);
    }
  });
  manager.on('download:checking', (url: string) => {
    const article = globalRowData.find(article => article.link === url);
    if (article) {
      article.is_deleted = true;
      articleDeleted(url);
      updateRow(article);
    }
  });
  manager.on('download:begin', () => {
    console.debug('开始抓取【文章内容】...');
    progress_1.value = 0;
    progress_2.value = urls.length;
  });
  manager.on('download:stop', () => {
    console.debug('任务已停止');
    toast.add({
      color: 'amber',
      title: '【文章内容】抓取已停止',
      description: `已完成:${progress_1.value}/${progress_2.value}`,
      icon: 'i-heroicons-exclamation-triangle',
    });
  });
  manager.on('download:finish', (seconds: number, status: DownloaderStatus) => {
    console.debug('耗时:', formatElapsedTime(seconds));
    toast.add({
      id: 'update_downloaded',
      color: 'purple',
      title: '【文章内容】抓取完成',
      description: `本次抓取耗时 ${formatElapsedTime(seconds)}, 成功:${status.completed.length}, 失败:${status.failed.length}, 检测到已被删除:${status.deleted.length}`,
      icon: 'i-octicon-desktop-download-24',
    });
  });

  try {
    downloadBtnLoading.value = true;
    await manager.startDownload('html');
  } catch (error) {
    console.error('【文章内容】抓取失败:', error);
    alert((error as Error).message);
  } finally {
    downloadBtnLoading.value = false;
    currentDownloader = null;
  }
}

// 抓取文章阅读量、点赞量等元数据
async function downloadArticleMetadata() {
  const selectedRows = getSelectedRows();
  if (selectedRows.length === 0) {
    showToast('提示', '请先选择文章');
    return;
  }

  const urls: string[] = selectedRows.map(article => article.link);

  const manager = new Downloader(urls);
  currentDownloader = manager;
  
  manager.on('download:progress', (url: string, success: boolean, status: DownloaderStatus) => {
    console.debug(
      `进度: (进行中:${status.pending.length} / 已完成:${status.completed.length} / 已失败:${status.failed.length} / 已删除:${status.deleted.length})`
    );
    progress_1.value = status.completed.length;
  });
  manager.on('download:metadata', (url: string, metadata: Metadata) => {
    const article = globalRowData.find(article => article.link === url);
    if (article) {
      article.readNum = metadata.readNum;
      article.oldLikeNum = metadata.oldLikeNum;
      article.shareNum = metadata.shareNum;
      article.likeNum = metadata.likeNum;
      article.commentNum = metadata.commentNum;
      updateRow(article);
    } else {
      console.warn(`${url} not found in table data when update metadata`);
    }
  });
  manager.on('download:deleted', (url: string) => {
    const article = globalRowData.find(article => article.link === url);
    if (article) {
      article.is_deleted = true;
      articleDeleted(url);
      updateRow(article);
    }
  });
  manager.on('download:checking', (url: string) => {
    const article = globalRowData.find(article => article.link === url);
    if (article) {
      article.is_deleted = true;
      articleDeleted(url);
      updateRow(article);
    }
  });
  manager.on('download:begin', () => {
    console.debug('开始抓取【阅读量】...');
    progress_1.value = 0;
    progress_2.value = urls.length;
  });
  manager.on('download:stop', () => {
    console.debug('任务已停止');
    toast.add({
      color: 'amber',
      title: '【阅读量】抓取已停止',
      description: `已完成:${progress_1.value}/${progress_2.value}`,
      icon: 'i-heroicons-exclamation-triangle',
    });
  });
  manager.on('download:finish', (seconds: number, status: DownloaderStatus) => {
    console.debug('耗时:', formatElapsedTime(seconds));
    toast.add({
      id: 'update_downloaded',
      color: 'purple',
      title: '【阅读量】抓取完成',
      description: `本次抓取耗时 ${formatElapsedTime(seconds)}, 成功:${status.completed.length}, 失败:${status.failed.length}, 检测到已被删除:${status.deleted.length}`,
      icon: 'i-octicon-desktop-download-24',
    });
  });

  try {
    downloadBtnLoading.value = true;
    await manager.startDownload('metadata');
  } catch (error) {
    console.error('【阅读量】抓取失败:', error);
    alert((error as Error).message);
  } finally {
    downloadBtnLoading.value = false;
    currentDownloader = null;
  }
}

// 抓取文章留言数据
async function downloadArticleComment() {
  const selectedRows = getSelectedRows();
  if (selectedRows.length === 0) {
    showToast('提示', '请先选择文章');
    return;
  }

  const urls: string[] = selectedRows.map(article => article.link);

  const manager = new Downloader(urls);
  currentDownloader = manager;
  
  manager.on('download:progress', (url: string, success: boolean, status: DownloaderStatus) => {
    console.debug(
      `进度: (进行中:${status.pending.length} / 已完成:${status.completed.length} / 已失败:${status.failed.length} / 已删除:${status.deleted.length})`
    );
    progress_1.value = status.completed.length;
    if (success) {
      const article = globalRowData.find(article => article.link === url);
      if (article) {
        article.commentDownload = true;
        updateRow(article);
      } else {
        console.warn(`${url} not found in table data when update commentDownload`);
      }
    }
  });
  manager.on('download:begin', () => {
    console.debug('开始抓取【留言内容】...');
    progress_1.value = 0;
    progress_2.value = urls.length;
  });
  manager.on('download:stop', () => {
    console.debug('任务已停止');
    toast.add({
      color: 'amber',
      title: '【留言内容】抓取已停止',
      description: `已完成:${progress_1.value}/${progress_2.value}`,
      icon: 'i-heroicons-exclamation-triangle',
    });
  });
  manager.on('download:finish', (seconds: number, status: DownloaderStatus) => {
    console.debug('耗时:', formatElapsedTime(seconds));
    toast.add({
      id: 'update_downloaded',
      color: 'purple',
      title: '【留言内容】抓取完成',
      description: `本次抓取耗时 ${formatElapsedTime(seconds)}, 成功:${status.completed.length}, 失败:${status.failed.length}`,
      icon: 'i-octicon-desktop-download-24',
    });
  });

  try {
    downloadBtnLoading.value = true;
    await manager.startDownload('comments');
  } catch (error) {
    console.error('【留言内容】抓取失败:', error);
    alert((error as Error).message);
  } finally {
    downloadBtnLoading.value = false;
    currentDownloader = null;
  }
}

const exportBtnLoading = ref(false);
const exportPhase = ref('导出中');

// 导出 excel
async function export2excel() {
  const selectedRows = getSelectedRows();
  if (selectedRows.length === 0) {
    showToast('提示', '请先选择文章');
    return;
  }

  const urls: string[] = selectedRows.map(article => article.link);

  const manager = new Exporter(urls);
  manager.on('export:begin', () => {
    exportPhase.value = '导出中';
    progress_1.value = 0;
    progress_2.value = 0;
  });
  manager.on('export:total', (total: number) => {
    progress_2.value = total;
  });
  manager.on('export:progress', (num: number) => {
    progress_1.value = num;
  });
  manager.on('export:finish', (seconds: number) => {
    console.debug('耗时:', formatElapsedTime(seconds));
    toast.add({
      id: 'update_downloaded',
      color: 'purple',
      title: 'Excel 导出完成',
      description: `本次导出耗时 ${formatElapsedTime(seconds)}`,
      icon: 'i-octicon-desktop-download-24',
    });
  });

  try {
    exportBtnLoading.value = true;
    await manager.startExport('excel');
  } catch (error) {
    console.error('导出任务失败:', error);
    alert((error as Error).message);
  } finally {
    exportBtnLoading.value = false;
  }
}

// 导出 json
async function export2json() {
  const selectedRows = getSelectedRows();
  if (selectedRows.length === 0) {
    showToast('提示', '请先选择文章');
    return;
  }

  const urls: string[] = selectedRows.map(article => article.link);

  const manager = new Exporter(urls);
  manager.on('export:begin', () => {
    exportPhase.value = '导出中';
    progress_1.value = 0;
    progress_2.value = 0;
  });
  manager.on('export:total', (total: number) => {
    progress_2.value = total;
  });
  manager.on('export:progress', (num: number) => {
    progress_1.value = num;
  });
  manager.on('export:finish', (seconds: number) => {
    console.debug('耗时:', formatElapsedTime(seconds));
    toast.add({
      id: 'update_downloaded',
      color: 'purple',
      title: 'Json 导出完成',
      description: `本次导出耗时 ${formatElapsedTime(seconds)}`,
      icon: 'i-octicon-desktop-download-24',
    });
  });

  try {
    exportBtnLoading.value = true;
    await manager.startExport('json');
  } catch (error) {
    console.error('导出任务失败:', error);
    alert((error as Error).message);
  } finally {
    exportBtnLoading.value = false;
  }
}

// 导出 html
async function export2html() {
  const selectedRows = getSelectedRows();
  if (selectedRows.length === 0) {
    showToast('提示', '请先选择文章');
    return;
  }

  const urls: string[] = selectedRows.map(article => article.link);

  const manager = new Exporter(urls);
  manager.on('export:begin', () => {
    exportPhase.value = '资源解析中';
    progress_1.value = 0;
    progress_2.value = 0;
  });
  manager.on('export:download', (total: number) => {
    exportPhase.value = '资源下载中';
    progress_1.value = 0;
    progress_2.value = total;
  });
  manager.on('export:download:progress', (url: string, success: boolean, status: ExporterStatus) => {
    progress_1.value = status.completed.length;
  });
  manager.on('export:write', (total: number) => {
    exportPhase.value = '文件写入中';
    progress_1.value = 0;
    progress_2.value = total;
  });
  manager.on('export:write:progress', (index: number) => {
    progress_1.value = index;
  });
  manager.on('export:finish', (seconds: number) => {
    console.debug('耗时:', formatElapsedTime(seconds));
    toast.add({
      id: 'update_downloaded',
      color: 'purple',
      title: 'HTML 导出完成',
      description: `本次导出耗时 ${formatElapsedTime(seconds)}`,
      icon: 'i-octicon-desktop-download-24',
    });
  });

  try {
    exportBtnLoading.value = true;
    await manager.startExport('html');
  } catch (error) {
    console.error('导出任务失败:', error);
    alert((error as Error).message);
  } finally {
    exportBtnLoading.value = false;
  }
}

// 导出 txt
async function export2txt() {
  const selectedRows = getSelectedRows();
  if (selectedRows.length === 0) {
    showToast('提示', '请先选择文章');
    return;
  }

  const urls: string[] = selectedRows.map(article => article.link);

  const manager = new Exporter(urls);
  manager.on('export:begin', () => {
    exportPhase.value = '资源解析中';
    progress_1.value = 0;
    progress_2.value = 0;
  });
  manager.on('export:total', (total: number) => {
    exportPhase.value = '导出中';
    progress_1.value = 0;
    progress_2.value = total;
  });
  manager.on('export:progress', (index: number) => {
    progress_1.value = index;
  });
  manager.on('export:finish', (seconds: number) => {
    console.debug('耗时:', formatElapsedTime(seconds));
    toast.add({
      id: 'update_downloaded',
      color: 'purple',
      title: 'Txt 导出完成',
      description: `本次导出耗时 ${formatElapsedTime(seconds)}`,
      icon: 'i-octicon-desktop-download-24',
    });
  });

  try {
    exportBtnLoading.value = true;
    await manager.startExport('txt');
  } catch (error) {
    console.error('导出任务失败:', error);
    alert((error as Error).message);
  } finally {
    exportBtnLoading.value = false;
  }
}

// 导出 markdown
async function export2markdown() {
  const selectedRows = getSelectedRows();
  if (selectedRows.length === 0) {
    showToast('提示', '请先选择文章');
    return;
  }

  const urls: string[] = selectedRows.map(article => article.link);

  const manager = new Exporter(urls);
  manager.on('export:begin', () => {
    exportPhase.value = '资源解析中';
    progress_1.value = 0;
    progress_2.value = 0;
  });
  manager.on('export:total', (total: number) => {
    exportPhase.value = '导出中';
    progress_1.value = 0;
    progress_2.value = total;
  });
  manager.on('export:progress', (index: number) => {
    progress_1.value = index;
  });
  manager.on('export:finish', (seconds: number) => {
    console.debug('耗时:', formatElapsedTime(seconds));
    toast.add({
      id: 'update_downloaded',
      color: 'purple',
      title: 'Markdown 导出完成',
      description: `本次导出耗时 ${formatElapsedTime(seconds)}`,
      icon: 'i-octicon-desktop-download-24',
    });
  });

  try {
    exportBtnLoading.value = true;
    await manager.startExport('markdown');
  } catch (error) {
    console.error('导出任务失败:', error);
    alert((error as Error).message);
  } finally {
    exportBtnLoading.value = false;
  }
}

// 导出 word
async function export2word() {
  const selectedRows = getSelectedRows();
  if (selectedRows.length === 0) {
    showToast('提示', '请先选择文章');
    return;
  }

  const urls: string[] = selectedRows.map(article => article.link);

  const manager = new Exporter(urls);
  manager.on('export:begin', () => {
    exportPhase.value = '资源解析中';
    progress_1.value = 0;
    progress_2.value = 0;
  });
  manager.on('export:total', (total: number) => {
    exportPhase.value = '导出中';
    progress_1.value = 0;
    progress_2.value = total;
  });
  manager.on('export:progress', (index: number) => {
    progress_1.value = index;
  });
  manager.on('export:finish', (seconds: number) => {
    console.debug('耗时:', formatElapsedTime(seconds));
    toast.add({
      id: 'update_downloaded',
      color: 'purple',
      title: 'Word 导出完成',
      description: `本次导出耗时 ${formatElapsedTime(seconds)}`,
      icon: 'i-octicon-desktop-download-24',
    });
  });

  try {
    exportBtnLoading.value = true;
    await manager.startExport('word');
  } catch (error) {
    console.error('导出任务失败:', error);
    alert((error as Error).message);
  } finally {
    exportBtnLoading.value = false;
  }
}

async function debug() {
  // const article = await getArticleByLink('https://mp.weixin.qq.com/s/8sCrH6AZyyff5dVXQAzVFQ');
  // console.log(article);
  const cache = await getHtmlCache('https://mp.weixin.qq.com/s/Uzr9f6SRQ_H1qM812vYXdg');
  if (cache) {
    const rawHtml = await readBlob(cache.file);
    // console.log(rawHtml);
    const html = normalizeHtml(rawHtml);
    console.log(html);
  }
}
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">文章下载</h1>
    </Teleport>

    <div class="flex flex-col h-full divide-y divide-gray-200">
      <!-- 顶部筛选与操作区 -->
      <header class="flex flex-col items-start gap-3 px-3 py-3">
        <!-- 第一行：公众号选择和时间选择 -->
        <div class="flex flex-col xl:flex-row gap-3 w-full">
          <div class="flex-1 min-w-[300px]">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">公众号选择</label>
            <AccountMultiSelectorForArticle v-model="selectedAccounts" class="w-full" />
          </div>
          <div class="flex-1 min-w-[200px]">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
              时间范围
              <span v-if="timeRangeDescription" class="text-xs text-gray-500 font-normal ml-2">{{ timeRangeDescription }}</span>
            </label>
            <USelectMenu
              v-model="timeRange"
              :options="timeRangeOptions"
              option-attribute="label"
              value-attribute="value"
              size="md"
              color="gray"
              class="w-full"
            />
          </div>
        </div>

        <!-- 第二行：自定义时间选择（仅在选择自定义时间时显示） -->
        <div v-if="timeRange === 'custom'" class="flex flex-col sm:flex-row gap-3 w-full">
          <div class="flex-1">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">开始日期</label>
            <input
              v-model="customStartDate"
              type="date"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>
          <div class="flex-1">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">结束日期</label>
            <input
              v-model="customEndDate"
              type="date"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>
        </div>

        <!-- 第三行：标题搜索 -->
        <div class="flex flex-col sm:flex-row gap-3 w-full items-end">
          <div class="flex-1 min-w-[300px]">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">标题搜索（支持多个关键词，用空格分隔）</label>
            <UInput
              v-model="titleSearch"
              placeholder="输入标题关键词，多个关键词用空格分隔"
              size="md"
              color="gray"
              icon="i-heroicons-magnifying-glass-20-solid"
            />
          </div>
          <div class="w-full sm:w-auto min-w-[180px]">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">匹配模式</label>
            <USelectMenu
              v-model="searchMode"
              :options="searchModeOptions"
              option-attribute="label"
              value-attribute="value"
              size="md"
              color="gray"
              class="w-full"
            />
          </div>
          <UButton
            @click="refreshTableData"
            :loading="loading"
            :disabled="selectedAccounts.length === 0"
            size="md"
            color="primary"
            icon="i-heroicons-arrow-path-20-solid"
            class="w-full sm:w-auto whitespace-nowrap"
          >
            刷新数据
          </UButton>
        </div>

        <!-- 第四行：操作按钮 -->
        <div class="flex flex-wrap items-center gap-2 w-full pt-2 border-t border-gray-200 dark:border-gray-700">
          <ButtonGroup
            :items="[
              { label: '文章内容', event: 'download-article-html' },
              { label: '阅读量 (需要Credential)', event: 'download-article-metadata' },
              { label: '留言内容 (需要Credential)', event: 'download-article-comment' },
            ]"
            @download-article-html="downloadArticleHTML"
            @download-article-metadata="downloadArticleMetadata"
            @download-article-comment="downloadArticleComment"
          >
            <UButton
              :loading="downloadBtnLoading"
              :disabled="selectedAccounts.length === 0"
              color="white"
              class="font-mono"
              :label="downloadBtnLoading ? `抓取中 ${progress_1}/${progress_2}` : '抓取'"
              trailing-icon="i-heroicons-chevron-down-20-solid"
            />
          </ButtonGroup>
          <UButton
            v-if="downloadBtnLoading"
            @click="stopDownload"
            color="orange"
            icon="i-heroicons-x-circle"
            class="font-mono"
          >
            停止
          </UButton>
          <ButtonGroup
            :items="[
              { label: 'Excel', event: 'export-article-excel' },
              { label: 'JSON', event: 'export-article-json' },
              { label: 'HTML', event: 'export-article-html' },
              { label: 'Txt', event: 'export-article-txt' },
              { label: 'Markdown', event: 'export-article-markdown' },
              { label: 'Word (内测中)', event: 'export-article-word' },
              // { label: 'PDF (计划中)', event: 'export-article-pdf', disabled: true },
            ]"
            @export-article-excel="export2excel"
            @export-article-json="export2json"
            @export-article-html="export2html"
            @export-article-txt="export2txt"
            @export-article-markdown="export2markdown"
            @export-article-word="export2word"
          >
            <UButton
              :loading="exportBtnLoading"
              :disabled="selectedAccounts.length === 0"
              color="white"
              class="font-mono"
              :label="exportBtnLoading ? `${exportPhase} ${progress_1}/${progress_2}` : '导出'"
              trailing-icon="i-heroicons-chevron-down-20-solid"
            />
          </ButtonGroup>
          <UButton v-if="isDev" @click="debug">调试</UButton>
        </div>
      </header>

      <ag-grid-vue
        style="width: 100%; height: 100%"
        :loading="loading"
        :rowData="globalRowData"
        :columnDefs="columnDefs"
        :gridOptions="gridOptions"
        @grid-ready="onGridReady"
        @filter-changed="onFilterChanged"
        @column-moved="onColumnStateChange"
        @column-visible="onColumnStateChange"
        @column-pinned="onColumnStateChange"
        @column-resized="onColumnStateChange"
      ></ag-grid-vue>
    </div>

    <PreviewArticle ref="previewArticleRef" />
  </div>
</template>
