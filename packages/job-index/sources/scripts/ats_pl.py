"""Fetchers for ATS feeds beyond the original five (+ wrappers for the five). Each returns
dict(total, jobs=[(title, location, remote_bool)], display_name, text_blob) or None if not a live board.
All endpoints are public/keyless as verified 2026-10-10 (see source-pack.md §6)."""
import json, re, urllib.request, urllib.error, xml.etree.ElementTree as ET, html
UA = "Mozilla/5.0 (X11; Linux x86_64) Jobscanner-personal/0.1 (personal job search)"
def req(url, data=None, headers=None, method=None, timeout=20):
    h = {"User-Agent": UA, "Accept": "application/json, application/xml;q=0.9, */*;q=0.5"}; h.update(headers or {})
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h, method=method), timeout=timeout)
        return r.status, dict(r.headers), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e: return e.code, {}, ""
    except Exception: return 0, {}, ""
def J(s):
    try: return json.loads(s)
    except Exception: return None
def strip(s): return re.sub(r"<[^>]+>", " ", html.unescape(s or ""))[:20000]

def greenhouse(slug):
    st,_,b = req(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"); d = J(b)
    if st != 200 or not isinstance(d, dict): return None
    _,_,b2 = req(f"https://boards-api.greenhouse.io/v1/boards/{slug}"); nm = (J(b2) or {}).get("name")
    js = [(j["title"], (j.get("location") or {}).get("name",""), bool(re.search("remote",(j.get("location") or {}).get("name",""),re.I))) for j in d.get("jobs",[])]
    return dict(total=len(js), jobs=js, display_name=nm, text_blob=" ".join(strip(j.get("content",""))[:3000] for j in d.get("jobs",[])[:5]))
def lever(slug, eu=False):
    host = "api.eu.lever.co" if eu else "api.lever.co"
    st,_,b = req(f"https://{host}/v0/postings/{slug}?mode=json"); d = J(b)
    if st != 200 or not isinstance(d, list): return None
    js = [(j.get("text",""), " | ".join((j.get("categories") or {}).get("allLocations") or [(j.get("categories") or {}).get("location") or ""]), (j.get("workplaceType")=="remote")) for j in d]
    return dict(total=len(js), jobs=js, display_name=None, text_blob=" ".join((j.get("descriptionPlain") or "")[:3000]+(j.get("additionalPlain") or "")[:2000] for j in d[:5]))
def ashby(slug):
    st,_,b = req(f"https://api.ashbyhq.com/posting-api/job-board/{slug}"); d = J(b)
    if st != 200 or not isinstance(d, dict): return None
    js = [(j.get("title",""), " | ".join([j.get("location") or ""]+[s.get("location","") for s in j.get("secondaryLocations") or []]), bool(j.get("isRemote"))) for j in d.get("jobs",[])]
    return dict(total=len(js), jobs=js, display_name=None, text_blob=" ".join((j.get("descriptionPlain") or "")[:3000] for j in d.get("jobs",[])[:5]))
def workable(slug):
    st,_,b = req(f"https://apply.workable.com/api/v1/widget/accounts/{slug}"); d = J(b)
    if st != 200 or not isinstance(d, dict): return None
    js = [(j.get("title",""), ", ".join(filter(None,[j.get("city"),j.get("country")])), bool(j.get("telecommuting"))) for j in d.get("jobs",[])]
    return dict(total=len(js), jobs=js, display_name=d.get("name"), text_blob="")
def smartrecruiters(slug):
    st,_,b = req(f"https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100"); d = J(b)
    if st != 200 or not isinstance(d, dict) or not d.get("totalFound"): return None
    c = d.get("content",[]); js = [(j.get("name",""), (j.get("location") or {}).get("fullLocation",""), bool((j.get("location") or {}).get("remote"))) for j in c]
    return dict(total=d["totalFound"], jobs=js, display_name=((c or [{}])[0].get("company") or {}).get("name"), text_blob="", truncated=d["totalFound"]>100)
def teamtailor(host):  # host = "{slug}.teamtailor.com" or custom careers domain
    if "." not in host: host = f"{host}.teamtailor.com"
    st,_,b = req(f"https://{host}/jobs.rss?per_page=500")
    if st != 200 or "<rss" not in b[:500]: return None
    root = ET.fromstring(b.encode()); ch = root.find("channel"); ns = {"tt": "https://teamtailor.com/locations"}
    js = []
    for it in ch.findall("item"):
        locs = [" ".join(filter(None,[(l.findtext("tt:city",namespaces=ns) or "").strip(), (l.findtext("tt:country",namespaces=ns) or "").strip()])) for l in it.findall("tt:locations/tt:location", ns)]
        rs = (it.findtext("remoteStatus") or "").strip()
        js.append((it.findtext("title") or "", " | ".join(locs) + (f" ({rs} remote)" if rs and rs!="none" else ""), rs == "fully"))
    return dict(total=len(js), jobs=js, display_name=(ch.findtext("title") or "").strip(), text_blob=" ".join(strip(it.findtext("description"))[:3000] for it in ch.findall("item")[:5]))
def recruitee(host):
    if "." not in host: host = f"{host}.recruitee.com"
    st,_,b = req(f"https://{host}/api/offers/"); d = J(b)
    if st != 200 or not isinstance(d, dict) or "offers" not in d: return None
    o = d["offers"]; js = [(j.get("title",""), " | ".join(filter(None,[j.get("location") or "", j.get("country") or ""])), bool(j.get("remote"))) for j in o]
    return dict(total=len(js), jobs=js, display_name=(o[0].get("company_name") if o else None), text_blob=" ".join(strip(j.get("description"))[:3000] for j in o[:5]))
def personio(slug):
    for tld in ("de","com"):
        st,_,b = req(f"https://{slug}.jobs.personio.{tld}/xml?language=en")
        if st == 200 and "<workzag-jobs" in b[:300]: break
    else: return None
    root = ET.fromstring(b.encode()); ps = root.findall("position")
    js = [(p.findtext("name") or "", ", ".join(filter(None,[p.findtext("office")]+[o.text for o in p.findall("additionalOffices/office")])), bool(re.search("remote",p.findtext("office") or "",re.I))) for p in ps]
    blob = " ".join(strip(" ".join(v.text or "" for v in p.iter("value")))[:3000] for p in ps[:5])
    return dict(total=len(js), jobs=js, display_name=None, text_blob=blob, tld=tld)
def breezy(slug):
    st,_,b = req(f"https://{slug}.breezy.hr/json"); d = J(b)
    if st != 200 or not isinstance(d, list): return None
    js = [(j.get("name",""), (j.get("location") or {}).get("name",""), bool((j.get("location") or {}).get("is_remote"))) for j in d]
    return dict(total=len(js), jobs=js, display_name=((d[0].get("company") or {}).get("name") if d else None), text_blob="")
def traffit(slug):
    out=[]; page=1; total=None
    while True:
        st,h,b = req(f"https://{slug}.traffit.com/public/job_posts/published", headers={"X-Request-Page-Size":"100","X-Request-Current-Page":str(page)}); d = J(b)
        if st != 200 or not isinstance(d, list): return None if page==1 else None
        out += d; tp = int({k.lower():v for k,v in h.items()}.get("x-result-total-pages", 1) or 1)
        if page >= tp or not d: break
        page += 1
    js=[]; blob=[]
    for j in out:
        if j.get("awarded"): continue
        a = j.get("advert") or {}; vals = {v.get("field_id"): v.get("value") for v in a.get("values",[])}
        loc = " | ".join(filter(None,[l.get("locality") or l.get("country") for l in a.get("locations") or []]))
        desc0 = strip(vals.get("description") or "")
        if not loc:  # some tenants leave geolocation empty and state location in the text
            m = re.search(r"(?:location|lokalizacja|miejsce pracy)\s*:?\s*([^\n.]{3,80})", desc0, re.I); loc = (m.group(1).strip() if m else "")
        desc = strip(" ".join(str(v) for k,v in vals.items() if k in ("description","requirements","responsibilities")))
        js.append((a.get("name",""), loc, bool(re.search(r"remote|zdaln", desc[:4000]+" "+a.get("name",""), re.I)))); blob.append(desc[:3000])
    return dict(total=len(js), jobs=js, display_name=None, text_blob=" ".join(blob[:5]))
def pinpoint(slug):
    st,_,b = req(f"https://{slug}.pinpointhq.com/postings.json"); d = J(b)
    if st != 200 or not isinstance(d, dict) or "data" not in d: return None
    js = [(j.get("title",""), (j.get("location") or {}).get("name","") if isinstance(j.get("location"),dict) else str(j.get("location") or ""), "remote" in str(j.get("workplace_type") or "").lower()) for j in d["data"]]
    return dict(total=len(js), jobs=js, display_name=None, text_blob=" ".join(strip(j.get("description",""))[:2000] for j in d["data"][:5]))
def bamboohr(slug):
    st,_,b = req(f"https://{slug}.bamboohr.com/careers/list"); d = J(b)
    if st != 200 or not isinstance(d, dict) or "result" not in d: return None
    js = [(j.get("jobOpeningName",""), ", ".join(filter(None,[(j.get("location") or {}).get("city"),(j.get("location") or {}).get("state")])), bool(j.get("isRemote"))) for j in d["result"]]
    return dict(total=len(js), jobs=js, display_name=None, text_blob="")
def workday(spec):  # spec = "tenant/wdN/site"
    t, wd, site = spec.split("/"); base = f"https://{t}.{wd}.myworkdayjobs.com/wday/cxs/{t}/{site}/jobs"; js=[]; off=0; total=None
    while True:
        st,_,b = req(base, data=json.dumps({"limit":20,"offset":off,"appliedFacets":{},"searchText":""}).encode(), headers={"Content-Type":"application/json"}, method="POST"); d = J(b)
        if st != 200 or not isinstance(d, dict): return None if off==0 else dict(total=total, jobs=js, display_name=None, text_blob="")
        if total is None: total = d.get("total", 0)
        js += [(j.get("title",""), j.get("locationsText",""), bool(re.search("remote",j.get("locationsText",""),re.I))) for j in d.get("jobPostings",[])]
        off += 20
        if off >= total or off >= 400 or not d.get("jobPostings"): break
    return dict(total=total, jobs=js, display_name=None, text_blob="", truncated=total>len(js))

FETCH = {"greenhouse":greenhouse,"lever":lever,"lever_eu":lambda s: lever(s,True),"ashby":ashby,"workable":workable,"smartrecruiters":smartrecruiters,
 "teamtailor":teamtailor,"recruitee":recruitee,"personio":personio,"breezy":breezy,"traffit":traffit,"pinpoint":pinpoint,"bamboohr":bamboohr,"workday":workday}
def urls(ats, slug, extra=None):
    host = slug if "." in slug else None
    return {
     "greenhouse": (f"https://job-boards.greenhouse.io/{slug}", f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"),
     "lever": (f"https://jobs.lever.co/{slug}", f"https://api.lever.co/v0/postings/{slug}?mode=json"),
     "lever_eu": (f"https://jobs.eu.lever.co/{slug}", f"https://api.eu.lever.co/v0/postings/{slug}?mode=json"),
     "ashby": (f"https://jobs.ashbyhq.com/{slug}", f"https://api.ashbyhq.com/posting-api/job-board/{slug}"),
     "workable": (f"https://apply.workable.com/{slug}/", f"https://apply.workable.com/api/v1/widget/accounts/{slug}"),
     "smartrecruiters": (f"https://jobs.smartrecruiters.com/{slug}", f"https://api.smartrecruiters.com/v1/companies/{slug}/postings"),
     "teamtailor": (f"https://{host or slug+'.teamtailor.com'}/jobs", f"https://{host or slug+'.teamtailor.com'}/jobs.rss"),
     "recruitee": (f"https://{host or slug+'.recruitee.com'}/", f"https://{host or slug+'.recruitee.com'}/api/offers/"),
     "personio": (f"https://{slug}.jobs.personio.{(extra or {}).get('tld','de')}/", f"https://{slug}.jobs.personio.{(extra or {}).get('tld','de')}/xml?language=en"),
     "breezy": (f"https://{slug}.breezy.hr/", f"https://{slug}.breezy.hr/json"),
     "traffit": (f"https://{slug}.traffit.com/career/", f"https://{slug}.traffit.com/public/job_posts/published"),
     "pinpoint": (f"https://{slug}.pinpointhq.com/", f"https://{slug}.pinpointhq.com/postings.json"),
     "bamboohr": (f"https://{slug}.bamboohr.com/careers", f"https://{slug}.bamboohr.com/careers/list"),
     "workday": (lambda t,w,s: (f"https://{t}.{w}.myworkdayjobs.com/{s}", f"POST https://{t}.{w}.myworkdayjobs.com/wday/cxs/{t}/{s}/jobs"))(*slug.split("/")) if ats=="workday" else None,
    }[ats]
