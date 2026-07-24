import http.server
import socketserver
import os
import time
import json
import urllib.parse
import sys
import socket
import urllib.request
import urllib.error
import queue
import threading

# Thread-safe session management for mobile remote scanning
sessions = {}
sessions_lock = threading.Lock()

PORT = int(os.environ.get("PORT", 8000))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def get_last_modified():
    max_mtime = 0
    for root, dirs, files in os.walk(DIRECTORY):
        if ".git" in root or "__pycache__" in root or ".gemini" in root:
            continue
        for f in files:
            if f == "dev_server.py":
                continue
            path = os.path.join(root, f)
            try:
                mtime = os.path.getmtime(path)
                if mtime > max_mtime:
                    max_mtime = mtime
            except OSError:
                pass
    return max_mtime

class LiveReloadHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        
        # Proxy Search Request
        if parsed_url.path == '/proxy/search':
            query_string = parsed_url.query
            url = f"https://world.openfoodfacts.org/cgi/search.pl?{query_string}"
            req = urllib.request.Request(url, headers={
                'User-Agent': 'WarehouseFlow - Web - Version 1.0 - contact@warehouseflow.com'
            })
            try:
                with urllib.request.urlopen(req) as response:
                    data = response.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
            return

        # Proxy Product Details Request
        if parsed_url.path.startswith('/proxy/product/'):
            barcode = parsed_url.path.split('/')[-1]
            url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}"
            req = urllib.request.Request(url, headers={
                'User-Agent': 'WarehouseFlow - Web - Version 1.0 - contact@warehouseflow.com'
            })
            try:
                with urllib.request.urlopen(req) as response:
                    data = response.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(data)
            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(e.read())
            except Exception as e:
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
            return

        # 2b. Find Image from Multiple Sources (OpenFoodFacts, Yahoo Images, Bing Images)
        if parsed_url.path == '/proxy/find_image':
            query = urllib.parse.parse_qs(parsed_url.query)
            q = query.get('q', [''])[0]
            if not q:
                self.send_response(400)
                self.end_headers()
                return
            
            clean_urls = []
            
            # Phase 1: Try OpenFoodFacts (highly relevant for grocery/drink items like 'booster')
            try:
                off_url = f"https://world.openfoodfacts.org/cgi/search.pl?search_terms={urllib.parse.quote(q)}&search_simple=1&action=process&json=1&page_size=10"
                off_req = urllib.request.Request(off_url, headers={
                    'User-Agent': 'WarehouseFlow - Web - Version 1.0 - contact@warehouseflow.com'
                })
                with urllib.request.urlopen(off_req, timeout=3) as off_res:
                    off_data = json.loads(off_res.read().decode('utf-8'))
                    for p in off_data.get('products', []):
                        img = p.get('image_front_url') or p.get('image_url') or p.get('image_front_thumb_url')
                        if img:
                            clean_urls.append(img)
            except Exception as e:
                print(f"OpenFoodFacts lookup failed: {e}")
                
            # Phase 2: Try Yahoo Images (great fallback for general items, doesn't block bots)
            try:
                yahoo_url = f"https://images.search.yahoo.com/search/images?p={urllib.parse.quote(q)}"
                yahoo_req = urllib.request.Request(yahoo_url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                })
                with urllib.request.urlopen(yahoo_req, timeout=3) as yahoo_res:
                    html = yahoo_res.read().decode('utf-8')
                    import re
                    yahoo_urls = re.findall(r'"ou"\s*:\s*"([^"]+?)"', html)
                    for u in yahoo_urls:
                        u_clean = u.replace('\\/', '/').replace('&amp;', '&')
                        if u_clean not in clean_urls and any(ext in u_clean.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                            clean_urls.append(u_clean)
            except Exception as e:
                print(f"Yahoo Images lookup failed: {e}")
                
            # Phase 3: Try Bing (if list is still short)
            if len(clean_urls) < 5:
                try:
                    bing_url = f"https://www.bing.com/images/search?q={urllib.parse.quote(q)}+product+png"
                    bing_req = urllib.request.Request(bing_url, headers={
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    })
                    with urllib.request.urlopen(bing_req, timeout=3) as bing_res:
                        html = bing_res.read().decode('utf-8')
                        import re
                        bing_urls = re.findall(r'"murl"\s*:\s*"(https?://[^"]+?)"', html)
                        for u in bing_urls:
                            u_clean = u.replace('\\/', '/').replace('&amp;', '&')
                            if u_clean not in clean_urls and any(ext in u_clean.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                                clean_urls.append(u_clean)
                except Exception as e:
                    print(f"Bing Images lookup failed: {e}")
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"urls": clean_urls[:15]}).encode('utf-8'))
            return

        # 2c. Image CORS Proxy
        if parsed_url.path == '/proxy/image':
            query = urllib.parse.parse_qs(parsed_url.query)
            img_url = query.get('url', [''])[0]
            if not img_url:
                self.send_response(400)
                self.end_headers()
                return
            
            # Request the image
            req = urllib.request.Request(img_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            })
            try:
                with urllib.request.urlopen(req, timeout=5) as response:
                    data = response.read()
                    content_type = response.headers.get('Content-Type', 'image/jpeg')
                    
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
            return

        # 2d. Mobile Session: Register (PC client registers pairing code)
        if parsed_url.path == '/proxy/session/register':
            query = urllib.parse.parse_qs(parsed_url.query)
            code = query.get('code', [''])[0]
            if not code:
                self.send_response(400)
                self.end_headers()
                return
            
            with sessions_lock:
                sessions[code] = {
                    "queue": queue.Queue(),
                    "active": True,
                    "timestamp": time.time()
                }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "registered"}).encode('utf-8'))
            return

        # 2e. Mobile Session: Wait (PC client long-polls for scans)
        if parsed_url.path == '/proxy/session/wait':
            query = urllib.parse.parse_qs(parsed_url.query)
            code = query.get('code', [''])[0]
            if not code:
                self.send_response(400)
                self.end_headers()
                return
            
            sess = None
            with sessions_lock:
                sess = sessions.get(code)
            
            if not sess:
                self.send_response(404)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "session_not_found"}).encode('utf-8'))
                return
            
            try:
                # Wait for up to 25 seconds for a mobile scan event
                barcode = sess["queue"].get(timeout=25)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "scanned", "barcode": barcode}).encode('utf-8'))
            except queue.Empty:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "timeout"}).encode('utf-8'))
            return

        # 2f. Mobile Session: Connect (Mobile checks pairing code validity)
        if parsed_url.path == '/proxy/session/connect':
            query = urllib.parse.parse_qs(parsed_url.query)
            code = query.get('code', [''])[0]
            if not code:
                self.send_response(400)
                self.end_headers()
                return
            
            exists = False
            with sessions_lock:
                exists = code in sessions
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            if exists:
                self.wfile.write(json.dumps({"status": "connected"}).encode('utf-8'))
            else:
                self.wfile.write(json.dumps({"status": "invalid_code"}).encode('utf-8'))
            return

        # 2g. Mobile Session: Scan (Mobile pushes scanned barcode to server queue)
        if parsed_url.path == '/proxy/session/scan':
            query = urllib.parse.parse_qs(parsed_url.query)
            code = query.get('code', [''])[0]
            barcode = query.get('barcode', [''])[0]
            if not code or not barcode:
                self.send_response(400)
                self.end_headers()
                return
            
            sess = None
            with sessions_lock:
                sess = sessions.get(code)
            
            if not sess:
                self.send_response(404)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "session_not_found"}).encode('utf-8'))
                return
            
            # Put barcode in queue to wake up the waiting PC thread
            sess["queue"].put(barcode)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "sent"}).encode('utf-8'))
            return

        # Live Reload File Watcher
        if parsed_url.path == '/watch':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            query = urllib.parse.parse_qs(parsed_url.query)
            try:
                client_t = float(query.get('t', [0])[0])
            except (ValueError, IndexError):
                client_t = 0.0
                
            current_t = get_last_modified()
            changed = False
            
            start_time = time.time()
            while time.time() - start_time < 3.0:
                current_t = get_last_modified()
                if current_t > client_t:
                    changed = True
                    break
                time.sleep(0.2)
                
            self.wfile.write(json.dumps({
                "changed": changed,
                "timestamp": current_t
            }).encode('utf-8'))
            return

        return super().do_GET()

def run_server():
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    local_ip = get_local_ip()
    with socketserver.ThreadingTCPServer(("", PORT), LiveReloadHandler) as httpd:
        print(f"Serving WarehouseFlow at:")
        print(f"  -> Localhost:  http://localhost:{PORT}")
        print(f"  -> Network:    http://{local_ip}:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            sys.exit(0)

if __name__ == "__main__":
    run_server()
