<template>
  <USlideover v-model="open" :ui="{ width: 'max-w-[500px]' }">
    <UCard
      class="flex flex-col flex-1"
      :ui="{ body: { base: 'flex-1' }, ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }"
    >
      <template #header>
        <div class="flex justify-between items-center">
          <h2 class="font-bold text-2xl">抓取 Credentials</h2>
          <div class="flex items-center gap-2">
            <UTooltip text="复制所有过期公众号的文章链接，在微信中打开以刷新">
              <UButton
                v-if="expiredCredentials.length > 0"
                size="sm"
                color="orange"
                variant="soft"
                :loading="batchRefreshing"
                :disabled="batchRefreshing"
                @click="batchRefreshCredentials"
              >
                <UIcon name="i-lucide:copy" class="size-4 mr-1" />
                批量复制链接 ({{ expiredCredentials.length }})
              </UButton>
            </UTooltip>
          </div>
        </div>
      </template>

      <div>
        <UTabs
          :items="tabs"
          :ui="{ list: { marker: { background: 'bg-blue-500 text-white' }, tab: { active: 'text-white' } } }"
        >
          <template #item="{ item }">
            <div v-if="item.key === 'wxdown'" class="space-y-5">
              <p class="flex items-center text-sm">
                <span class="text-rose-500 font-semibold">所需软件：</span>
                <UButton @click="downloadProgram" variant="ghost" color="gray"
                  >去下载 wxdown-service 程序
                  <UIcon name="i-lucide:arrow-up-right" class="size-5" />
                </UButton>
              </p>
              <div class="flex justify-between items-center gap-3">
                <UInput
                  class="flex-1"
                  color="gray"
                  type="url"
                  v-model="wsURL"
                  :disabled="monitoring || wsMonitoring"
                  placeholder="请输入 ws 监听地址"
                />
                <UButton
                  v-if="!wsMonitoring"
                  :disabled="!wsURL || monitoring"
                  color="blue"
                  @click="startListenService(true)"
                >
                  开始监控
                </UButton>
                <UButton v-else icon="i-line-md:loading-twotone-loop" color="green" @click="stopListenService"
                  >监控中，结束监控</UButton
                >
              </div>
            </div>
            <div v-if="item.key === 'mitmproxy'">
              <p class="flex items-center text-sm">
                <span class="text-rose-500 font-semibold">所需软件：</span>
                <UButton @click="downloadPlugin" variant="ghost" color="gray"
                  >去下载 mitmproxy 插件
                  <UIcon name="i-lucide:arrow-up-right" class="size-5" />
                </UButton>
              </p>
              <div class="text-sm my-5">
                <p class="flex justify-between items-end">执行以下命令启动 mitmproxy 服务并加载 credential.py 插件：</p>
                <p class="flex justify-between items-center bg-black text-white p-2 my-2 rounded-md">
                  <code>mitmdump -s credential.py -q</code>
                  <UIcon v-if="copied" name="i-lucide:copy-check" />
                  <UIcon
                    v-else
                    name="i-lucide:copy"
                    class="cursor-pointer"
                    @click="copy('mitmdump -s credential.py -q')"
                  />
                </p>
              </div>
              <div class="flex justify-between items-center gap-3">
                <UInput
                  class="flex-1"
                  color="gray"
                  v-model="apiKey"
                  :disabled="authorized || wsMonitoring"
                  placeholder="请输入API Key"
                />
                <UButton
                  class="px-5"
                  color="blue"
                  :loading="authorizeBtnLoading"
                  :disabled="!apiKey || authorized || wsMonitoring || monitoring"
                  @click="authorize"
                  >认证</UButton
                >

                <UButton v-if="!monitoring" :disabled="!authorized || wsMonitoring" color="blue" @click="start"
                  >开始监控</UButton
                >
                <UButton v-else icon="i-line-md:loading-twotone-loop" color="green" @click="stop"
                  >监控中，结束监控</UButton
                >
              </div>
            </div>
          </template>
        </UTabs>
        <ul class="flex flex-col mt-3 p-1 gap-4 overflow-y-scroll h-[calc(100vh-20rem)] no-scrollbar">
          <li
            v-for="credential in credentials"
            :key="credential.biz"
            class="relative border rounded-md hover:ring ring-blue-500 hover:shadow-md transition-all duration-300 px-8 py-3"
          >
            <UButton
              class="absolute top-2 right-2"
              icon="i-lucide:x"
              size="2xs"
              color="gray"
              variant="ghost"
              @click="deleteCredential(credential.biz)"
            />
            <p>公众号名称：{{ credential.nickname || '--' }}</p>
            <p>fakeid: {{ credential.biz }}</p>
            <p>获取时间: {{ credential.time }}</p>
            <div class="flex items-center justify-between mt-4">
              <div class="flex items-center gap-2">
                <span v-if="credential.valid" class="font-sans font-bold text-green-500">有效</span>
                <span v-else class="font-sans font-bold text-rose-500">已过期</span>
                <UTooltip v-if="!credential.valid" text="复制文章链接，在微信中打开以刷新">
                  <UButton
                    size="2xs"
                    color="orange"
                    variant="soft"
                    :loading="credential.refreshing"
                    :disabled="credential.refreshing"
                    @click="refreshCredential(credential)"
                  >
                    <UIcon v-if="!credential.refreshing" name="i-lucide:copy" class="size-3" />
                    复制
                  </UButton>
                </UTooltip>
              </div>
              <UButton
                size="xs"
                :color="credential.added ? 'green' : 'blue'"
                :variant="credential.added ? 'soft' : 'solid'"
                :disabled="credential.added || addingBiz === credential.biz"
                :loading="addingBiz === credential.biz"
                @click="addAccount(credential)"
              >
                {{ credential.added ? '已添加' : '添加公众号' }}
              </UButton>
            </div>
          </li>
        </ul>
      </div>
    </UCard>
  </USlideover>
