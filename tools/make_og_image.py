"""
Creates site/og-image.png (1200x630), the card shown when a link to the site is shared on X, WhatsApp, etc.
Run:  .venv\\Scripts\\python.exe Solyrae_Web\\tools\\make_og_image.py
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(ROOT / ".browsers"))
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parent.parent / "site"
logo = (SITE / "logo.svg").read_text(encoding="utf-8")

HTML = f"""<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
*{{margin:0;box-sizing:border-box}}
body{{width:1200px;height:630px;background:#0A0B1E;color:#ECEBF7;font-family:Inter,sans-serif;position:relative;overflow:hidden}}
.glow{{position:absolute;right:-180px;top:-200px;width:700px;height:700px;border-radius:50%;background:radial-gradient(circle,rgba(245,185,74,.22),rgba(245,185,74,0) 65%)}}
.wrap{{position:absolute;left:84px;top:0;bottom:0;right:84px;display:flex;flex-direction:column;justify-content:center}}
.brand{{display:flex;align-items:center;gap:22px;margin-bottom:34px}}
.brand svg{{width:92px;height:92px}}
.brand span{{font-family:Fraunces,serif;font-weight:700;font-size:64px;letter-spacing:-.01em}}
h1{{font-family:Fraunces,serif;font-weight:600;font-size:60px;line-height:1.08;max-width:960px}}
h1 em{{color:#F5B94A;font-style:italic}}
p{{margin-top:26px;font-size:27px;color:#9A9DC4;max-width:900px;line-height:1.4}}
.tag{{position:absolute;left:84px;bottom:40px;font-family:'JetBrains Mono',monospace;font-weight:500;font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:#F5B94A}}
</style></head><body><div class="glow"></div>
<div class="wrap">
  <div class="brand">{logo}<span>SoLyrae</span></div>
  <h1>An independent Solana validator that <em>publishes</em> its numbers.</h1>
  <p>Live performance, rewards and decentralization data, and an explorer for every validator.</p>
</div>
<div class="tag">solyrae.com</div>
</body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1200, "height": 630})
    pg.set_content(HTML, wait_until="networkidle")
    pg.wait_for_timeout(800)
    pg.screenshot(path=str(SITE / "og-image.png"))
    b.close()
print("written", SITE / "og-image.png")
