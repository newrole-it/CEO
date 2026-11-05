#!/usr/bin/env python3
"""Probe PL candidates (candidates_pl.py) on all slug-based public ATS feeds; write raw_probe_pl.json."""
import json, sys, os, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(__file__))
from ats_pl import FETCH; from candidates_pl import KNOWN, GUESS
SLUG_ATS = ["greenhouse","lever","lever_eu","ashby","workable","smartrecruiters","teamtailor","recruitee","personio","breezy","traffit","pinpoint","bamboohr"]
def run(t):
    name, ats, slug, src = t
    try: r = FETCH[ats](slug)
    except Exception as e: r = None
    if r: r["jobs"] = r["jobs"]; r.update(name=name, ats=ats, slug=slug, source=src)
    return r
if __name__ == "__main__":
    tasks = [(n,a,s,"careers_page_html") for n,a,s in KNOWN] + [(n,a,s,"slug_guess") for n,ss in GUESS for s in ss for a in SLUG_ATS]
    print(len(tasks), "probes")
    with cf.ThreadPoolExecutor(12) as ex: res = [r for r in ex.map(run, tasks) if r]
    json.dump(res, open(os.path.join(os.path.dirname(__file__), "raw_probe_pl.json"), "w"), indent=1, ensure_ascii=False)
    for r in res: print(f"{r['name'][:26]:26} {r['ats']:15} {r['slug'][:28]:28} {r['total']:>5} {str(r['display_name'])[:30]:30} {r['source']}")