</template>

<script setup lang="ts">
import dayjs from 'dayjs';
import { getArticleList } from '~/apis';
import LoginModal from '~/components/modal/Login.vue';
import toastFactory from '~/composables/toast';
import useLoginCheck from '~/composables/useLoginCheck';
import { CREDENTIAL_API_HOST, CREDENTIAL_LIVE_MINUTES } from '~/config';
import { getInfoCache, type Info } from '~/store/v2/info';
import { db } from '~/store/v2/db';
import type { ParsedCredential } from '~/types/credential';

export type CredentialState = 'active' | 'inactive' | 'warning';

const emit = defineEmits<{
  (e: 'update:pendingCount', value: number): void;
}>();

const open = defineModel<boolean>('open', { default: false });
const state = defineModel<CredentialState>('state', { default: 'inactive' });

const tabs = [
  {
    key: 'wxdown',
    label: 'wxdown 程序版',
  },
  {
    key: 'mitmproxy',
    label: 'mitmproxy 插件版',
  },
];

const { checkLogin } = useLoginCheck();

const credentials = useLocalStorage<ParsedCredential[]>('auto-detect-credentials:credentials', []);
// 已删除的 biz 列表，用于过滤 WebSocket 推送的数据，永久不显示已删除的项
const deletedBizList = useLocalStorage<string[]>('auto-detect-credentials:deleted-biz-v2', []);

// 检查某个 biz 是否在删除列表中
function isDeleted(biz: string): boolean {
  return deletedBizList.value.includes(biz);
}

for (const item of credentials.value) {
  item.valid = Date.now() < item.timestamp + 1000 * 60 * CREDENTIAL_LIVE_MINUTES;
}
const validCredentialCount = computed(() => credentials.value.filter(c => c.valid).length);
const pendingCredentialCount = computed(() => credentials.value.filter(c => c.valid && !c.added).length);
const expiredCredentials = computed(() => credentials.value.filter(c => !c.valid));
const toast = toastFactory();
const modal = useModal();

// 批量刷新状态
const batchRefreshing = ref(false);

const addingBiz = ref<string | null>(null);

async function refreshCredentialAddedState() {
  const pending = credentials.value.map(async credential => {
    const info = await getInfoCache(credential.biz);
    credential.added = Boolean(info);
  });
  await Promise.allSettled(pending);
}

