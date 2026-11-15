"""
SoLyrae Beacon email: Brevo API helper, the two email designs (daily digest and subscription confirmation)
and the daily digest sender used by build_beacon.py.

Needs BREVO_API_KEY (in the project's .env for local runs, a GitHub secret on GitHub). Without it nothing is sent.
Brevo objects are found by name, so nothing secret or account-specific is stored in the code:
  lists:     "Beacon · <Component>"      (one per component, folder "SoLyrae Beacon")
  template:  "Beacon · Confirm subscription"   (double opt-in email)
"""
import html, json, os, sys, urllib.request, urllib.error
from datetime import datetime, timezone

API = "https://api.brevo.com/v3"
BASE = "https://www.solyrae.com"
SENDER = {"name": "SoLyrae Beacon", "email": "info@solyrae.com"}
FOLDER = "SoLyrae Beacon"
LIST_PREFIX = "Beacon · "
CONFIRM_TEMPLATE = "Beacon · Confirm subscription"
DIGEST_LEVELS = ("critical", "high", "watch")
DIGEST_HOUR_UTC = 7          # the first run after this hour sends the day's digest
MAX_ITEMS_PER_EMAIL = 25

# light theme of the site
C = {"bg": "#F5F2EA", "panel": "#FFFFFF", "panel2": "#EFEBE0", "ink": "#15173D", "muted": "#5C5E80", "line": "#D8D3C4",
     "accent": "#9A5806", "accent_bg": "#F5B94A", "accent_ink": "#1B1403"}
LEVEL = {"critical": ("Critical", "#B4372C"), "high": ("High", "#9A5806"), "watch": ("Watch", "#4A3FD0"), "info": ("Info", "#5C5E80")}
SERIF = "Georgia,'Times New Roman',serif"
SANS = "Arial,Helvetica,sans-serif"
MONO = "'Courier New',Courier,monospace"


# ---------------------------------------------------------------- Brevo API
def api(method, path, body=None):
    key = os.environ.get("BREVO_API_KEY", "").strip()
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"api-key": key, "accept": "application/json", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Brevo {method} {path}: HTTP {e.code} {e.read().decode(errors='ignore')[:300]}") from None


def beacon_lists():
    """{list name: list} for the Beacon lists."""
    out, offset = {}, 0
    while True:
        page = api("GET", f"/contacts/lists?limit=50&offset={offset}").get("lists") or []
        for l in page:
            if l["name"].startswith(LIST_PREFIX):
                out[l["name"]] = l
        if len(page) < 50:
            return out
        offset += 50


def find_template(name):
    for t in api("GET", "/smtp/templates?limit=1000").get("templates") or []:
        if t["name"] == name:
            return t
    return None


# ---------------------------------------------------------------- email design
def esc(s):
    return html.escape(str(s or ""), quote=True)


def layout(preheader, kicker, body, footer):
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>SoLyrae Beacon</title></head>
<body style="margin:0;padding:0;background:{C['bg']};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{C['bg']};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
  <tr><td style="padding:0 4px 18px 4px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:12px;"><img src="{BASE}/logo-256.png" width="40" height="40" alt="SoLyrae" style="display:block;border:0;border-radius:50%;"></td>
      <td style="font-family:{SERIF};font-size:22px;font-weight:bold;color:{C['ink']};">SoLyrae <span style="color:{C['accent']};">Beacon</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:{C['panel']};border:1px solid {C['line']};border-radius:10px;padding:28px;">
    <div style="font-family:{MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{C['accent']};">{esc(kicker)}</div>
    {body}
  </td></tr>
  <tr><td style="padding:20px 4px 0 4px;font-family:{SANS};font-size:12px;line-height:1.6;color:{C['muted']};">{footer}</td></tr>
