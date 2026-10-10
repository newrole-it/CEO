#!/usr/bin/env python3
"""Pick one best ATS board per company from raw_probe.json, confirm identity, write ../seed-companies.json"""
import json, re, urllib.request, datetime, collections
r = json.load(open("raw_probe.json"))
UA = {"User-Agent": "Jobscanner-personal/0.1", "Accept": "application/json"}
def get(u):
    try: return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20).read())
    except Exception: return None
PRI = {"greenhouse":0,"ashby":1,"lever":2,"smartrecruiters":3,"workable":4}
# manually confirmed WRONG identities (display name / descriptions show a different company)
WRONG = {("greenhouse","remote"):"board is 'General Assembly Remote Jobs'", ("greenhouse","wise"):"board is 'Wise Worksite Field Sales' (not Wise plc)",
         ("greenhouse","relativity"):"board is Relativity Space, not Relativity (Kraków)", ("ashby","ramp"):"Ashby 'ramp' is Ramp (US fintech), not Ramp Network",
         ("workable","1password"):"board name 'Workable' - not 1Password", ("workable","scalable"):"'The Scalable Company', not Scalable Capital",
         ("workable","1komma5grad"):"board name 'Workable'", ("workable","1komma5"):"board name 'Workable'", ("workable","11bitstudios"):"board name 'James Reynolds'",
         ("greenhouse","cleo"):"board 'Cleo (US)' - may be a different Cleo", ("greenhouse","traderepublic"):"customer council board", ("ashby","lunar"):"'stealth technology company' (healthcare), not Lunar bank", ("lever","neon"):"Neon = Brazilian bank, not Neon DB", ("ashby","neon"):"Neon = game-payments company, not Neon DB", ("ashby","kiwi"):"Kiwi = LatAm company (Argentina/Colombia jobs), not Kiwi.com", ("ashby","flink"):"'flink' board is a Zurich company, not Flink (Berlin grocery)"}
# manual identity confirmations after reviewing board/job content on 2026-10-10
CONFIRM = {("greenhouse","intercom"):"board display name is 'Fin' (Intercom's AI product brand); slug and job URLs are intercom", ("greenhouse","ocadogroup"):"board name 'Ocado Group'", ("ashby","cursor"):"descriptions: 'Our mission is to automate coding' (Cursor/Anysphere)", ("ashby","writer"):"descriptions: 'ABOUT WRITER'", ("lever","text"):"all EU jobs located in Wrocław (Text.com / ex-LiveChat HQ) - likely but not explicitly named"}
def base(n): return re.sub(r"\s*\(.*?\)|\.com|\.io|\.co\b","",n).split("/")[0].strip()
def norm(s): return re.sub(r"[^a-z0-9]","",(s or "").lower())
seed, flagged = [], []
for name, entries in r.items():
    if not entries: continue
    cname = base(name)
    good = [e for e in entries if (e["ats"],e["slug"]) not in WRONG and e["open_jobs_count_at_check"]>0]
    for e in entries:
        if (e["ats"],e["slug"]) in WRONG: flagged.append({**e,"name":cname,"verified":False,"notes":"API 200 but WRONG COMPANY: "+WRONG[(e["ats"],e["slug"])]})
    if not good:
        for e in entries:
            if (e["ats"],e["slug"]) not in WRONG:
                flagged.append({**e,"name":cname,"verified":False,"notes":"API 200 + valid JSON but 0 open jobs; ownership/active use unconfirmed (Workable/Ashby/Lever accounts can exist dormant)"})
        continue
    good.sort(key=lambda e:(PRI[e["ats"]], -e["open_jobs_count_at_check"]))
    # prefer the ATS with most jobs if difference is large (company migrated)
    best = max(good, key=lambda e:(e["open_jobs_count_at_check"], -PRI[e["ats"]]))
    e = dict(best); e["name"] = cname
    # identity check
    key = norm(cname)[:8]; idn = None
    if e["ats"] in ("greenhouse","workable","smartrecruiters"):
        idn = key in norm(e["board_display_name"]) or norm(e["board_display_name"])[:6] in norm(cname)
        how = f"board display name '{e['board_display_name']}'"
    else:
        d = get(e["api_url"]); js = d if isinstance(d,list) else (d or {}).get("jobs",[])
        txt = [norm((j.get("descriptionPlain") or "") + (j.get("additionalPlain") or "")) for j in js[:15]]
        frac = sum(key in t for t in txt)/max(1,len(txt)); idn = frac >= 0.3
        how = f"company name found in {frac:.0%} of sampled job descriptions"
    others = [f"{x['ats']}:{x['slug']}({x['open_jobs_count_at_check']})" for x in good if x is not best]
    if (e["ats"],e["slug"]) in CONFIRM: idn=True; how += "; manual review: " + CONFIRM[(e["ats"],e["slug"])]
    e["identity_confirmed"] = bool(idn)
    e["notes"] = (f"Identity check: {how}." + (f" Also live on: {', '.join(others)}." if others else "") + ("" if idn else " IDENTITY NOT CONFIRMED - review before use.")).strip()
    e["verified"] = True
    seed.append(e)
seed.sort(key=lambda e:(PRI[e["ats"]], e["name"].lower()))
keep = ["name","ats","slug","board_url","api_url","hq_or_relevant_locations","verified","verified_at","open_jobs_count_at_check","has_pl_or_remote_eng_leadership_role_at_check","identity_confirmed","sample_matching_roles","notes"]
out = {"generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
       "method": "Each slug called on its public ATS API (scripts/verify_slugs.py). verified=true => HTTP 200 + valid JSON + >=1 open job (SmartRecruiters: totalFound>0, since SR returns 200/empty for ANY identifier). identity_confirmed => board name or job descriptions match the company. has_pl_or_remote_eng_leadership_role_at_check => title matches EM/Head/Director/VP Eng/CTO regex AND location matches Poland cities/remote/EMEA/Europe (heuristic; SmartRecruiters only first 100 postings scanned).",
       "companies": [{k:e.get(k) for k in keep} for e in seed],
       "flagged_not_used": [{k:e.get(k) for k in ["name","ats","slug","api_url","verified","open_jobs_count_at_check","notes"]} for e in flagged]}
json.dump(out, open("/workspace/jobscanner/seed-companies.json","w"), indent=2, ensure_ascii=False)
c = collections.Counter(e["ats"] for e in seed); u = collections.Counter(e["ats"] for e in flagged)
print("seed:",len(seed),dict(c)); print("flagged:",len(flagged),dict(u))
print("identity unconfirmed:",[ (e['name'],e['ats'],e['slug']) for e in seed if not e['identity_confirmed']])
print("leadership hits:",sum(1 for e in seed if e['has_pl_or_remote_eng_leadership_role_at_check']))
