#!/usr/bin/env python3
"""
Simple local static file server for CyberVerse: The Safe Click Challenge.

Usage:
    python3 server.py
Then open: http://localhost:8000
"""
import http.server
import socketserver

PORT = 8000

Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"CyberVerse server running at http://localhost:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
