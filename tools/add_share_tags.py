"""
Adds the sharing tags (Open Graph and X card) to every page of the site, and writes sitemap.xml and robots.txt.
Safe to run again: pages that already have the tags are skipped, and sitemap.xml and robots.txt are rewritten.
Run:  .venv\\Scripts\\python.exe Solyrae_Web\\tools\\add_share_tags.py
"""
import re
from datetime import datetime
from pathlib import Path

BASE = "https://www.solyrae.com"   # the website registered for the validator
SITE = Path(__file__).resolve().parent.parent / "site"
IMAGE = f"{BASE}/og-image.png"

pages = sorted(SITE.rglob("*.html"))
urls = []
for f in pages:
    rel = f.relative_to(SITE).as_posix()
    url = BASE + "/" + ("" if rel == "index.html" else rel)
    urls.append((url, datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d"), rel))
    t = f.read_text(encoding="utf-8")
    if 'property="og:title"' in t:
        continue
    title = re.search(r"<title>(.*?)</title>", t, re.S)
    desc = re.search(r'<meta name="description" content="(.*?)"', t, re.S)
    if not title or not desc:
        print("skipped (no title or description):", rel)
        continue
    tags = (
        f'<link rel="canonical" href="{url}">\n'
        f'<meta property="og:type" content="website">\n'
        f'<meta property="og:site_name" content="SoLyrae">\n'
        f'<meta property="og:title" content="{title.group(1).strip()}">\n'
        f'<meta property="og:description" content="{desc.group(1).strip()}">\n'
        f'<meta property="og:url" content="{url}">\n'
        f'<meta property="og:image" content="{IMAGE}">\n'
        f'<meta property="og:image:width" content="1200">\n'
        f'<meta property="og:image:height" content="630">\n'
        f'<meta name="twitter:card" content="summary_large_image">\n'
        f'<meta name="twitter:site" content="@SoLyrae_Solana">\n'
    )
    f.write_text(t.replace("</head>", tags + "</head>", 1), encoding="utf-8")
    print("tags added:", rel)

# sitemap: home first, then the rest
urls.sort(key=lambda u: (u[2] != "index.html", u[2]))
xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for url, last, _ in urls:
    xml.append(f"  <url><loc>{url}</loc><lastmod>{last}</lastmod></url>")
xml.append("</urlset>")
(SITE / "sitemap.xml").write_text("\n".join(xml) + "\n", encoding="utf-8")
(SITE / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n", encoding="utf-8")
print(f"sitemap.xml with {len(urls)} pages and robots.txt written")
