import mitmproxy.http
import json
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import random
import string
import time


class ExtractSetCookie:
    def __init__(self):
        self.cookies = {}
        self._lock = threading.Lock()
        self._last_dump_ms = 0

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

            self.cookies[biz] = {
                "url": url,
                "cookie": cookie_val,
                "set_cookie": effective_set_cookie,
                "timestamp": timestamp,
            }
            self._dump_to_file()

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


addons = [
    ExtractSetCookie(),
]

# 生成一个长度为36的随机字符串作为会话密钥
session_key = ''.join(random.choices(string.ascii_letters + string.digits, k=32))
print(f"本次会话的密钥: {session_key}")


# 创建一个简单的 HTTP 服务器来提供 credentials.json 文件
def start_http_server():
    class CustomHandler(SimpleHTTPRequestHandler):
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
            print(self.path)
            auth_header = self.headers.get("Authorization")
            if auth_header != session_key:
                self.send_response(401)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(b"Unauthorized")
                return

            if self.path == "/authorize":
                self.send_response(200)
                self.end_headers()
                return
            elif self.path == "/credentials":
                self.path = "/credentials.json"
                return SimpleHTTPRequestHandler.do_GET(self)
            else:
                self.send_response(403)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(b"Forbidden")
                return

    server_address = ('', 8088)
    httpd = HTTPServer(server_address, CustomHandler)
    # print("API server listening *:8088")
    httpd.serve_forever()


# 在一个单独的线程中启动 HTTP 服务器
threading.Thread(target=start_http_server, daemon=True).start()
