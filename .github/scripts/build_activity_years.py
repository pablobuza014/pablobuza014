#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os, sys, datetime, requests
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from dateutil.relativedelta import relativedelta
from collections import defaultdict, OrderedDict

def log(*args):
    print("[build_activity_years]", *args, flush=True)


TOKEN = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
if TOKEN:
    os.environ["GH_TOKEN"] = TOKEN
GH_TOKEN = os.environ.get("GH_TOKEN")

USER      = os.environ.get("GH_USER", "pablobuza014")
DATE_FROM = os.environ.get("GH_FROM", "2021-01-01")
DATE_TO   = os.environ.get("GH_TO") or datetime.date.today().isoformat()

if not GH_TOKEN:
    log("Falta GH_TOKEN o GITHUB_TOKEN")
    sys.exit(1)

def iso_z(dt: datetime.date) -> str:
    return dt.strftime("%Y-%m-%dT00:00:00Z")

url = "https://api.github.com/graphql"
headers = {
    "Authorization": f"Bearer {GH_TOKEN}",
    "Accept": "application/vnd.github+json",
    "User-Agent": f"build-activity-years/{USER}",
}

def fetch_days(login, dfrom: datetime.date, dto: datetime.date):
    """Descarga días de contribución entre [dfrom, dto) con GraphQL."""
    q = """
    query($login:String!, $from:DateTime!, $to:DateTime!){
      user(login:$login){
        contributionsCollection(from:$from, to:$to){
          contributionCalendar{
            weeks{
              contributionDays{
                date
                contributionCount
              }
            }
          }
        }
      }
    }
    """
    variables = {"login": login, "from": iso_z(dfrom), "to": iso_z(dto)}
    try:
        r = requests.post(
            url,
            json={"query": q, "variables": variables},
            headers=headers,
            timeout=60
        )
        r.raise_for_status()
    except requests.exceptions.RequestException as e:
        log("HTTP error:", e)
        if "response" in dir(e) and getattr(e, "response", None) is not None:
            try:
                log("Body:", e.response.text[:400])
            except Exception:
                pass
        raise

    data = r.json()
    if "errors" in data:
        log("GraphQL errors:", data["errors"])
        raise SystemExit(2)

    try:
        cal = data["data"]["user"]["contributionsCollection"]["contributionCalendar"]
    except Exception:
        log("Respuesta inesperada:", data)
        raise SystemExit(3)

    days = []
    for w in cal["weeks"]:
        for d in w["contributionDays"]:
            days.append((d["date"], int(d["contributionCount"])))
    return days


start = datetime.date.fromisoformat(DATE_FROM)
end   = datetime.date.fromisoformat(DATE_TO)
if end < start:
    log(f"Rango inválido: from={start} to={end}")
    sys.exit(1)

log(f"User={USER} from={start} to={end}")

all_days = []
cursor = datetime.date(start.year, 1, 1) if (start.month, start.day) != (1, 1) else start
while cursor <= end:
    year_end = datetime.date(cursor.year, 12, 31)
    if year_end > end:
        year_end = end
    log(f"Fetching {cursor} .. {year_end}")

    days = fetch_days(USER, cursor, year_end + relativedelta(days=1))
    all_days.extend(days)
    cursor = datetime.date(cursor.year + 1, 1, 1)


per_month = OrderedDict()
per_year  = defaultdict(int)

for ds, c in all_days:
    d = datetime.date.fromisoformat(ds)
    ym = datetime.date(d.year, d.month, 1)
    per_month[ym] = per_month.get(ym, 0) + c
    per_year[d.year] += c


first_year = 2021
last_year  = datetime.date.today().year
cursor = datetime.date(first_year, 1, 1)
while cursor <= datetime.date(last_year, 12, 1):
    per_month.setdefault(cursor, 0)
    cursor = (cursor + relativedelta(months=1)).replace(day=1)

per_month = OrderedDict(sorted(per_month.items(), key=lambda kv: kv[0]))

# ====== Year Line ======
fig, ax = plt.subplots(figsize=(12, 3.2), dpi=150)
x = list(per_month.keys())
y = [per_month[k] for k in x]
ax.plot(x, y, linewidth=2)

year_ticks = [datetime.date(yc, 1, 1) for yc in range(first_year, last_year + 1)]
ax.set_xticks(year_ticks)
ax.set_xticklabels([str(t.year) for t in year_ticks])
ax.set_xlim([datetime.date(first_year, 1, 1), datetime.date(last_year, 12, 31)])

ax.grid(True, axis="y", linestyle="--", alpha=0.3)
ax.set_title(f"Contributions timeline ({first_year}–{last_year})")
ax.set_ylabel("Contribs / month")
fig.tight_layout()

os.makedirs("assets", exist_ok=True)
line_out = "assets/activity-years.svg"
fig.savefig(line_out, format="svg")
plt.close(fig)
log("Wrote", line_out)

# ====== Year Bars ======
for yk in range(first_year, last_year + 1):
    per_year[yk] = per_year.get(yk, 0)

years_sorted = list(range(first_year, last_year + 1))
bars = [per_year[y] for y in years_sorted]

fig2, ax2 = plt.subplots(figsize=(8, 2.8), dpi=150)
ax2.bar([str(y) for y in years_sorted], bars)
ax2.set_title("Contributions per year")
for i, v in enumerate(bars):
    ax2.text(i, v, str(v), ha="center", va="bottom", fontsize=8)
fig2.tight_layout()

bar_out = "assets/activity-years-bars.svg"
fig2.savefig(bar_out, format="svg")
plt.close(fig2)
log("Wrote", bar_out)

log("OK")