// 监听账号事件，及时更新当前凭据项的按钮状态
const { accountEventBus } = useAccountEventBus();
accountEventBus.on((event, payload) => {
  if (event === 'account-added') {
    const target = credentials.value.find(item => item.biz === payload?.fakeid);
    if (target) {
      target.added = true;
    }
  } else if (event === 'account-removed') {
    const target = credentials.value.find(item => item.biz === payload?.fakeid);
    if (target) {
      target.added = false;
    }
  }
});

interface Credential {
  url: string;
  set_cookie?: string;
  cookie?: string;
  timestamp: number;
  name?: string;
  avatar?: string;
}

function extractCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  // 兼容 "Set-Cookie" 多条合并/拼接的场景：用 [,;] 作为分隔符查找 name=value
  const match = cookieHeader.match(new RegExp(`(?:^|[,;]\\s*)${name}=([^;]+)`));
  return match?.[1] ? match[1].trim() : null;
}

async function buildParsedCredentials(result: Credential[]): Promise<ParsedCredential[]> {
  // 按 biz 去重：同一公众号保留最新的一条
  const latestByBiz = new Map<string, ParsedCredential>();

  for (const item of result) {
    if (!item?.url) continue;

    let searchParams: URLSearchParams;
    try {
      searchParams = new URL(item.url).searchParams;
    } catch {
      continue;
    }

    const biz = searchParams.get('__biz') || '';
    const uin = searchParams.get('uin') || '';
    const key = searchParams.get('key') || '';
    const pass_ticket = searchParams.get('pass_ticket') || '';

    const cookieSource = item.set_cookie || item.cookie || '';
    const wap_sid2 = extractCookieValue(cookieSource, 'wap_sid2');

    // 验证完整性
    if (!biz || !uin || !key || !pass_ticket || !wap_sid2) {
      continue;
    }

    const candidate: ParsedCredential = {
      nickname: item.name,
      avatar: item.avatar,
      biz,
      uin,
      key,
      pass_ticket,
      wap_sid2,
      timestamp: item.timestamp || Date.now(),
      time: dayjs(item.timestamp || Date.now()).format('YYYY-MM-DD HH:mm:ss'),
      valid: Date.now() < (item.timestamp || Date.now()) + 1000 * 60 * CREDENTIAL_LIVE_MINUTES,
      added: false,
    };

    const existing = latestByBiz.get(biz);
    if (!existing || existing.timestamp < candidate.timestamp) {
      latestByBiz.set(biz, candidate);
    }
  }

  const candidates = Array.from(latestByBiz.values());
  if (candidates.length === 0) return [];

  // 并行读取 info，避免逐条 await 导致卡顿
  const infos = await Promise.allSettled(candidates.map(c => getInfoCache(c.biz)));

  return candidates.map((c, idx) => {
    const info = infos[idx].status === 'fulfilled' ? infos[idx].value : null;
    return {
      ...c,
      nickname: c.nickname || info?.nickname,
      avatar: c.avatar || info?.round_head_img,
      added: Boolean(info),
    };
  });
}

let timer: number;
let manulStopped = false;
let listenRetryTimer: number | null = null;
const monitoring = ref(JSON.parse(localStorage.getItem('auto-detect-credentials:monitoring') as string) || false);

function start() {
  monitoring.value = true;
  const oldTimer = localStorage.getItem('auto-detect-credentials:monitoring-timer');
  if (oldTimer) {
    window.clearInterval(parseInt(oldTimer));
  }
  fetchCredentials();
  timer = window.setInterval(() => {
    fetchCredentials();
  }, 3000);
  localStorage.setItem('auto-detect-credentials:monitoring', 'true');
  localStorage.setItem('auto-detect-credentials:monitoring-timer', timer.toString());
}
function stop() {
  monitoring.value = false;
  localStorage.setItem('auto-detect-credentials:monitoring', 'false');
  window.clearInterval(timer);
}

// 监听服务重试机制
function scheduleListenRetry() {
  if (listenRetryTimer) {
    window.clearTimeout(listenRetryTimer);
  }

  // 如果是手动停止的，则不重试
  if (manulStopped) return;

  listenRetryTimer = window.setTimeout(() => {
    startListenService();
  }, 5000);
}

// 清除重试定时器
function clearRetryTimer() {
  if (listenRetryTimer) {
    window.clearTimeout(listenRetryTimer);
    listenRetryTimer = null;
  }
}

