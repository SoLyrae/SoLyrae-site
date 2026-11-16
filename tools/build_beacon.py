"""
SoLyrae Beacon collector.

Reads public security sources, scores every item and writes:
  site/data/beacon.json            everything the Beacon page shows
  site/feeds/beacon.atom           all items (Atom)
  site/feeds/beacon-<part>.atom    one feed per component
  site/feeds/beacon.json           JSON Feed 1.1 with all items
and once a day emails the new alerts to the Beacon lists in Brevo (tools/beacon_email.py; needs BREVO_API_KEY).

Sources (all public, no key needed; an NVD key is optional and only adds CVSS scores):
  - OSV scan of the exact dependency list (Cargo.lock) of the latest Agave and Jito releases
  - Ubuntu security notices, Debian security advisories
  - CISA Known Exploited Vulnerabilities (KEV)
  - Anza blog posts about security
  - FIRST EPSS (exploit probability), GitHub releases (version board), Vortex (minimum versions required by the SFDP)

Run:  .venv\\Scripts\\python.exe Solyrae_Web\\tools\\build_beacon.py
"""
import json, os, re, sys, time, html, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from pathlib import Path

def load_env():
    """Reads KEY=VALUE lines from the project's .env (local runs). On GitHub the key comes from a secret instead."""
    f = Path(__file__).resolve().parents[2] / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
BASE = "https://www.solyrae.com"
SITE = Path(__file__).resolve().parent.parent / "site"
DATA = SITE / "data" / "beacon.json"
FEEDS = SITE / "feeds"
UA = {"User-Agent": "solyrae-beacon/1.0 (+https://www.solyrae.com/beacon.html)"}
NVD_KEY = os.environ.get("NVD_API_KEY", "").strip()
NOW = datetime.now(timezone.utc)

COMPONENTS = {
    "agave": "Agave", "jito": "Jito", "firedancer": "Firedancer", "rust": "Rust crates",
    "kernel": "Linux kernel", "ubuntu": "Ubuntu", "debian": "Debian",
    "openssl": "OpenSSL", "openssh": "OpenSSH", "systemd": "systemd", "docker": "Docker",
}
LEVELS = ["critical", "high", "watch", "info"]
SOURCES_LOG = []


# ---------------------------------------------------------------- helpers
def fetch(url, data=None, headers=None, tries=3, timeout=60):
    h = dict(UA)
    if headers:
        h.update(headers)
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 503):
                time.sleep(min(30, 5 * (k + 1)))
                continue
            if e.code == 404:
                return None
            time.sleep(2 * (k + 1))
        except Exception as e:
            last = e
            time.sleep(2 * (k + 1))
    print("  failed:", url, last, file=sys.stderr)
    return None


def get_json(url, body=None, headers=None):
    raw = fetch(url, data=json.dumps(body).encode() if body is not None else None,
                headers={**(headers or {}), **({"Content-Type": "application/json"} if body is not None else {})})
    return json.loads(raw.decode("utf-8")) if raw else None


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_dt(s):
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%fZ", "%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z", "%Y-%m-%d"):
        try:
            d = datetime.strptime(s, fmt)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def text(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def trunc(s, n=420):
    """Shorten at a word boundary."""
    s = s or ""
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0].rstrip(".,;:") + "…"


def us_day(s):
    """'2026-11-12' -> 'Nov 12, 2026' (US format used across the site)."""
    try:
        d = datetime.strptime(str(s)[:10], "%Y-%m-%d")
        return d.strftime("%b ") + str(d.day) + d.strftime(", %Y")
    except Exception:
        return "n/a"


def plain(s):
    """Removes Markdown marks that some advisories use (`code`, **bold**, [text](link), # headings)."""
    s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s or "")
    s = re.sub(r"(?m)^\s*#+\s*", "", s)
    s = s.replace("`", "").replace("**", "").replace("__", "").replace("\\_", "_")
    return re.sub(r"\s+", " ", s).strip()


def log(name, url, ok, count):
    SOURCES_LOG.append({"name": name, "url": url, "ok": ok, "count": count})
    print(f"{'ok ' if ok else 'ERR'} {name}: {count}")


CVE_RE = re.compile(r"CVE-\d{4}-\d{4,}")


