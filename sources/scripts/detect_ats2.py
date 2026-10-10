"""Pass 2: for companies with no signal, follow career-like links (1 hop) from fetched pages."""
import json, re, urllib.parse, concurrent.futures as cf
from detect_ats import fetch, detect
d=json.load(open("ats_detect.json"))
KW=re.compile(r"career|kariera|praca|jobs|join|work-with|hiring|vacanc|positions|oferty|rekrutacja",re.I)
def run(name):
    seen=set(); res=[]
    for r in d[name]:
        st,final,html=fetch(r["final_url"]) if r["status"]==200 else (0,"","")
        if not html: continue
        for h in re.findall(r'href=["\']([^"\'#]+)',html):
            u=urllib.parse.urljoin(final,h)
            if KW.search(u) and u not in seen and len(seen)<12 and not re.search(r"\.(png|jpg|svg|css|js|pdf)$",u):
                seen.add(u); s2,f2,h2=fetch(u); sig=detect(h2) if h2 else {}
                if sig: return name,{"url":u,"final_url":f2,"ats_signals":sig}
        break
    return name,{"tried":sorted(seen)}
todo=[n for n,r in d.items() if not any(x["ats_signals"] for x in r)]
with cf.ThreadPoolExecutor(8) as ex: out=dict(ex.map(run,todo))
json.dump(out,open("ats_detect2.json","w"),indent=1)
for n,r in out.items(): print(f"{n[:24]:24}", json.dumps(r.get("ats_signals")) if "ats_signals" in r else "NONE "+" ".join(r["tried"][:4])[:200], r.get("url",""))
