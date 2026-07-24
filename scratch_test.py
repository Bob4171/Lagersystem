import urllib.request
import urllib.parse
import re

def test_bing_headers(user_agent, accept_lang="da,en-US;q=0.9,en;q=0.8"):
    q = "booster"
    url = f"https://www.bing.com/images/search?q={urllib.parse.quote(q)}+product+png"
    req = urllib.request.Request(url)
    req.add_header('User-Agent', user_agent)
    req.add_header('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8')
    req.add_header('Accept-Language', accept_lang)
    req.add_header('Referer', 'https://www.bing.com/')
    
    try:
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
            urls = re.findall(r'"murl"\s*:\s*"(https?://[^"]+?)"', html)
            if not urls:
                urls = re.findall(r'mediaurl=(https?://[^&"]+)', html)
            print(f"UA: {user_agent[:40]}... - Found {len(urls)} urls.")
            return len(urls) > 0
    except Exception as e:
        print(f"Error: {e}")
        return False

# Test standard desktop Chrome UA
test_bing_headers("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

# Test Safari Mobile UA
test_bing_headers("Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1")

# Test a generic bot UA (sometimes they serve basic HTML)
test_bing_headers("Wget/1.21.1-3 (linux-gnu)")
