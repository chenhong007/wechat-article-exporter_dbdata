import dayjs from 'dayjs';
import { H3Event, parseCookies } from 'h3';
import { v4 as uuidv4 } from 'uuid';
import { isDev, USER_AGENT } from '~/config';
import { RequestOptions } from '~/server/types';
import { cookieStore, getCookieFromStore } from '~/server/utils/CookieStore';
import { logRequest, logResponse } from '~/server/utils/logger';

/**
 * 代理微信公众号请求
 * @description 备注：只有登录请求(`action=login`)中的 `set-cookie` 才会被写入到 CookieStore 中
 * @param options 请求参数
 */
export async function proxyMpRequest(options: RequestOptions) {
  const runtimeConfig = useRuntimeConfig();

  const headers = new Headers({
    Referer: 'https://mp.weixin.qq.com/',
    Origin: 'https://mp.weixin.qq.com',
    'User-Agent': USER_AGENT,
  });

  // 优先读取参数中的 cookie，若无则从 CookieStore 中读取
  const cookie: string | null = options.cookie || (await getCookieFromStore(options.event));
  if (cookie) {
    headers.set('Cookie', cookie);
  }

  const requestInit: RequestInit = {
    method: options.method,
    headers: headers,
    redirect: options.redirect || 'follow',
  };

  // 处理参数
  if (options.query) {
    options.endpoint += '?' + new URLSearchParams(options.query as Record<string, string>).toString();
  }
  if (options.method === 'POST' && options.body) {
    requestInit.body = new URLSearchParams(options.body as Record<string, string>).toString();
  }

  // 构造请求
  const request = new Request(options.endpoint, requestInit);

  // 记录请求报文
  const requestId = uuidv4().replace(/-/g, '');
  if (process.env.NUXT_DEBUG_MP_REQUEST && isDev) {
    await logRequest(requestId, request.clone());
  }

  // 转发请求 - 添加重试机制
  const maxRetries = parseInt(process.env.REQUEST_MAX_RETRIES || '3');
  const retryDelay = parseInt(process.env.REQUEST_RETRY_DELAY || '1000');
  const timeout = parseInt(process.env.REQUEST_TIMEOUT || '30000');
  let mpResponse: Response | null = null;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 设置超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      mpResponse = await fetch(request.clone(), {
        ...requestInit,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      // 请求成功，跳出重试循环
      if (isDev) {
        console.log(`[proxyMpRequest] Request succeeded on attempt ${attempt}`);
      }
      break;
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message || '未知错误';
      
      // 判断错误类型
      const isTLSError = errorMessage.includes('TLS') || errorMessage.includes('socket');
      const isTimeoutError = errorMessage.includes('aborted') || errorMessage.includes('timeout');
      
      console.error(
        `[proxyMpRequest] 尝试 ${attempt}/${maxRetries} 失败 [${options.endpoint}]:`,
        isTLSError ? 'TLS连接错误' : isTimeoutError ? '请求超时' : errorMessage
      );

      // 如果不是最后一次重试，则等待后重试
      if (attempt < maxRetries) {
        const waitTime = retryDelay * attempt;
        console.log(`[proxyMpRequest] ${waitTime}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // 如果所有重试都失败，抛出错误
  if (!mpResponse) {
    const errorMsg = `请求失败（已重试${maxRetries}次）: ${lastError?.message || '未知错误'}`;
    console.error(`[proxyMpRequest] ${errorMsg}`);
    console.error('[proxyMpRequest] 提示: 如果频繁出现 TLS 连接错误，请检查:');
    console.error('  1. 网络连接是否稳定');
    console.error('  2. 是否需要配置代理（HTTP_PROXY/HTTPS_PROXY 环境变量）');
    console.error('  3. 防火墙是否阻止了连接');
    throw new Error(errorMsg);
  }

  // 记录响应报文
  if (process.env.NUXT_DEBUG_MP_REQUEST && isDev) {
    await logResponse(requestId, mpResponse.clone());
  }

  let setCookies: string[] = [];

  // 处理登录请求的 uuid cookie
  if (options.action === 'start_login') {
    // 提取出 uuid 这个 cookie，并透传给客户端
    // 微信返回的 cookie 可能包含 Domain 和 Secure 属性，需要根据当前环境进行清洗
    const rawCookies = mpResponse.headers.getSetCookie().filter(cookie => cookie.startsWith('uuid='));
    setCookies = rawCookies.map(cookieStr => {
      let newCookie = cookieStr;
      // 移除 Domain 属性，以便在当前域名下写入
      newCookie = newCookie.replace(/;\s*Domain=[^;]+/i, '');
      // 移除 Secure 属性，以便在 HTTP 环境下写入 (如果是在 HTTPS 环境下，浏览器通常允许不带 Secure 的 cookie)
      // 如果必须在 HTTPS 下强制 Secure，可以根据环境变量判断，但为了最大兼容性，这里移除它
      newCookie = newCookie.replace(/;\s*Secure/i, '');
      
      // 确保 Path=/
      if (!/;\s*Path=/i.test(newCookie)) {
        newCookie += '; Path=/';
      }
      // 确保 HttpOnly (通常微信返回的已经有了，但以防万一)
      if (!/;\s*HttpOnly/i.test(newCookie)) {
        newCookie += '; HttpOnly';
      }
      // 设置 SameSite=Lax
      if (!/;\s*SameSite=/i.test(newCookie)) {
        newCookie += '; SameSite=Lax';
      }
      return newCookie;
    });
  }

  // 处理登录成功请求的 cookie
  // 只有登录请求才会将 Cookie 数据写入 CookieStore
  // 返回给客户端的一个 auth-key 的 cookie
  else if (options.action === 'login') {
    // 提取出 token 和 cookies
    try {
      const authKey = crypto.randomUUID().replace(/-/g, '');

      const { redirect_url } = await mpResponse.clone().json();
      const token = new URL(`http://localhost${redirect_url}`).searchParams.get('token')!;
      console.log('token', token);
      const success = await cookieStore.setCookie(authKey, token, mpResponse.headers.getSetCookie());
      if (success) {
        console.log('cookie 写入成功');
      } else {
        console.log('cookie 写入失败');
      }

      setCookies = [
        `auth-key=${authKey}; Path=/; Expires=${dayjs().add(4, 'days').toDate().toUTCString()}; HttpOnly; SameSite=Lax`,

        // 登录成功后，删除浏览器的 uuid cookie
        `uuid=EXPIRED; Path=/; Expires=${dayjs().subtract(1, 'days').toDate().toUTCString()}; HttpOnly; SameSite=Lax`,
      ];
    } catch (error) {
      console.error('action(login) failed:', error);
    }
  }

  // 处理切换公众号的请求
  else if (options.action === 'switch_account') {
    const authKey = getAuthKeyFromRequest(options.event);
    if (authKey) {
      setCookies = ['switch_account=1'];
    }
  }

  // 这里是否需要执行？
  // 更新 CookieStore 中的 cookie
  else {
    // updateCookies(options.event, mpResponse.headers.getSetCookie());
  }

  // 构造返回给客户端的响应
  const responseHeaders = new Headers(mpResponse.headers);
  responseHeaders.delete('set-cookie');
  setCookies.forEach(setCookie => {
    responseHeaders.append('set-cookie', setCookie);
  });

  const finalResponse = new Response(mpResponse.body, {
    status: mpResponse.status,
    statusText: mpResponse.statusText,
    headers: responseHeaders,
  });

  if (!options.parseJson) {
    return finalResponse;
  } else {
    return finalResponse.json();
  }
}

export function getAuthKeyFromRequest(event: H3Event): string {
  let authKey = getRequestHeader(event, 'X-Auth-Key');
  if (!authKey) {
    const cookies = parseCookies(event);
    authKey = cookies['auth-key'];
  }

  return authKey;
}

// function updateCookies(event: H3Event, cookies: string[]): void {
//   const authKey = getAuthKeyFromRequest(event);
//   if (authKey) {
//     cookieStore.updateCookie(authKey, cookies);
//   }
// }