onMounted(() => {
  if (monitoring.value) {
    start();
  }
  refreshCredentialAddedState();
  startListenService();
});

onUnmounted(() => {
  clearRetryTimer();
});

// 下载 credential.py 插件
async function downloadPlugin() {
  const link = document.createElement('a');
  link.href = '/plugins/credential.py';
  link.download = 'credential.py';
  link.click();
}

// 下载 wxdown-service 程序
async function downloadProgram() {
  const link = document.createElement('a');
  link.target = '_blank';
  link.href = 'https://github.com/wechat-article/wxdown-service/releases';
  link.download = 'wxdown-service';
  link.click();
}

const apiKey = ref(localStorage.getItem('auto-detect-credentials:apikey') as string);
const authorizeBtnLoading = ref(false);
const authorized = ref(false);

// 认证
async function authorize() {
  try {
    authorizeBtnLoading.value = true;
    const response = await fetch(`${CREDENTIAL_API_HOST}/authorize`, {
      method: 'GET',
      headers: {
        Authorization: apiKey.value,
      },
    });
    if (response.status === 200) {
      authorized.value = true;
      localStorage.setItem('auto-detect-credentials:apikey', apiKey.value);
      alert('认证成功');
    } else {
      authorized.value = false;
      localStorage.removeItem('auto-detect-credentials:apikey');
      alert('认证失败，请确认 API Key 是否正确');
    }
  } catch (error: any) {
    if (error.message === 'Failed to fetch') {
      alert('mitmproxy 服务未启动');
    } else {
      alert(error.message);
    }
    authorized.value = false;
  } finally {
    authorizeBtnLoading.value = false;
  }
}

// 获取数据
async function fetchCredentials() {
  let result: Credential[] = [];
  try {
    const response = await fetch(`${CREDENTIAL_API_HOST}/credentials`, {
      method: 'GET',
      headers: {
        Authorization: apiKey.value,
      },
    });
    if (response.status === 404) {
      result = [];
    } else if (response.status !== 200) {
      authorized.value = false;
      stop();
      return;
    } else {
      result = await response.json();
    }
  } catch (error) {
    console.error(error);
    authorized.value = false;
    stop();
    return;
  }

  const parsed = await buildParsedCredentials(result);
  // 过滤掉已删除的项
  credentials.value = parsed.filter(c => !isDeleted(c.biz)).sort((a, b) => b.timestamp - a.timestamp);
}

const wsURL = ref('ws://127.0.0.1:65001');
const wsMonitoring = ref(false);
let _ws: WebSocket | null = null;

// 启动监听服务
async function startListenService(isManual = false) {
  const url = wsURL.value.trim();
  if (!url) {
    return;
  }
  if (isManual) {
    // 手动启动时，取消手动停止标记
    manulStopped = false;
  }
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => {
    wsMonitoring.value = true;
    _ws = ws;
    clearRetryTimer();
  });
  ws.addEventListener('message', async evt => {
    let result: Credential[] = [];
    try {
      result = JSON.parse(evt.data);
    } catch (e) {
      console.warn('解析失败: ', e);
    }
    const _credentials = await buildParsedCredentials(result);
    // 过滤掉已删除的项
    credentials.value = _credentials.filter(c => !isDeleted(c.biz)).sort((a, b) => b.timestamp - a.timestamp);
  });
  ws.addEventListener('close', () => {
    wsMonitoring.value = false;
    _ws = null;
    scheduleListenRetry();
  });
  ws.addEventListener('error', evt => {
    scheduleListenRetry();
  });
}

// 停止监听服务
async function stopListenService() {
  manulStopped = true;
  if (_ws) {
    _ws.close();
  }
  clearRetryTimer();
}

// 删除 credential（仅前端不显示，后端数据保持有效）
function deleteCredential(biz: string) {
  credentials.value = credentials.value.filter(c => c.biz !== biz);
  // 添加到已删除列表，防止 WebSocket 推送时重新出现
  if (!deletedBizList.value.includes(biz)) {
    deletedBizList.value.push(biz);
  }
}

