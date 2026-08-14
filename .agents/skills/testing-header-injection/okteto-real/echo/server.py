"""Echoes the request headers it received, for the document and for an XHR.

Used to verify which hosts the browser extension injects the baggage header
into. See ../../SKILL.md.
"""

import json
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from string import Template

PAGE = Template(Path(__file__).with_name("index.html").read_text())


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _received_headers(self):
        return {k.lower(): v for k, v in self.headers.items()}

    def _send(self, body, content_type):
        payload = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        headers = self._received_headers()

        if self.path.startswith("/echo"):
            self._send(json.dumps({"headers": headers}), "application/json")
            return

        baggage = headers.get("baggage", "(ABSENT)")
        self._send(
            PAGE.substitute(
                host=escape(self.headers.get("Host", "?")),
                baggage=escape(baggage),
                cls="no" if baggage == "(ABSENT)" else "yes",
                all=escape(json.dumps(headers, indent=2)),
            ),
            "text/html",
        )

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
