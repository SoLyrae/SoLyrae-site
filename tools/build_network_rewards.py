"""
Builds site/data/network_rewards.json: net rewards per 1,000 SOL staked for every Solana validator,
for the last completed epoch, using ONLY Vortex (api.vx.tools).

Per validator:
  inflation (net)  = inflationRewardGross - voteAccountReward (the validator's commission)   (GET /epochs/earnings)
  MEV tips (net)   = tips paid to stakers, after Jito fees and the validator's MEV commission   (GET /validators/tips)
  total            = inflation (net) + MEV tips (net), divided by the validator's stake, times 1,000

Throttled to about 4 requests per second (Vortex allows 10 per second per client).
Run once per epoch:  .venv\\Scripts\\python.exe Solyrae_Web\\tools\\build_network_rewards.py
"""
import json, sys, time, threading, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

VX = "https://api.vx.tools"
OUT = Path(__file__).resolve().parent.parent / "site" / "data" / "network_rewards.json"
WORKERS = 4          # concurrent requests, each followed by a 1 s pause -> about 4 requests per second
L = 1e9
lock = threading.Lock()
done_count = 0


def get(path, tries=5):
    for k in range(tries):
        try:
            req = urllib.request.Request(VX + path, headers={"User-Agent": "solyrae-site-builder/1.0", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                wait = int(e.headers.get("Retry-After", "5") or 5)
                time.sleep(min(60, max(wait, 2) * (k + 1)))
                continue
            if e.code == 404:
                return None
            time.sleep(2 * (k + 1))
        except Exception:
            time.sleep(2 * (k + 1))
    return None


def one(rec, epoch):
    global done_count
    ident, vote, stake = rec["nodeAddress"], rec["voteAddress"], rec["stake"]
    infl = tips = None
    earn = get(f"/epochs/earnings?identity={ident}&limit=4")
    time.sleep(0.5)
    if isinstance(earn, list):
        for e in earn:
            if e.get("epoch") == epoch and e.get("income"):
                gross = e["income"].get("inflationRewardGross") or 0
                # the commission kept by the validator is paid into its vote account (verified: Figment 7% = 7% of its gross)
                com = e["income"].get("voteAccountReward") or 0
                infl = max(0, gross - com)
    tj = get(f"/validators/tips?identity={ident}&limit=4")
    time.sleep(0.5)
    if isinstance(tj, dict):
        tips = 0
        for e in tj.get("epochs", []):
            if e.get("epoch") == epoch and e.get("complete") and e.get("total"):
                tips = e["total"].get("stakers") or 0
    with lock:
        done_count += 1
        if done_count % 50 == 0:
            print(f"  {done_count} validators done", flush=True)
    if infl is None:
        # no earnings record for the epoch: if the leaderboard also shows no rewards, the validator earned nothing for its stakers
        if rec.get("rewards", {}).get("totalLamports", 0) > 0:
            return None
        infl = 0
    return {"vote": vote, "stake": stake, "infl": infl / stake * 1000, "tips": (tips or 0) / stake * 1000}


def main():
    cur = get("/epochs/current")
    epoch = (cur["epoch"] if cur else None)
    if epoch is None:
        sys.exit("could not read the current epoch")
    epoch -= 1  # last completed epoch
    print(f"Epoch {epoch}: reading the participation leaderboard ...", flush=True)
    lb = get(f"/epochs/leaderboard/participation?epoch={epoch}")
    # every validator with stake counts, including those that earned nothing (a staker with them would have received 0)
    recs = [r for r in lb["records"] if r.get("complete") and r.get("stake", 0) > 0]
    # reuse rows already computed for this same epoch, so a re-run only asks for the missing validators
    old = {}
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text(encoding="utf-8"))
            if prev.get("epoch") == epoch:
                old = {r[0]: r for r in prev["rows"]}
        except Exception:
            old = {}
    todo = [r for r in recs if r["voteAddress"] not in old]
    print(f"{len(recs)} validators with stake; {len(old)} already computed; requesting {len(todo)} more (about {len(todo)*2} calls) ...", flush=True)
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        res = [x for x in ex.map(lambda r: one(r, epoch), todo) if x]
    rows = list(old.values()) + [[x["vote"], round(x["infl"], 6), round(x["tips"], 6), round(x["infl"] + x["tips"], 6)] for x in res]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "epoch": epoch,
        "listed": len(lb["records"]),   # validators listed by Vortex for the epoch; "rows" are those with stake (some earned 0)
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "source": "Vortex (api.vx.tools)",
        "unit": "SOL per 1,000 SOL staked, net of commission",
        "columns": ["vote", "inflation", "tips", "total"],
        "rows": rows,
    }, separators=(",", ":")), encoding="utf-8")
    print(f"Done: {len(rows)} validators written to {OUT}", flush=True)


if __name__ == "__main__":
    main()
