import mitmproxy.http
import json
import queue
import random
import string
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs


class ExtractSetCookie:
    def __init__(self):
        self.cookies = {}
        self._lock = threading.Lock()
        self._last_dump_ms = 0
        self._last_update_ms = 0
        self._streams = set()

    def _dump_to_file(self):
        # 高频写文件会明显拖慢抓取，这里做一个极轻量的节流
        now_ms = int(time.time() * 1000)
        if now_ms - self._last_dump_ms < 200:
            return
        self._last_dump_ms = now_ms

        with open("credentials.json", "w") as file:
            json.dump(list(self.cookies.values()), file, indent=4)

    def _update(self, biz: str, url: str, cookie_header: str = None, set_cookie_header: str = None):
        if not biz or not url:
            return

        timestamp = int(time.time() * 1000)
        with self._lock:
            prev = self.cookies.get(biz, {})
            cookie_val = cookie_header if cookie_header else prev.get("cookie", "")
            set_cookie_val = set_cookie_header if set_cookie_header else prev.get("set_cookie", "")

            # 前端优先读取 set_cookie；如果抓不到 Set-Cookie，就用 Cookie 兜底
            effective_set_cookie = set_cookie_val if set_cookie_val else cookie_val
            if not effective_set_cookie:
                return

            parsed = urlparse(url)
            query_params = parse_qs(parsed.query)
            biz_val = query_params.get('__biz', [biz])[0] or biz
            uin = query_params.get('uin', [''])[0] or ''
            key = query_params.get('key', [''])[0] or ''
            pass_ticket = query_params.get('pass_ticket', [''])[0] or ''

            cookie_source = "; ".join([v for v in [set_cookie_val, cookie_val] if v])
            wap_sid2 = self._extract_cookie_value(cookie_source, 'wap_sid2')

            # 只保留完整记录
            if not biz_val or not uin or not key or not pass_ticket or not wap_sid2:
                return

            record = {
                "biz": biz_val,
                "uin": uin,
                "key": key,
                "pass_ticket": pass_ticket,
                "wap_sid2": wap_sid2,
                "url": url,
                "cookie": cookie_val,
                "set_cookie": effective_set_cookie,
                "timestamp": timestamp,
            }
            self.cookies[biz_val] = record
            self._last_update_ms = max(self._last_update_ms, timestamp)
            self._dump_to_file()
            self._broadcast(record)

    def _extract_cookie_value(self, cookie_header: str, name: str):
        if not cookie_header:
            return None
        parts = [p.strip() for p in cookie_header.replace(",", ";").split(";") if p.strip()]
        prefix = f"{name}="
        for part in parts:
            if part.startswith(prefix):
                return part[len(prefix):].strip()
        return None

    def register_stream(self):
        stream = queue.Queue(maxsize=100)
        with self._lock:
            self._streams.add(stream)
        return stream

    def unregister_stream(self, stream):
        with self._lock:
            if stream in self._streams:
                self._streams.remove(stream)

    def _broadcast(self, record: dict):
        payload = {
            "type": "upsert",
            "record": record,
            "lastUpdateTs": self._last_update_ms,
        }
        message = f"event: credential\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
        with self._lock:
            streams = list(self._streams)
        for stream in streams:
            try:
                stream.put_nowait(message)
            except queue.Full:
                continue

    def get_since(self, since_ms: int):
        with self._lock:
            if since_ms <= 0:
                items = list(self.cookies.values())
            else:
                items = [item for item in self.cookies.values() if item.get("timestamp", 0) > since_ms]
            return {
                "lastUpdateTs": self._last_update_ms,
                "items": items,
            }

    def request(self, flow: mitmproxy.http.HTTPFlow):
        # 更稳：有些情况下响应里拿不到 wap_sid2，但请求里已经带了 Cookie
        if flow.request.url.startswith("https://mp.weixin.qq.com/s?__biz="):
            parsed_url = urlparse(flow.request.url)
            query_params = parse_qs(parsed_url.query)
            biz = query_params.get('__biz', [None])[0]
            if biz:
                cookie_header = flow.request.headers.get("Cookie")
                if cookie_header:
                    self._update(biz=biz, url=flow.request.url, cookie_header=cookie_header)

    def response(self, flow: mitmproxy.http.HTTPFlow):
        # 检查请求的 URL 是否符合过滤器
        if flow.request.url.startswith("https://mp.weixin.qq.com/s?__biz="):
            # 提取 __biz 参数
            parsed_url = urlparse(flow.request.url)
            query_params = parse_qs(parsed_url.query)
            biz = query_params.get('__biz', [None])[0]
            if biz:
                # 提取响应头中的 Set-Cookie 数据（可能有多条）
                set_cookie_headers = flow.response.headers.get_all("Set-Cookie")
                if set_cookie_headers:
                    merged = "; ".join(set_cookie_headers)
                    self._update(biz=biz, url=flow.request.url, set_cookie_header=merged)


extractor = ExtractSetCookie()
addons = [
    extractor,
]

# 生成一个长度为36的随机字符串作为会话密钥
session_key = ''.join(random.choices(string.ascii_letters + string.digits, k=32))
print(f"本次会话的密钥: {session_key}")


# 创建一个简单的 HTTP 服务器来提供 credentials API
def start_http_server():
    class CustomHandler(BaseHTTPRequestHandler):
        def _get_auth(self):
            auth_header = self.headers.get("Authorization")
            if auth_header:
                return auth_header
            parsed = urlparse(self.path)
            query_params = parse_qs(parsed.query)
            return query_params.get('auth', [None])[0]

        def _send_json(self, payload: dict, status_code: int = 200):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def end_headers(self):
            # 添加 CORS 头
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            super().end_headers()

        def do_OPTIONS(self):
            self.send_response(200)
            self.end_headers()

        def do_GET(self):
            parsed = urlparse(self.path)
            auth_header = self._get_auth()
            if auth_header != session_key:
                self.send_response(401)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(b"Unauthorized")
                return

            if parsed.path == "/authorize":
                self.send_response(200)
                self.end_headers()
                return
            elif parsed.path == "/credentials":
                query_params = parse_qs(parsed.query)
                since_val = query_params.get('since', [None])[0]
                try:
                    since_ms = int(since_val) if since_val else 0
                except ValueError:
                    since_ms = 0
                data = extractor.get_since(since_ms)
                return self._send_json(data, 200)
            elif parsed.path == "/credentials/stream":
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self.end_headers()

                stream = extractor.register_stream()
                try:
                    self.wfile.write(b": connected\n\n")
                    self.wfile.flush()
                    while True:
                        try:
                            message = stream.get(timeout=15)
                            self.wfile.write(message.encode("utf-8"))
                            self.wfile.flush()
                        except queue.Empty:
                            self.wfile.write(b": ping\n\n")
                            self.wfile.flush()
                except (ConnectionResetError, BrokenPipeError):
                    pass
                finally:
                    extractor.unregister_stream(stream)
                return
            else:
                self.send_response(403)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(b"Forbidden")
                return

    server_address = ('', 8088)
    httpd = ThreadingHTTPServer(server_address, CustomHandler)
    # print("API server listening *:8088")
    httpd.serve_forever()


# 在一个单独的线程中启动 HTTP 服务器
threading.Thread(target=start_http_server, daemon=True).start()
