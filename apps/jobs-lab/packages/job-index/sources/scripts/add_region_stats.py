#!/usr/bin/env python3
"""Re-fetch each seed board, count Poland-located and remote-flagged jobs, list PL/remote eng-leadership titles."""
import json, re, urllib.request, concurrent.futures as cf
from verify_slugs import jobs_of, LEAD  # reuse parsers
H={"User-Agent":"Jobscanner-personal/0.1","Accept":"application/json"}
PL=re.compile(r"poland|polska|warsaw|warszawa|krak|cracow|wroc|gdańsk|gdansk|gdynia|pozna|łódź|lodz|katowic|gliwice|szczecin|lublin|\bPL\b",re.I)
REM=re.compile(r"remote|anywhere|emea|europe",re.I)
EU=re.compile(r"europe|emea|\beu\b|global|anywhere|worldwide|poland|germany|france|spain|portugal|ireland|netherlands|united kingdom|\buk\b|italy|austria|switzerland|sweden|denmark|norway|finland|estonia|latvia|lithuania|czech|romania|bulgaria|greece|hungary|belgium|croatia|slovakia|slovenia|serbia|cyprus|malta|luxembourg|berlin|london|paris|amsterdam|dublin|lisbon|madrid|barcelona|milan|vienna|prague|munich|stockholm|copenhagen|tallinn|vilnius|riga|budapest|zurich|helsinki|oslo|athens|sofia|bucharest|belgrade",re.I)
NONEU=re.compile(r"united states|\busa?\b|canada|us-|brazil|india|latam|mexico|argentina|colombia|chile|apac|australia|japan|singapore",re.I)
def classify(js):
    pl=[f"{t} [{l.strip()}]" for t,l in js if LEAD.search(t) and PL.search(l or "")]
    eu=[f"{t} [{l.strip()}]" for t,l in js if LEAD.search(t) and not PL.search(l or "") and re.search(r"remote|anywhere",(l or "")+" "+t,re.I) and EU.search(l or "")]
    return pl,eu
P="/workspace/jobscanner/seed-companies.json"; D=json.load(open(P))
def f(e):
    u=e["api_url"]+("?limit=100" if e["ats"]=="smartrecruiters" else "")
    try: d=json.loads(urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=30).read())
    except Exception: return e
    if e["ats"]=="smartrecruiters":  # use server-side filters to get PL + remote counts reliably
        def tot(q):
            try: return json.loads(urllib.request.urlopen(urllib.request.Request(e["api_url"]+q,headers=H),timeout=30).read()).get("totalFound")
            except Exception: return None
        e["pl_located_jobs_at_check"]=tot("?country=pl&limit=1"); e["remote_flagged_jobs_at_check"]=tot("?locationType=REMOTE&limit=1")
        pl=json.loads(urllib.request.urlopen(urllib.request.Request(e["api_url"]+"?country=pl&limit=100",headers=H),timeout=30).read())
        js,_=jobs_of("smartrecruiters",pl); p,_e=classify(js)
        rm=json.loads(urllib.request.urlopen(urllib.request.Request(e["api_url"]+"?locationType=REMOTE&limit=100",headers=H),timeout=30).read())
        js2,_=jobs_of("smartrecruiters",rm); _p,eu=classify(js2)
        return setf(e,p,eu)
    js,_=jobs_of(e["ats"],d)
    e["pl_located_jobs_at_check"]=sum(bool(PL.search(l or "")) for t,l in js)
    e["remote_flagged_jobs_at_check"]=sum(bool(REM.search(l or "")) for t,l in js)
    p,eu=classify(js); return setf(e,p,eu)
def setf(e,p,eu):
    e["has_pl_eng_leadership_role_at_check"]=bool(p); e["has_eu_remote_eng_leadership_role_at_check"]=bool(eu)
    e["has_pl_or_remote_eng_leadership_role_at_check"]=bool(p or eu); e["sample_matching_roles"]=(p+eu)[:6]
    return e
with cf.ThreadPoolExecutor(6) as ex: D["companies"]=list(ex.map(f,D["companies"]))
json.dump(D,open(P,"w"),indent=2,ensure_ascii=False)
c=D["companies"]
print("with PL-located jobs:",sum(1 for e in c if (e.get("pl_located_jobs_at_check") or 0)>0))
print("with remote/EMEA jobs:",sum(1 for e in c if (e.get("remote_flagged_jobs_at_check") or 0)>0))
print("PL lead:",sum(1 for e in c if e.get("has_pl_eng_leadership_role_at_check")),"EU-remote lead:",sum(1 for e in c if e.get("has_eu_remote_eng_leadership_role_at_check")))
print("leadership hits:",sum(1 for e in c if e["has_pl_or_remote_eng_leadership_role_at_check"]))
for e in c:
    if (e.get("pl_located_jobs_at_check") or 0)>0: print(" PL",e["name"],e["ats"],e["pl_located_jobs_at_check"])