</table>
</td></tr></table>
</body></html>"""


def button(href, label):
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td style="background:{C["accent_bg"]};border-radius:8px;">'
            f'<a href="{href}" style="display:inline-block;padding:13px 24px;font-family:{SANS};font-size:15px;font-weight:bold;color:{C["accent_ink"]};text-decoration:none;">{esc(label)}</a></td></tr></table>')


def alert_block(i):
    name, color = LEVEL.get(i["level"], LEVEL["info"])
    flags = []
    if i.get("kev"):
        flags.append("Exploited in the wild")
    if i.get("epss") is not None and i["epss"] >= 0.01:
        flags.append(f"EPSS {round(i['epss'] * 100)}%")
    if i.get("cvss"):
        flags.append(f"CVSS {i['cvss']}")
    ids = [i["id"]] + [c for c in i.get("cves", []) if c != i["id"]]
    rows = "".join(
        f'<tr><td valign="top" style="padding:3px 12px 3px 0;font-family:{MONO};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:{C["muted"]};white-space:nowrap;">{k}</td>'
        f'<td style="padding:3px 0;font-family:{SANS};font-size:14px;line-height:1.5;color:{C["ink"]};">{esc(i[f])}</td></tr>'
        for k, f in (("Affects", "affects"), ("Fix", "fixed"), ("What to do", "action")) if i.get(f))
    meta = " &middot; ".join([esc(x) for x in flags] + [esc(", ".join(ids[:3]))])
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border:1px solid {C['line']};border-left:4px solid {color};border-radius:8px;">
<tr><td style="padding:16px 18px;">
  <div style="font-family:{MONO};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:{color};">{name}</div>
  <div style="margin-top:6px;font-family:{SERIF};font-size:18px;font-weight:bold;line-height:1.3;"><a href="{esc(i['source']['url'])}" style="color:{C['ink']};text-decoration:none;">{esc(i['title'])}</a></div>
  <div style="margin-top:6px;font-family:{SANS};font-size:14px;line-height:1.55;color:{C['muted']};">{esc(i['summary'])}</div>
  {f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px;">{rows}</table>' if rows else ''}
  <div style="margin-top:10px;font-family:{SANS};font-size:12px;color:{C['muted']};">{meta}</div>
  <div style="margin-top:6px;font-family:{SANS};font-size:13px;"><a href="{esc(i['source']['url'])}" style="color:{C['accent']};">Source: {esc(i['source']['name'])}</a></div>
</td></tr></table>"""


def legal_footer(why):
    return (f"{why} Beacon is a community bulletin by SoLyrae and not an official Solana, Anza, Jito or Firedancer channel. "
            f"Always confirm in the linked source before you act.<br><br>"
            f'<a href="{{{{ unsubscribe }}}}" style="color:{C["muted"]};">Unsubscribe</a> &middot; '
            f'<a href="{BASE}/privacy.html" style="color:{C["muted"]};">Privacy</a> &middot; '
            f'<a href="{BASE}/beacon.html" style="color:{C["muted"]};">Beacon</a>')


def us_date(d):
    return d.strftime("%b ") + str(d.day) + d.strftime(", %Y")


def digest_email(label, items, today):
    shown = items[:MAX_ITEMS_PER_EMAIL]
    crit = sum(1 for i in items if i["level"] == "critical")
    n = len(items)
    subject = f"Beacon · {label}: {n} new alert{'s' if n != 1 else ''}" + (f" ({crit} critical)" if crit else "")
    intro = f"{n} new security alert{'s' if n != 1 else ''} for {esc(label)} since the last digest."
    more = (f'<p style="margin:18px 0 0;font-family:{SANS};font-size:14px;color:{C["muted"]};">And {n - len(shown)} more on the Beacon page.</p>'
            if n > len(shown) else "")
    body = (f'<h1 style="margin:10px 0 0;font-family:{SERIF};font-size:26px;line-height:1.25;color:{C["ink"]};">{intro}</h1>'
            + "".join(alert_block(i) for i in shown) + more + button(f"{BASE}/beacon.html#alerts", "Open Beacon"))
    footer = legal_footer(f"You get this email because you subscribed to {esc(label)} alerts on solyrae.com.")
    return subject, layout(intro, f"Daily digest · {label} · {us_date(today)}", body, footer)


