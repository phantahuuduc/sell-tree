#!/usr/bin/env python3
"""Static server phát file với header no-cache — tránh trình duyệt chạy JS/CSS cũ khi dev."""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Strip query string trước khi tìm file (detail.html?id=1 -> detail.html)
        from urllib.parse import urlparse
        path = urlparse(path).path
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    # ThreadingHTTPServer: xử lý nhiều kết nối song song (ES modules tải cùng lúc)
    server = http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler)
    print(f"No-cache static server on http://localhost:{PORT}")
    server.serve_forever()
