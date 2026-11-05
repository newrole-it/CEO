#!/usr/bin/env python3
"""Fetch candidate careers pages and grep HTML for ATS signatures. Output: scripts/ats_detect.json
Usage: python3 detect_ats.py  (reads PL_SITES below)"""
import re, json, sys, concurrent.futures as cf, urllib.request, ssl
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) Jobscanner-personal/0.1"}
SIG = {
 "greenhouse": r"(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io/(?:embed/job_board\?for=)?([A-Za-z0-9_-]+)|boards-api\.greenhouse\.io/v1/boards/([A-Za-z0-9_-]+)",
 "lever": r"jobs\.(?:eu\.)?lever\.co/([A-Za-z0-9_.-]+)",
 "ashby": r"jobs\.ashbyhq\.com/([A-Za-z0-9_.%-]+)",
 "workable": r"apply\.workable\.com/([A-Za-z0-9_-]+)",
 "smartrecruiters": r"(?:jobs|careers)\.smartrecruiters\.com/([A-Za-z0-9_-]+)",
 "teamtailor": r"([A-Za-z0-9-]+)\.teamtailor\.com",
 "recruitee": r"([A-Za-z0-9-]+)\.recruitee\.com",
 "personio": r"([A-Za-z0-9-]+)\.jobs\.personio\.(?:de|com)",
 "breezy": r"([A-Za-z0-9-]+)\.breezy\.hr",
 "bamboohr": r"([A-Za-z0-9-]+)\.bamboohr\.com",
 "workday": r"([A-Za-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com/(?:[a-z]{2}-[A-Z]{2}/)?([A-Za-z0-9_-]+)",
 "jobvite": r"jobs\.jobvite\.com/([A-Za-z0-9_-]+)",
 "pinpoint": r"([A-Za-z0-9-]+)\.pinpointhq\.com",
 "traffit": r"([A-Za-z0-9-]+)\.traffit\.com",
 "erecruiter": r"(?:erecruiter\.pl|skk\.erecruiter|erecruitment\.pl)[^\"' ]*",
 "hrlink": r"([A-Za-z0-9-]+)\.hrlink\.pl",
 "softgarden": r"([A-Za-z0-9-]+)\.softgarden\.io",
 "jobylon": r"emp\.jobylon\.com/[^\"' ]*",
 "join": r"join\.com/companies/([A-Za-z0-9_-]+)",
 "homerun": r"([A-Za-z0-9-]+)\.homerun\.co",
 "icims": r"([A-Za-z0-9-]+)\.icims\.com",
 "successfactors": r"(?:career\d*\.successfactors\.(?:eu|com)|jobs\.sap\.com)[^\"' ]*",
 "oracle_hcm": r"([A-Za-z0-9-]+)\.fa\.[a-z0-9]+\.oraclecloud\.com",
 "taleo": r"([A-Za-z0-9-]+)\.taleo\.net",
 "phenom": r"phenompeople|cdn\.phenompeople",
 "eightfold": r"([A-Za-z0-9-]+)\.eightfold\.ai",
 "comeet": r"comeet\.(?:co|com)/jobs/([A-Za-z0-9_-]+)",
 "manatal": r"careers-page\.com/([A-Za-z0-9_-]+)",
}
BAD = {"www","api","app","assets","static","cdn","career","careers","jobs","embed","widget","js","help","support","images","img","fonts","v1","my"}
ctx = ssl.create_default_context()
def fetch(u):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20, context=ctx)
        return r.status, r.geturl(), r.read(3_000_000).decode("utf-8","replace")
    except urllib.error.HTTPError as e: return e.code, u, ""
    except Exception as e: return 0, u, ""
def detect(html):
    out = {}
    for ats, rx in SIG.items():
        for m in re.finditer(rx, html):
            g = [x for x in m.groups() if x] if m.groups() else [m.group(0)]
            val = "/".join(g) if ats=="workday" else (g[0] if g else m.group(0))
            if val.lower() in BAD: continue
            out.setdefault(ats, set()).add(val)
    return {k: sorted(v)[:6] for k, v in out.items()}
def run(item):
    name, urls = item; res = []
    for u in urls:
        st, final, html = fetch(u)
        d = detect(html) if html else {}
        res.append({"url": u, "status": st, "final_url": final, "ats_signals": d})
        if d: break
    return name, res
if __name__ == "__main__":
    from pl_sites import PL_SITES
    with cf.ThreadPoolExecutor(8) as ex: out = dict(ex.map(run, PL_SITES))
    json.dump(out, open("/workspace/jobscanner/scripts/ats_detect.json","w"), indent=1, ensure_ascii=False)
    for n, r in out.items():
        sig = next((x["ats_signals"] for x in r if x["ats_signals"]), {})
        print(f"{n[:24]:24} {r[-1]['status']} {r[-1]['final_url'][:55]:55} {json.dumps(sig)[:160]}")