def cvss3_score(vector):
    """Base score of a CVSS v3.x vector."""
    try:
        m = dict(p.split(":") for p in vector.split("/")[1:])
        av = {"N": .85, "A": .62, "L": .55, "P": .2}[m["AV"]]
        ac = {"L": .77, "H": .44}[m["AC"]]
        scope_changed = m["S"] == "C"
        pr = {"N": .85, "L": .68 if scope_changed else .62, "H": .5 if scope_changed else .27}[m["PR"]]
        ui = {"N": .85, "R": .62}[m["UI"]]
        c, i, a = [{"H": .56, "L": .22, "N": 0}[m[x]] for x in ("C", "I", "A")]
        iss = 1 - (1 - c) * (1 - i) * (1 - a)
        imp = 7.52 * (iss - .029) - 3.25 * (iss - .02) ** 15 if scope_changed else 6.42 * iss
        expl = 8.22 * av * ac * pr * ui
        if imp <= 0:
            return 0.0
        raw = min(1.08 * (imp + expl), 10) if scope_changed else min(imp + expl, 10)
        return round(-(-raw * 10 // 1) / 10, 1)  # round up to one decimal
    except Exception:
        return None


def level_from_cvss(score):
    if score is None:
        return None
    return "critical" if score >= 9 else "high" if score >= 7 else "watch" if score >= 4 else "info"


def bump(level, to):
    """Raise a level to at least `to`."""
    return LEVELS[min(LEVELS.index(level), LEVELS.index(to))]


# ---------------------------------------------------------------- exploitation data
KEV = {}
def load_kev():
    j = get_json("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json")
    if j:
        for v in j.get("vulnerabilities", []):
            KEV[v["cveID"]] = v
    log("CISA KEV", "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", bool(j), len(KEV))


EPSS = {}
def load_epss(cves):
    cves = sorted({c for c in cves if c and c not in EPSS})
    for i in range(0, len(cves), 60):
        chunk = cves[i:i + 60]
        j = get_json("https://api.first.org/data/v1/epss?cve=" + ",".join(chunk))
        for r in (j or {}).get("data", []):
            EPSS[r["cve"]] = float(r["epss"])
    log("FIRST EPSS", "https://www.first.org/epss/", True, len(EPSS))


NVD_CACHE_FILE = SITE / "data" / "nvd_cache.json"
NVD = {}
NVD_CALLS = []
def nvd_score(cve):
    """CVSS from NVD. Only used when a key is available (free key: 50 requests per 30 s)."""
    if not NVD_KEY:
        return None
    if cve in NVD:
        return NVD[cve]
    j = get_json(f"https://services.nvd.nist.gov/rest/json/cves/2.0?cveId={cve}", headers={"apiKey": NVD_KEY})
    NVD_CALLS.append(cve)
    time.sleep(0.7)
    score = None
    try:
        m = j["vulnerabilities"][0]["cve"]["metrics"]
        for k in ("cvssMetricV31", "cvssMetricV40", "cvssMetricV30"):
            if k in m:
                score = m[k][0]["cvssData"]["baseScore"]
                break
    except Exception:
        pass
    NVD[cve] = score
    return score


# ---------------------------------------------------------------- source 1: dependency scan
def latest_release(repo, pattern):
    raw = fetch(f"https://github.com/{repo}/releases.atom")
    if not raw:
        return None, []
    ns = {"a": "http://www.w3.org/2005/Atom"}
    entries = []
    for e in ET.fromstring(raw).findall("a:entry", ns):
        link = e.find("a:link", ns).get("href")
        tag = link.rsplit("/", 1)[-1]
        entries.append({"title": e.find("a:title", ns).text or "", "tag": tag, "updated": e.find("a:updated", ns).text, "link": link})
    for e in entries:
        if re.search(pattern, e["tag"]):
            return e, entries
    return None, entries


def scan_lock(repo, tag):
    raw = fetch(f"https://raw.githubusercontent.com/{repo}/{tag}/Cargo.lock", timeout=120)
    if not raw:
        return {}
    lock = raw.decode("utf-8", "replace")
    pk = re.findall(r'\[\[package\]\]\r?\nname = "([^"]+)"\r?\nversion = "([^"]+)"\r?\n(?:source = "([^"]+)")?', lock)
    crates = sorted({(n, v) for n, v, s in pk if s.startswith("registry+")})
    hits = {}
    for i in range(0, len(crates), 500):
        chunk = crates[i:i + 500]
        res = get_json("https://api.osv.dev/v1/querybatch", {"queries": [{"package": {"name": n, "ecosystem": "crates.io"}, "version": v} for n, v in chunk]})
        for (n, v), r in zip(chunk, (res or {}).get("results", [])):
            for vul in r.get("vulns", []):
                hits.setdefault(vul["id"], []).append(f"{n} {v}")
    print(f"  {repo} {tag}: {len(crates)} crates, {len(hits)} advisories")
    return hits


def audit_notes(repo, tag):
    """The client team's own assessment of known advisories: the `--ignore` entries of ci/do-audit.sh at that release,
    with the reason written above each one (e.g. "# Agave Ok: build-time only ..."). Returns {advisory id: reason}."""
    raw = fetch(f"https://raw.githubusercontent.com/{repo}/{tag}/ci/do-audit.sh")
    if not raw:
        return {}
    notes, block = {}, []
    for line in raw.decode("utf-8", "replace").splitlines():
        s = line.strip()
        if s.startswith("#"):
            block.append(s.lstrip("#").strip())
            continue
        m = re.search(r"--ignore\s+((?:RUSTSEC|GHSA)-[\w-]+)", s)
        if m:
            # keep the free-text explanation; drop the standard header fields cargo-audit prints (Crate, Version, Title...)
            header = ("Crate:", "Version:", "Title:", "Date:", "ID:", "URL:", "Solution:", "Warning:")
            reason = []
            for c in block:
                if not c or c.startswith(header):
                    continue
                reason.append(re.sub(r"^[\w ]+ Ok:\s*", "", c))
            notes[m.group(1)] = " ".join(reason).strip()
            block = []
        elif not s:
            block = []
    print(f"  {repo} {tag}: {len(notes)} advisories assessed in ci/do-audit.sh")
    return notes


OSV_CACHE = {}
def osv(id_):
    if id_ not in OSV_CACHE:
        OSV_CACHE[id_] = get_json(f"https://api.osv.dev/v1/vulns/{id_}")
        time.sleep(0.05)
    return OSV_CACHE[id_]


def dependency_items(clients):
    """clients: {component: (repo, tag, release_url)}"""
    by_adv = {}  # canonical id -> {"clients": set, "crates": set}
    notes = {}   # component -> {advisory id: the client team's reason for ignoring it}
    for comp, (repo, tag, url) in clients.items():
        notes[comp] = audit_notes(repo, tag)
        for vid, crates in scan_lock(repo, tag).items():
            d = by_adv.setdefault(vid, {"clients": {}, "crates": set()})
            d["clients"][comp] = tag
            d["crates"].update(crates)
    items = []
    for vid, d in by_adv.items():
        v = osv(vid)
        if not v:
            continue
        aliases = v.get("aliases", []) or []
        cves = sorted({a for a in aliases + [vid] if a.startswith("CVE-")})
        title = v.get("summary") or v.get("details", "")[:140]
        details = text(v.get("details", ""))
        # severity: CVSS vector, GitHub rating of an alias, or the advisory's own category
        sev = None
        for s in v.get("severity", []) or []:
            if s.get("type", "").startswith("CVSS_V3"):
                sev = level_from_cvss(cvss3_score(s.get("score", "")))
        if not sev:
            rating = (v.get("database_specific") or {}).get("severity")
            for a in aliases:
                if rating:
                    break
                if a.startswith("GHSA-"):
                    g = osv(a)
                    rating = ((g or {}).get("database_specific") or {}).get("severity")
            if rating:
                sev = {"CRITICAL": "critical", "HIGH": "high", "MODERATE": "watch", "MEDIUM": "watch", "LOW": "info"}.get(str(rating).upper())
        low = (title + " " + details).lower()
        if not sev:
            if "unmaintained" in low or "no longer maintained" in low or "not maintained" in low:
                sev = "info"
            else:
                sev = "watch"
        fixed = set()
        for a in v.get("affected", []):
            for r in a.get("ranges", []):
                for e in r.get("events", []):
                    if "fixed" in e:
                        fixed.add(e["fixed"])
        comps = ["rust"] + sorted(d["clients"])
        pub = parse_dt(v.get("published")) or NOW
        action = ("Included in the client release. Follow official client updates and guidance." if sev != "info"
                  else "Informational: a dependency of the client release. Follow official client updates and guidance.")
        # the client teams' own assessment wins: if every release that ships the crate marks the advisory as not applicable,
        # Beacon shows their reason and lowers the alert to Info
        ids = {vid, *aliases}
        assessed = {c: next((notes.get(c, {})[i] for i in ids if i in notes.get(c, {})), None) for c in d["clients"]}
        assessed = {c: r for c, r in assessed.items() if r is not None}
        assessment = None
        if assessed:
            # we link to the team's own note instead of quoting it, so their reasoning is never paraphrased wrongly
            teams = " and ".join(COMPONENTS[c] for c in sorted(assessed))
            repo, tag, _ = clients[sorted(assessed)[0]]
            assessment = {"by": teams, "url": f"https://github.com/{repo}/blob/{tag}/ci/do-audit.sh"}
            plural = "s" if len(assessed) > 1 else ""
            if len(assessed) == len(d["clients"]):
                sev = "info"
                action = (f"Already reviewed by the {teams} team{plural}: the release's audit configuration lists this advisory as accepted, "
                          "with the team's reasoning in ci/do-audit.sh. No action needed.")
            else:
                action += f" The {teams} team lists it as accepted in its audit configuration."
        item = {
            "id": vid, "type": "dependency", "title": title, "summary": trunc(details),
            "components": comps, "level": sev, "cves": cves, "published": iso(pub), "updated": iso(parse_dt(v.get("modified")) or pub),
            "affects": "Used by " + ", ".join(f"{COMPONENTS[c]} {t}" for c, t in sorted(d["clients"].items())) + ": " + ", ".join(sorted(d["crates"])[:4]),
            "fixed": ("Fixed in " + ", ".join(sorted(fixed)[:4])) if fixed else "",
            "action": action,
            "source": {"name": "OSV / RustSec" if vid.startswith("RUSTSEC") else "OSV / GitHub", "url": "https://osv.dev/vulnerability/" + vid},
        }
        if assessment:
            item["assessment"] = assessment
        items.append(item)
    return items


# ---------------------------------------------------------------- source 2: operating system notices
RELEVANT = re.compile(r"linux|kernel|openssl|openssh|ssh\b|systemd|docker|containerd|runc|glibc|sudo|polkit|libc6|udev|apparmor|iptables|nftables", re.I)
COMP_BY_NAME = [("kernel", r"linux|kernel"), ("openssl", r"openssl"), ("openssh", r"openssh|\bssh\b"), ("systemd", r"systemd|udev"), ("docker", r"docker|containerd|runc")]


def comps_for(title):
    out = [c for c, p in COMP_BY_NAME if re.search(p, title, re.I)]
    return out or ["kernel"]


def ubuntu_items():
    raw = fetch("https://ubuntu.com/security/notices/rss.xml")
    out = []
    if raw:
        for it in ET.fromstring(raw).iter("item"):
            title = (it.findtext("title") or "").strip()
            m = re.match(r"(USN-\d+-\d+): (.*)", title)
            if not m or not RELEVANT.search(m.group(2)):
                continue
            usn, name = m.group(1), m.group(2)
            desc = text(it.findtext("description"))
            cves = sorted(set(CVE_RE.findall(desc)))
            versions = set()
            v = osv(usn)
            for a in (v or {}).get("affected", []):
                mm = re.match(r"Ubuntu:(\d\d\.\d\d)", (a.get("package") or {}).get("ecosystem", ""))
                if mm:
                    versions.add(mm.group(1))
            vs = sorted(versions)
            out.append({
                "id": usn, "type": "ubuntu", "title": name, "summary": trunc(desc),
                "components": ["ubuntu"] + comps_for(name), "level": "watch", "cves": cves,
                "published": iso(parse_dt(it.findtext("pubDate")) or NOW), "updated": iso(parse_dt(it.findtext("pubDate")) or NOW),
                "affects": ("Ubuntu " + ", ".join(vs)) if vs else "Ubuntu",
                "fixed": "Update the package with apt.", "action": "Run apt update and apt upgrade, then reboot if the kernel changed.",
                "source": {"name": "Ubuntu Security Notices", "url": it.findtext("link")},
            })
    log("Ubuntu security notices", "https://ubuntu.com/security/notices", raw is not None, len(out))
    return out


def debian_items():
    raw = fetch("https://www.debian.org/security/dsa-long")
    out = []
    if raw:
        ns = {"r": "http://purl.org/rss/1.0/", "dc": "http://purl.org/dc/elements/1.1/"}
        for it in ET.fromstring(raw).findall("r:item", ns):
            title = (it.findtext("r:title", namespaces=ns) or "").strip()
            m = re.match(r"(DSA-\d+-\d+) (.*)", title)
            if not m or not RELEVANT.search(m.group(2)):
                continue
            desc = text(it.findtext("r:description", namespaces=ns))
            out.append({
                "id": m.group(1), "type": "debian", "title": m.group(2), "summary": trunc(desc),
                "components": ["debian"] + comps_for(m.group(2)), "level": "watch", "cves": sorted(set(CVE_RE.findall(desc))),
                "published": iso(parse_dt(it.findtext("dc:date", namespaces=ns)) or NOW), "updated": iso(parse_dt(it.findtext("dc:date", namespaces=ns)) or NOW),
                "affects": "Debian stable", "fixed": "Update the package with apt.", "action": "Run apt update and apt upgrade, then reboot if the kernel changed.",
                "source": {"name": "Debian Security Advisories", "url": it.findtext("r:link", namespaces=ns)},
            })
    log("Debian security advisories", "https://www.debian.org/security/", raw is not None, len(out))
    return out


# ---------------------------------------------------------------- source 3: CISA KEV (only the components validators use)
KEV_PAT = re.compile(r"openssh|openssl|linux kernel|systemd|docker|containerd|runc|glibc|sudo|polkit", re.I)
def kev_items():
    out = []
    cutoff = NOW - timedelta(days=365)
    for cve, v in KEV.items():
        label = f"{v.get('vendorProject','')} {v.get('product','')}"
        if not KEV_PAT.search(label):
            continue
        added = parse_dt(v.get("dateAdded")) or NOW
        if added < cutoff:
            continue
        comps = [c for c, p in [("kernel", r"linux kernel"), ("openssl", r"openssl"), ("openssh", r"openssh"), ("systemd", r"systemd"), ("docker", r"docker|containerd|runc")] if re.search(p, label, re.I)] or ["kernel"]
        out.append({
            "id": cve, "type": "kev", "title": v.get("vulnerabilityName") or cve, "summary": trunc(v.get("shortDescription", "")),
            "components": comps, "level": "critical", "cves": [cve], "published": iso(added), "updated": iso(added),
            "affects": label.strip(), "fixed": "", "action": "Update or mitigate as the vendor advises. CISA lists this flaw as exploited in attacks (deadline " + us_day(v.get("dueDate")) + " for US agencies).",
            "source": {"name": "CISA Known Exploited Vulnerabilities", "url": f"https://nvd.nist.gov/vuln/detail/{cve}"},
            "kev": True,
        })
    log("CISA KEV (validator components)", "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", bool(KEV), len(out))
    return out


# ---------------------------------------------------------------- source 4: Anza blog (no RSS, so we read the sitemap)
MONTHS = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"])}
def anza_items():
    out = []
    raw = fetch("https://www.anza.xyz/sitemap.xml")
    if raw:
        urls = re.findall(r"<loc>([^<]+/blog/[^<]+)</loc>", raw.decode("utf-8", "replace"))
        for u in urls:
            slug = u.rsplit("/", 1)[-1]
            if not re.search(r"secur|vulnerab|cve|disclos|root-cause|exploit|incident|outage", slug):
                continue
            page = fetch(u)
            if not page:
                continue
            p = page.decode("utf-8", "replace")
            t = re.search(r'property="og:title" content="([^"]*)"', p)
            d = re.search(r'property="og:description" content="([^"]*)"', p)
            title = html.unescape(t.group(1)).replace(" - Anza", "") if t else slug
            when = None
            mm = re.match(r"(" + "|".join(MONTHS) + r")-(\d{4})", slug)
            if mm:
                when = datetime(int(mm.group(2)), MONTHS[mm.group(1)], 1, tzinfo=timezone.utc)
            out.append({
                "id": "ANZA-" + slug[:60], "type": "anza", "title": title, "summary": html.unescape(d.group(1)) if d else "",
                "components": ["agave"], "level": "watch" if re.search(r"patch|exploit|root-cause|vulnerab|incident|outage|disclos", slug) else "info",
                "cves": [], "published": iso(when) if when else None, "updated": iso(when) if when else None,
                "dateLabel": when.strftime("%b %Y") if when else "Anza blog",
                "affects": "Agave validators", "fixed": "Fixed. Read the post for the versions.", "action": "Read Anza's write-up and check that you run a release that includes the fix.",
                "source": {"name": "Anza blog", "url": u},
            })
    log("Anza blog (security posts)", "https://www.anza.xyz/blog", raw is not None, len(out))
    return out


# ---------------------------------------------------------------- version board
def versions():
    v = {}
    a, _ = latest_release("anza-xyz/agave", r"^v\d+\.\d+\.\d+$")
    j, _ = latest_release("jito-foundation/jito-solana", r"^v\d+\.\d+\.\d+-jito$")
    f, fe = latest_release("firedancer-io/firedancer", r"^v\d+\.\d+\.\d+$")
    fm = next((e for e in fe if "Mainnet" in e["title"]), f)
    for key, e in (("agave", a), ("jito", j), ("firedancer", fm)):
        if e:
            v[key] = {"version": e["tag"], "title": e["title"], "published": e["updated"], "url": e["link"]}
    st = get_json("https://api.vx.tools/validators/status?identity=7Nu9ckgtjobZ3MkbadGFKEvRymYuah9HmcxiUJKMM9NB")
    try:
        v["sfdpMinAgave"] = st["sfdp"]["mainnet"]["current"]["minVersion"]
    except Exception:
        pass
    log("Client releases and SFDP minimum", "https://github.com/anza-xyz/agave/releases", bool(a), len(v))
    return v, a, j


# ---------------------------------------------------------------- source 5: official operator notices
# Notices sent to operators by the core teams (for example in the Solana validator Discord) are not published in a
# machine-readable form, so they are added by hand to tools/official_notices.json, always with a link to the original.
# For every CVE they mention, Beacon follows the patch status on the Ubuntu and Debian trackers automatically.
NOTICES_FILE = Path(__file__).resolve().parent / "official_notices.json"
UBUNTU_LTS = {"resolute": "Ubuntu 26.04 LTS", "noble": "Ubuntu 24.04 LTS", "jammy": "Ubuntu 22.04 LTS", "focal": "Ubuntu 20.04 LTS"}
DEBIAN_REL = {"trixie": "Debian 13", "bookworm": "Debian 12"}


def ubuntu_patch(cve):
    j = get_json(f"https://ubuntu.com/security/cves/{cve}.json")
    out = []
    for p in (j or {}).get("packages", []):
        if p.get("name") != "linux":
            continue
        st = {s["release_codename"]: s for s in p.get("statuses", [])}
        for code, label in UBUNTU_LTS.items():
            s = st.get(code)
            if not s or s.get("status") == "DNE":
                continue
            status = s.get("status")
            if status == "released":
                out.append({"distro": label, "status": "fixed", "detail": f"Fixed in linux {s.get('description', '')}".strip()})
            elif status == "not-affected":
                out.append({"distro": label, "status": "not-affected", "detail": "Not affected"})
            elif status == "ignored":
                out.append({"distro": label, "status": "no-fix", "detail": "No fix planned" + (f" ({s['description']})" if s.get("description") else "")})
            else:
                out.append({"distro": label, "status": "pending", "detail": "Fix not released yet"})
    return out


def debian_patch(cve):
    raw = fetch(f"https://security-tracker.debian.org/tracker/{cve}")
    if not raw:
        return []
    page = raw.decode("utf-8", "replace")
    part = page.split("Vulnerable and fixed packages", 1)[-1].split("</table>", 1)[0]
    rel = {}
    for row in re.findall(r"<tr>(.*?)</tr>", part, re.S):
        cells = [text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) < 4:
            continue
        base = cells[1].replace("(security)", "").strip()
        if base in DEBIAN_REL:
            if cells[3] == "fixed":
                rel[base] = ("fixed", cells[2])
            else:
                rel.setdefault(base, ("pending", cells[2]))
    return [{"distro": DEBIAN_REL[b], "status": s, "detail": (f"Fixed in linux {v}" if s == "fixed" else "Fix not released yet")}
            for b, (s, v) in sorted(rel.items(), key=lambda x: x[0] != "trixie")]


# ---------------------------------------------------------------- source 6: Linux kernel CVEs that touch what a validator exposes
# The kernel publishes hundreds of CVEs a month (848 in the 30 days to Nov 16, 2026), most for hardware or features a
# validator does not use, and NVD often scores them weeks later. Beacon keeps only those in the parts a validator exposes
# to the internet (TCP/UDP/IP, core networking, XDP used by Firedancer, and the network cards common in servers) whose
# description points to a crash or memory-safety bug. It is a filter, so it can miss or over-include: the method page says so.
KERNEL_DAYS = 45
KERNEL_PART = re.compile(r"^(tcp|udp|inet|inet6|ipv4|ipv6|ip|ip6|net: (core|skbuff|sock|gro|gso|dev|tcp|udp|ipv4|ipv6)|xdp|xsk|af_xdp|"
                         r"net/mlx5e?|mlx5e?|net: mlx5e?|ice|net: ice|i40e|bnxt|bnxt_en|net: bnxt)\b", re.I)
KERNEL_SKIP = re.compile(r"\b(sr|seg6|ipsec|xfrm|tunnel|gre|vxlan|bridge|openvswitch|sched|smc|rds|mptcp|bluetooth|wifi|sctp|tipc|nfc|can)\b", re.I)
KERNEL_BUG = re.compile(r"use-after-free|\bUAF\b|NULL pointer|null-ptr|out-of-bounds|\bOOB\b|overflow|panic|crash|double free|memory corruption|underflow", re.I)


def kernel_items():
    if not NVD_KEY:
        log("NVD Linux kernel CVEs (network filter)", "https://nvd.nist.gov/", False, 0)
        return []
    end = NOW
    start = end - timedelta(days=KERNEL_DAYS)
    fmt = "%Y-%m-%dT%H:%M:%S.000"
    vulns, idx, ok = [], 0, True
    while True:
        j = get_json("https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=Linux%20kernel"
                     f"&pubStartDate={start.strftime(fmt)}&pubEndDate={end.strftime(fmt)}&resultsPerPage=2000&startIndex={idx}",
                     headers={"apiKey": NVD_KEY})
        if not j:
            ok = False
            break
        vulns += j.get("vulnerabilities", [])
        idx += len(j.get("vulnerabilities", []))
        if idx >= j.get("totalResults", 0) or not j.get("vulnerabilities"):
            break
        time.sleep(1)
    out = []
    for v in vulns:
        c = v["cve"]
        desc = next((d["value"] for d in c.get("descriptions", []) if d.get("lang") == "en"), "")
        if not desc.startswith("In the Linux kernel"):
            continue
        m = re.search(r"resolved:\s*\n\s*\n?\s*([^\n]+)", desc)
        head = (m.group(1) if m else "").strip()
        if not KERNEL_PART.match(head) or KERNEL_SKIP.search(head) or not KERNEL_BUG.search(desc):
            continue
        score = None
        for k in ("cvssMetricV31", "cvssMetricV40", "cvssMetricV30"):
            if k in c.get("metrics", {}):
                score = c["metrics"][k][0]["cvssData"]["baseScore"]
                break
        NVD[c["id"]] = score
        body = desc.split(head, 1)[-1].strip()
        part = head.split(":")[0].strip()
        nic = re.match(r"(net/)?(mlx5e?|ice|i40e|bnxt)", part, re.I) or "net: mlx5" in head.lower() or "net: ice" in head.lower() or "net: bnxt" in head.lower()
        patch = ubuntu_patch(c["id"]) + debian_patch(c["id"])
        fixed = [p["distro"] for p in patch if p["status"] == "fixed"]
        out.append({
            "id": c["id"], "type": "kernel", "title": "Linux kernel: " + head, "summary": trunc(body),
            "components": ["kernel"], "level": "watch", "cves": [c["id"]],
            "published": iso(parse_dt(c.get("published", "")[:19] + "Z") or NOW), "updated": iso(parse_dt(c.get("lastModified", "")[:19] + "Z") or NOW),
            "affects": "Linux kernel, " + ("network card driver" if nic else "network stack") + f" ({part})",
            "fixed": ("Fixed kernels available for " + ", ".join(fixed) + ".") if fixed else "",
            "action": "Check your distribution's security notice for this CVE and plan a kernel update and reboot once a fix is available.",
            "note": "Selected automatically because it affects a part of the kernel that validators expose to the network. It may not affect every setup; confirm in the linked source.",
            "source": {"name": "NVD (Linux kernel CVE)", "url": f"https://nvd.nist.gov/vuln/detail/{c['id']}"},
            "patch": patch, "kernelWatch": True, **({"cvss": score} if score else {}),
        })
        time.sleep(0.2)
    log("NVD Linux kernel CVEs (network filter)", "https://nvd.nist.gov/", ok, len(out))
    return out


def notice_items():
    try:
        notices = json.loads(NOTICES_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        print("  official notices not read:", e, file=sys.stderr)
        notices = []
    out = []
    for n in notices:
        patch = []
        for cve in n.get("cves", []):
            patch += ubuntu_patch(cve) + debian_patch(cve)
        fixed = [p["distro"] for p in patch if p["status"] == "fixed"]
        pending = [p["distro"] for p in patch if p["status"] == "pending"]
        fix_txt = ""
        if patch:
            fix_txt = ("Patched kernels available for " + ", ".join(fixed) + "." if fixed else "") + \
                      (" Not yet released for " + ", ".join(pending) + "." if pending else "")
        out.append({
            "id": n["id"], "type": "notice", "title": n["title"], "summary": n.get("summary", ""),
            "components": n.get("components", ["kernel"]), "level": "critical", "cves": n.get("cves", []),
            "published": iso(parse_dt(n.get("published")) or NOW), "updated": iso(NOW),
            "affects": n.get("affects", ""), "fixed": fix_txt.strip(), "action": n.get("action", ""),
            "source": n["source"], "official": True, "patch": patch,
        })
    log("Official operator notices", "https://www.solyrae.com/methodology.html", True, len(out))
    return out


def link_notices(items):
    """Distribution updates that fix a CVE named in an official notice become critical and say so."""
    flagged = {c: i["title"] for i in items if i["type"] == "notice" for c in i.get("cves", [])}
    # a kernel CVE that already has an official notice is shown once, as the notice
    items = [it for it in items if not (it["type"] == "kernel" and set(it.get("cves", [])) & set(flagged))]
    for it in items:
        if it["type"] in ("ubuntu", "debian"):
            hit = sorted(set(it.get("cves", [])) & set(flagged))
            if hit:
                it["level"] = "critical"
                it["action"] = it["action"] + f" This update fixes {', '.join(hit)}, which an official operator notice asks validators to patch urgently."
    return items


# ---------------------------------------------------------------- scoring and output
def finish(items):
    cves = [c for i in items for c in i.get("cves", [])]
    load_epss(cves)
    for it in items:
        kev = [c for c in it.get("cves", []) if c in KEV]
        eps = max([EPSS.get(c, 0) for c in it.get("cves", [])] or [0])
        if kev:
            it["kev"] = True
            it["level"] = bump(it["level"], "critical" if it["type"] != "dependency" else "high")
        if eps:
            it["epss"] = round(eps, 4)
            if eps >= 0.1:
                it["level"] = bump(it["level"], "high")
        if it["type"] == "kernel" and it.get("cvss"):
            lv = level_from_cvss(it["cvss"])
            if lv and LEVELS.index(lv) < LEVELS.index(it["level"]):
                it["level"] = lv
        if NVD_KEY and it["type"] in ("ubuntu", "debian") and it.get("cves"):
            sc = max([nvd_score(c) or 0 for c in it["cves"][:6]] or [0])
            if sc:
                it["cvss"] = sc
                lv = level_from_cvss(sc)
                if lv and LEVELS.index(lv) < LEVELS.index(it["level"]):
                    it["level"] = lv
    return items


def atom(title, items, self_url, feed_id):
    def esc(s):
        return html.escape(s or "", quote=True)
    updated = max([i.get("updated") or i.get("published") or iso(NOW) for i in items] or [iso(NOW)])
    x = ['<?xml version="1.0" encoding="utf-8"?>', '<feed xmlns="http://www.w3.org/2005/Atom">',
         f"<title>{esc(title)}</title>", f'<link href="{BASE}/beacon.html"/>', f'<link rel="self" href="{self_url}"/>',
         f"<id>{feed_id}</id>", f"<updated>{updated}</updated>", "<author><name>SoLyrae Beacon</name></author>"]
    for i in items[:80]:
        when = i.get("updated") or i.get("published") or iso(NOW)
        body = f"[{i['level'].upper()}] {i['summary']} {i.get('affects','')}. {i.get('action','')} Source: {i['source']['url']}"
        x.append(f"<entry><title>{esc('[' + i['level'].upper() + '] ' + i['title'])}</title><id>tag:solyrae.com,2026:beacon:{esc(i['id'])}</id>"
                 f'<link href="{esc(i["source"]["url"])}"/><updated>{when}</updated>'
                 + "".join(f'<category term="{esc(c)}"/>' for c in i["components"])
                 + f"<summary>{esc(body)}</summary></entry>")
    x.append("</feed>")
    return "\n".join(x) + "\n"


def main():
    DATA.parent.mkdir(parents=True, exist_ok=True)
    FEEDS.mkdir(parents=True, exist_ok=True)
    prev = {}
    if DATA.exists():
        try:
            for i in json.loads(DATA.read_text(encoding="utf-8")).get("items", []):
                prev[i["id"]] = i
        except Exception:
            pass
    global NVD
    if NVD_CACHE_FILE.exists():
        try:
            NVD = json.loads(NVD_CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            NVD = {}

    load_kev()
    ver, agave, jito = versions()
    clients = {}
    if agave:
        clients["agave"] = ("anza-xyz/agave", agave["tag"], agave["link"])
    if jito:
        clients["jito"] = ("jito-foundation/jito-solana", jito["tag"], jito["link"])
    items = dependency_items(clients)
    log("OSV scan of client dependencies", "https://osv.dev", bool(clients), len(items))
    fresh_os = ubuntu_items() + debian_items()
    items += kev_items() + anza_items() + notice_items()
    fresh_os += kernel_items()

    # Ubuntu and Debian feeds only show the latest entries, and the kernel query covers 45 days,
    # so keep what we already collected (last 400 days)
    cutoff = NOW - timedelta(days=400)
    seen = {i["id"] for i in fresh_os}
    for i in prev.values():
        if i["type"] in ("ubuntu", "debian", "kernel") and i["id"] not in seen:
            d = parse_dt(i.get("published"))
            if d and d >= cutoff:
                fresh_os.append(i)
    items += fresh_os
    items = link_notices(finish(items))
    for i in items:
        i["title"], i["summary"] = plain(i["title"]), plain(i["summary"])
    if NVD_KEY:
        log("NVD (CVSS scores)", "https://nvd.nist.gov/", True, sum(1 for v in NVD.values() if v))
    else:
        print("NVD key not set: CVSS scores skipped (optional)")

    def key(i):
        return (LEVELS.index(i["level"]), "" if not i.get("published") else "".join(chr(255 - ord(c)) for c in i["published"]))
    items.sort(key=key)

    out = {"generatedAt": iso(NOW), "components": COMPONENTS, "versions": ver, "sources": SOURCES_LOG,
           "counts": {l: sum(1 for i in items if i["level"] == l) for l in LEVELS}, "items": items}
    DATA.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    if NVD:
        NVD_CACHE_FILE.write_text(json.dumps(NVD), encoding="utf-8")

    def by_date(i):
        return i.get("updated") or i.get("published") or ""
    ordered = sorted(items, key=by_date, reverse=True)
    (FEEDS / "beacon.atom").write_text(atom("SoLyrae Beacon: all alerts", ordered, f"{BASE}/feeds/beacon.atom", f"{BASE}/feeds/beacon.atom"), encoding="utf-8")
    for c, label in COMPONENTS.items():
        sub = [i for i in ordered if c in i["components"]]
        (FEEDS / f"beacon-{c}.atom").write_text(atom(f"SoLyrae Beacon: {label}", sub, f"{BASE}/feeds/beacon-{c}.atom", f"{BASE}/feeds/beacon-{c}.atom"), encoding="utf-8")
    jf = {"version": "https://jsonfeed.org/version/1.1", "title": "SoLyrae Beacon: all alerts", "home_page_url": f"{BASE}/beacon.html",
          "feed_url": f"{BASE}/feeds/beacon.json",
          "items": [{"id": i["id"], "url": i["source"]["url"], "title": f"[{i['level'].upper()}] {i['title']}", "content_text": f"{i['summary']} {i.get('affects','')}. {i.get('action','')}",
                     "date_published": i.get("published") or iso(NOW), "tags": i["components"]} for i in ordered[:80]]}
    (FEEDS / "beacon.json").write_text(json.dumps(jf, ensure_ascii=False, indent=1), encoding="utf-8")
    import beacon_email
    beacon_email.send_digests(items, COMPONENTS, SITE / "data" / "email_digest.json")
    print(f"done: {len(items)} items, counts {out['counts']}")


if __name__ == "__main__":
    main()