async function addAccount(credential: ParsedCredential) {
  if (credential.added || addingBiz.value === credential.biz) {
    return;
  }
  if (!checkLogin()) return;

  addingBiz.value = credential.biz;
  const nickname = credential.nickname || credential.biz;
  const account: Info = {
    fakeid: credential.biz,
    completed: false,
    count: 0,
    articles: 0,
    total_count: 0,
    nickname: credential.nickname,
    round_head_img: credential.avatar,
  };

  try {
    await getArticleList(account, 0);
    credential.added = true;
    toast.success('公众号添加成功', `已成功添加公众号【${nickname}】`);
    // 通知其他视图（如公众号管理列表）立即刷新
    accountEventBus.emit('account-added', { fakeid: credential.biz });
  } catch (error: any) {
    if (error?.message === 'session expired') {
      modal.open(LoginModal);
    } else {
      toast.error('添加公众号失败', error?.message || '未知错误');
    }
  } finally {
    addingBiz.value = null;
  }
}

/**
 * 获取公众号的第一篇文章链接（用于刷新Credential）
 * @param biz 公众号的 __biz 参数
 */
async function getFirstArticleLink(biz: string): Promise<string | null> {
  try {
    // 从本地数据库获取该公众号的文章
    const articles = await db.article
      .where('fakeid')
      .equals(biz)
      .reverse()
      .sortBy('create_time');
    
    if (articles.length > 0) {
      // 返回最新的一篇文章链接
      return articles[0].link;
    }
    return null;
  } catch (error) {
    console.error('获取文章链接失败:', error);
    return null;
  }
}

/**
 * 复制单个Credential的文章链接
 * @param credential 需要刷新的凭证
 */
async function refreshCredential(credential: ParsedCredential) {
  if (credential.refreshing) return;
  
  credential.refreshing = true;
  
  try {
    // 获取该公众号的文章链接
    let articleLink: string | null | undefined = credential.articleLink;
    
    if (!articleLink) {
      articleLink = await getFirstArticleLink(credential.biz);
    }
    
    if (!articleLink) {
      toast.error('获取失败', `公众号【${credential.nickname || credential.biz}】没有缓存的文章，请先手动打开一篇文章`);
      return;
    }
    
    // 复制链接到剪贴板
    await navigator.clipboard.writeText(articleLink);
    
    toast.success('链接已复制', `请在微信中打开此链接以刷新 Credential（确保 wxdown-service 正在运行）`);
  } catch (error: any) {
    toast.error('复制失败', error?.message || '未知错误');
  } finally {
    credential.refreshing = false;
  }
}

/**
 * 批量复制所有过期Credential的文章链接
 */
async function batchRefreshCredentials() {
  if (batchRefreshing.value) return;
  
  const expired = expiredCredentials.value;
  if (expired.length === 0) {
    toast.info('无需刷新', '没有过期的Credential');
    return;
  }
  
  batchRefreshing.value = true;
  
  try {
    const links: string[] = [];
    let failCount = 0;
    
    for (const credential of expired) {
      const articleLink = await getFirstArticleLink(credential.biz);
      
      if (articleLink) {
        links.push(`${credential.nickname || credential.biz}: ${articleLink}`);
      } else {
        failCount++;
      }
    }
    
    if (links.length > 0) {
      // 复制所有链接到剪贴板
      await navigator.clipboard.writeText(links.join('\n'));
      toast.success('链接已复制', `已复制 ${links.length} 个文章链接，请在微信中逐个打开以刷新 Credential`);
    }
    if (failCount > 0) {
      toast.warning('部分获取失败', `${failCount} 个公众号没有缓存的文章`);
    }
  } catch (error: any) {
    toast.error('批量复制失败', error?.message || '未知错误');
  } finally {
    batchRefreshing.value = false;
  }
}

watchEffect(() => {
  if (!monitoring.value && !wsMonitoring.value) {
    state.value = 'inactive';
  } else if (monitoring.value || wsMonitoring.value) {
    state.value = 'active';
  } else {
    state.value = 'warning';
  }
});

watchEffect(() => {
  emit('update:pendingCount', pendingCredentialCount.value);
});

const copied = ref(false);
function copy(text: string) {
  navigator.clipboard.writeText(text);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 1000);
}
</script>
