#!/usr/bin/env python3
"""Probe candidate company slugs against public ATS job-board APIs and write seed-companies.json.
Usage: python3 verify_slugs.py  (reads candidates.py in same dir). Polite: 6 threads, 15s timeout, UA set."""
import json, re, sys, os, time, concurrent.futures as cf, urllib.request, urllib.error, datetime
sys.path.insert(0, os.path.dirname(__file__)); from candidates import C
UA = {"User-Agent": "Jobscanner-personal/0.1 (personal job search; contact: owner)", "Accept": "application/json"}
NOW = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
LEAD = re.compile(r"\b(engineering manager|manager,? (software )?engineering|head of (engineering|software|platform|data|infrastructure|technology|development|tech)|director[^,]{0,25}engineering|engineering director|vp[ ,.]{0,3}(of )?engineering|vice president[^,]{0,20}engineering|cto|chief technology|kierownik|dyrektor)", re.I)
LOC = re.compile(r"poland|polska|\bpl\b|warsaw|warszawa|krak|cracow|wroc|gda|pozna|łódź|lodz|katowic|gliwice|szczecin|remote|emea|europe|\beu\b|anywhere", re.I)
def get(url):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15)
        return r.status, json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e: return e.code, None
    except Exception as e: return 0, None
def jobs_of(ats, d):
    """return list of (title, location_string) and board display name if any"""
    if ats == "greenhouse": return [(j.get("title",""), (j.get("location") or {}).get("name","")) for j in d.get("jobs",[])], None
    if ats == "lever": return [(j.get("text",""), " | ".join((j.get("categories") or {}).get("allLocations") or [(j.get("categories") or {}).get("location") or ""]) + " " + (j.get("workplaceType") or "")) for j in d], None
    if ats == "ashby": return [(j.get("title",""), " | ".join([j.get("location") or ""] + [s.get("location","") for s in j.get("secondaryLocations") or []]) + (" remote" if j.get("isRemote") else "")) for j in d.get("jobs",[])], None
    if ats == "workable": return [(j.get("title",""), " | ".join(filter(None,[j.get("city"),j.get("country"), "remote" if j.get("telecommuting") else ""] + [ (l.get("city") or "")+" "+(l.get("country") or "") for l in j.get("locations") or []]))) for j in d.get("jobs",[])], d.get("name")
    if ats == "smartrecruiters": return [(j.get("name",""), (j.get("location") or {}).get("fullLocation","") + (" remote" if (j.get("location") or {}).get("remote") else "")) for j in d.get("content",[])], ((d.get("content") or [{}])[0].get("company") or {}).get("name")
def endpoints(slug):
    return [
     ("greenhouse", f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs", f"https://job-boards.greenhouse.io/{slug}"),
     ("lever", f"https://api.lever.co/v0/postings/{slug}?mode=json", f"https://jobs.lever.co/{slug}"),
     ("lever", f"https://api.eu.lever.co/v0/postings/{slug}?mode=json", f"https://jobs.eu.lever.co/{slug}"),
     ("ashby", f"https://api.ashbyhq.com/posting-api/job-board/{slug}", f"https://jobs.ashbyhq.com/{slug}"),
     ("workable", f"https://apply.workable.com/api/v1/widget/accounts/{slug}", f"https://apply.workable.com/{slug}/"),
     ("smartrecruiters", f"https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100", f"https://jobs.smartrecruiters.com/{slug}"),
    ]
def probe(task):
    name, slug, locs = task; out = []
    for ats, api, board in endpoints(slug):
        st, d = get(api)
        if st != 200 or d is None: continue
        jobs, disp = jobs_of(ats, d)
        total = d.get("totalFound", len(jobs)) if ats == "smartrecruiters" else len(jobs)
        if ats == "smartrecruiters" and total == 0: continue   # SR returns 200 + empty for ANY identifier -> not proof
        if ats == "greenhouse":
            s2, b = get(f"https://boards-api.greenhouse.io/v1/boards/{slug}"); disp = (b or {}).get("name")
        hits = [f"{t} [{l.strip()}]" for t, l in jobs if LEAD.search(t) and LOC.search(l or "")]
        out.append(dict(name=name, ats=ats, slug=slug, board_url=board, api_url=api.replace("?limit=100","").replace("?mode=json","?mode=json"),
            hq_or_relevant_locations=locs, verified=True, verified_at=NOW, open_jobs_count_at_check=total,
            has_pl_or_remote_eng_leadership_role_at_check=bool(hits) if (ats!="smartrecruiters" or total<=100) else (bool(hits) or None),
            board_display_name=disp, sample_matching_roles=hits[:5], notes=""))
    return name, slug, out
def main():
  tasks = [(n, s, l) for n, ss, l in C for s in ss]
  res = {}
  with cf.ThreadPoolExecutor(6) as ex:
    for name, slug, out in ex.map(probe, tasks): res.setdefault(name, []).extend(out)
  json.dump(res, open("/workspace/jobscanner/scripts/raw_probe.json","w"), indent=1, ensure_ascii=False)
  print("companies with >=1 hit:", sum(1 for v in res.values() if v), "of", len(res))

if __name__ == "__main__": main()
