import http.server
import socketserver
import signal
import sys

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

PORT = 8000
Handler = NoCacheHTTPRequestHandler

PORT = 8000

def signal_handler(sig, frame):
    print("\nStopping server...")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")
    httpd.serve_forever()