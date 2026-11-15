"""
One-time setup of Brevo for Beacon emails (safe to run again: it only creates what is missing and refreshes the template).
  - folder "SoLyrae Beacon" with one list per Beacon component ("Beacon · Agave", ...)
  - the double opt-in template "Beacon · Confirm subscription"
  --preview  also writes sample emails to the scratch folder given after it, without touching Brevo

Run:  .venv\\Scripts\\python.exe Solyrae_Web\\tools\\setup_brevo.py
"""
import json, sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_beacon as bb  # loads .env and gives the component list
import beacon_email as be


def preview(folder):
    out = Path(folder)
    out.mkdir(parents=True, exist_ok=True)
    data = json.loads(bb.DATA.read_text(encoding="utf-8"))
    for c in ("agave", "kernel"):
        items = [i for i in data["items"] if c in i["components"] and i["level"] in be.DIGEST_LEVELS][:4]
        subject, body = be.digest_email(bb.COMPONENTS[c], items, datetime.now(timezone.utc))
        (out / f"digest_{c}.html").write_text(body, encoding="utf-8")
        print(c, "|", subject)
    subject, body = be.confirm_email()
    (out / "confirm.html").write_text(body, encoding="utf-8")
    print("confirm |", subject)


def main():
    folders = be.api("GET", "/contacts/folders?limit=50").get("folders") or []
    folder = next((f for f in folders if f["name"] == be.FOLDER), None)
    if not folder:
        folder = {"id": be.api("POST", "/contacts/folders", {"name": be.FOLDER})["id"]}
        print("folder created")
    have = be.beacon_lists()
    for label in bb.COMPONENTS.values():
        name = be.LIST_PREFIX + label
        if name in have:
            print("list ok:", name)
        else:
            be.api("POST", "/contacts/lists", {"name": name, "folderId": folder["id"]})
            print("list created:", name)

    subject, body = be.confirm_email()
    tpl = {"templateName": be.CONFIRM_TEMPLATE, "subject": subject, "sender": be.SENDER, "htmlContent": body, "isActive": True, "tag": "optin"}
    t = be.find_template(be.CONFIRM_TEMPLATE)
    if t:
        be.api("PUT", f"/smtp/templates/{t['id']}", tpl)
        print("template updated, id", t["id"])
    else:
        print("template created, id", be.api("POST", "/smtp/templates", tpl)["id"])


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--preview":
        preview(sys.argv[2])
    elif not __import__("os").environ.get("BREVO_API_KEY"):
        sys.exit("BREVO_API_KEY is missing in .env")
    else:
        main()