def confirm_email():
    body = (f'<h1 style="margin:10px 0 0;font-family:{SERIF};font-size:26px;line-height:1.25;color:{C["ink"]};">Confirm your subscription</h1>'
            f'<p style="margin:14px 0 0;font-family:{SANS};font-size:15px;line-height:1.6;color:{C["ink"]};">You asked to get SoLyrae Beacon alerts at this address. '
            f'Confirm to receive a daily email with the new Critical, High and Watch alerts for the components you chose. It only arrives on days with something new.</p>'
            + button("{{ doubleoptin }}", "Confirm subscription")
            + f'<p style="margin:20px 0 0;font-family:{SANS};font-size:13px;line-height:1.6;color:{C["muted"]};">If you did not ask for this, ignore this email and you will not be added.</p>')
    footer = (f"Beacon is a free security bulletin for Solana validator operators. "
              f'<a href="{BASE}/beacon.html" style="color:{C["muted"]};">Beacon</a> &middot; <a href="{BASE}/privacy.html" style="color:{C["muted"]};">Privacy</a>')
    return "Confirm your SoLyrae Beacon subscription", layout("Confirm to start getting Beacon alerts.", "Beacon alerts", body, footer)


# ---------------------------------------------------------------- daily digest
def send_digests(items, components, state_file):
    """Once a day, emails each component's list the new Critical, High and Watch alerts for that component."""
    if not os.environ.get("BREVO_API_KEY", "").strip():
        print("Brevo key not set: no email digest")
        return
    if os.environ.get("GITHUB_ACTIONS") != "true":  # only the scheduled run on GitHub sends, so local test runs never email subscribers
        print("Local run: no email digest")
        return
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    eligible = {c: [i for i in items if c in i["components"] and i["level"] in DIGEST_LEVELS] for c in components}

    state = None
    if state_file.exists():
        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except Exception:
            state = None
    if state is None:  # first run: what exists today counts as already sent, so the first digest only has new alerts
        state = {"last": today, "sent": {c: sorted(i["id"] for i in v) for c, v in eligible.items()}}
        state_file.write_text(json.dumps(state, separators=(",", ":")), encoding="utf-8")
        print("Email digest: first run, existing alerts marked as sent")
        return
    if state.get("last") == today or now.hour < DIGEST_HOUR_UTC:
        print("Email digest: not due yet")
        return

    try:
        lists = beacon_lists()
    except Exception as e:
        print("Email digest skipped:", e, file=sys.stderr)
        return
    sent_total = 0
    for c, label in components.items():
        done = set(state["sent"].get(c, []))
        new = [i for i in eligible[c] if i["id"] not in done]
        lst = lists.get(LIST_PREFIX + label)
        if new and lst and (lst.get("uniqueSubscribers") or lst.get("totalSubscribers") or 0) > 0:
            subject, body = digest_email(label, new, now)
            try:
                camp = api("POST", "/emailCampaigns", {"name": f"Beacon digest · {label} · {today}", "subject": subject, "sender": SENDER,
                                                       "htmlContent": body, "recipients": {"listIds": [lst["id"]]}})
                api("POST", f"/emailCampaigns/{camp['id']}/sendNow")
                sent_total += 1
            except Exception as e:
                print("  digest error for", label, e, file=sys.stderr)
                continue  # keep these alerts for the next digest
        # remember what was handled; forget alerts that are no longer in the bulletin
        state["sent"][c] = sorted({i["id"] for i in eligible[c]} & (done | {i["id"] for i in new}))
    state["last"] = today
    state_file.write_text(json.dumps(state, separators=(",", ":")), encoding="utf-8")
    print(f"Email digest: {sent_total} emails sent")
