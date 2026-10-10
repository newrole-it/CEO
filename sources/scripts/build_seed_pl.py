#!/usr/bin/env python3
"""Build /workspace/jobscanner/seed-companies-pl.json from hand-reviewed selections (evidence in ats_detect*.json,
raw_probe_pl.json). Every entry is re-fetched live here; counts are measured at run time."""
import json, re, sys, os, datetime, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(__file__))
import ats_pl as A
NOW = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
LEAD = re.compile(r"\b(engineering manager|manager,? (software )?engineering|head of (engineering|software|platform|data|infrastructure|technology|development|tech|r&d|ml|ai)|director,?[^,]{0,25}(engineering|technology|software)|engineering director|vp[ ,.]{0,3}(of )?engineering|vice president[^,]{0,20}engineering|cto|chief technology|kierownik (zespołu|działu)? ?(it|programist|develop|in[żz]ynier)|dyrektor (it|technologii|techniczny|ds\. technologii)|engineering lead|tech(nical)? lead manager|delivery manager)", re.I)
PL = re.compile(r"poland|polska|warsaw|warszawa|krak|cracow|wroc|gdańsk|gdansk|gdynia|sopot|pozna|łódź|lodz|katowic|gliwice|szczecin|lublin|rzesz|bydgoszcz|toru|białystok|bialystok|bielsko|opole|kielce|olsztyn|\bPL\b|zdaln", re.I)
EU = re.compile(r"europe|emea|\beu\b|anywhere|worldwide|global", re.I)
# (name, ats, slug, evidence, hq_hint, notes)
SEL = [
("Nomagic","lever","Nomagic","careers page nomagic.ai/careers links jobs.lever.co/Nomagic","Warsaw (Kraków)",""),
("Survicate","traffit","survicate","careers page survicate.com/careers embeds survicate.traffit.com","Warsaw; remote EU",""),
("Huuuge Games","recruitee","huuuge","careers page huuugegames.com/careers links huuuge.recruitee.com","Warsaw, Szczecin, Bydgoszcz",""),
("Vercom","traffit","vercom","vercom.pl links vercom.traffit.com","Poznań, Kraków, Warsaw",""),
("Silent Eight","teamtailor","silenteight","silenteight.com/careers redirects to silenteight.teamtailor.com/jobs","Warsaw",""),
("Infermedica","traffit","infer","infermedica.com/careers embeds infer.traffit.com","Wrocław; remote PL","Traffit tenant slug is 'infer' (taken from careers page HTML); job texts don't name the company, identity rests on that link"),
("Kontakt.io","ashby","kontakt","kontakt.io/why-kontakt-io/careers links jobs.ashbyhq.com/kontakt","Kraków; New York",""),
("Payhawk","greenhouse","payhawkio","payhawk.com/careers links greenhouse payhawkio","Sofia, London, Barcelona, Warsaw? (UNVERIFIED hint)",""),
("Bloober Team","traffit","blooberteam","blooberteam.com links blooberteam.traffit.com","Kraków",""),
("People Can Fly","smartrecruiters","PeopleCanFly","peoplecanfly.com links careers.smartrecruiters.com/PeopleCanFly","Warsaw, Rzeszów, Łódź; remote",""),
("Mangopay (incl. Nethone)","teamtailor","mangopay","nethone.com redirects to mangopay.com/nethone, page links mangopay.teamtailor.com","Paris, London; Warsaw (Nethone)","Nethone (Warsaw) was acquired by Mangopay; board is Mangopay-wide"),
("edrone","teamtailor","edrone","edrone.me/about-us links edrone.teamtailor.com","Kraków",""),
("Polcode","traffit","polcode","polcode.com/careers embeds polcode.traffit.com","Kraków; remote PL",""),
("Boldare","breezy","boldare","boldare.com/career links boldare.breezy.hr","Gliwice, Warsaw, Wrocław",""),
("Intive","workday","intive/wd3/Intive","intive.com/careers links intive.wd3.myworkdayjobs.com/Intive","Szczecin, Wrocław, Gdańsk; LATAM",""),
("Vodeno (Aion)","personio","vodeno","vodeno.com/careers links vodeno.jobs.personio.de","Warsaw; remote PL",""),
("Tidio","recruitee","tidiocareer","careers.tidio.com/open-roles uses Recruitee tenant tidiocareer","Szczecin; remote",""),
("Appunite","recruitee","appunite","appunite.com links jobs.appunite.com (Recruitee custom domain; appunite.recruitee.com same data)","Poznań; remote",""),
("Ten Square Games","recruitee","tensquaregames","tensquaregames.com links career.tensquaregames.com (Recruitee custom domain)","Wrocław","A tensquaregames.traffit.com tenant also answers (1 job at check, text doesn't name company) - treated as legacy, not used"),
("STX Next","traffit","stxnext","career.stxnext.com embeds Traffit list widget; stxnext.traffit.com answers","Poznań; remote PL",""),
("Spacelift","teamtailor","careers.spacelift.io","spacelift.io links careers.spacelift.io (Teamtailor custom domain; teamtailor-cdn assets, /jobs.rss works)","Remote EU (PL founders); US",""),
("Merixstudio","traffit","merixstudio","merixstudio.com links careers.merixstudio.com (Traffit)","Poznań",""),
("Tutlo","traffit","tutlo","tutlo.com/pl/kariera links tutlo.traffit.com","Warsaw",""),
("Spyrosoft","teamtailor","careers.spyro-soft.com","web search 2026-10-10 -> careers.spyro-soft.com/jobs/<id>-<slug> (Teamtailor URL shape); /jobs.rss returns Teamtailor RSS titled 'Spyrosoft'","Wrocław, Kraków, Gdańsk, Szczecin...",""),
("Techland","smartrecruiters","TechlandSA","web search 2026-10-10 -> careers.smartrecruiters.com/TechlandSA; API company.name='Techland S.A.'","Wrocław, Warsaw",""),
("XTB","lever_eu","xtb","xtb.com/careers links jobs.lever.co/xtb; data served from EU Lever host (api.eu.lever.co); US host returns non-list","Warsaw",""),
("Exadel (acquired Codete)","greenhouse","exadelinc","codete.com redirects to exadel.com; exadel.com/careers embeds Greenhouse 'exadel'/'exadelinc'; only exadelinc answers","Kraków, Lublin, Warsaw (ex-Codete); global","Codete merged into Exadel; board name 'Exadel Inc (Website)'"),
("Pragmatic Coders","recruitee","pragmaticcoders","slug guess; Recruitee company_name='Pragmatic Coders'","Kraków; remote",""),
("11 bit studios","recruitee","11bitstudios","slug guess; Recruitee company_name='11 bit studios'","Warsaw",""),
("InPost","smartrecruiters","inpost","slug guess; SR company.name='InPost'","Kraków, Warsaw","An 'inpost' Teamtailor board also exists (display name 'InPost UK', UK ops roles) - not used"),
("Billennium","traffit","billennium","slug guess; job texts mention Billennium","Warsaw, Wrocław, Katowice...; global clients",""),
("OLX","lever_eu","olx","slug guess; EU Lever host; jobs mention OLX/OTOMOTO","Poznań, Warsaw, Kraków; Lisbon, Bucharest","A recruitee 'olx' board returned only a '(Sample)' job - not used"),
("PayU","lever","payugpo","slug guess; job texts mention PayU","Poznań, Warsaw, Kraków; Prague",""),
("ICEYE","ashby","iceye","slug guess; job texts mention ICEYE","Espoo; Warsaw/Gdańsk (ICEYE Polska)",""),
("Cosmose AI","traffit","cosmose","slug guess; job texts mention Cosmose","Warsaw",""),
("Ulam Labs","traffit","ulamlabs","slug guess; job texts mention Ulam","Wrocław",""),
("Jutro Medical","traffit","jutromedical","slug guess; job texts mention Jutro","Warsaw, Łódź","mostly clinical roles"),
("ZEN.COM","traffit","zen","slug guess; job texts mention ZEN","Wrocław, Rzeszów",""),
("Tpay","traffit","tpay","slug guess; job texts mention Tpay","Poznań",""),
("Autopay","traffit","autopay","slug guess; job texts mention Autopay","Sopot",""),
("Scalac","traffit","scalac","slug guess; job texts mention Scalac","Gdańsk; remote",""),
("Droptica","recruitee","droptica","slug guess; Recruitee company_name='Droptica'","Wrocław; remote",""),
("CI Games","teamtailor","cigames","slug guess; Teamtailor title 'CI Games'","Warsaw; remote",""),
("Uncapped","workable","uncapped","slug guess; Workable name 'Uncapped', Warsaw roles","London, Warsaw",""),
("Miquido","bamboohr","miquido","slug guess; BambooHR board has a 'Miquido Careers' opening + mobile eng roles","Kraków","no location data in list feed; identity moderate (careers.miquido.com does not link it in static HTML)"),
("iteo","traffit","iteo","slug guess; job texts mention iteo","Katowice","only an open-CV posting at check"),
("Motorola Solutions","workday","motorolasolutions/wd5/Careers","motorolasolutions.com careers page links this Workday site","Kraków (large eng hub)",""),
("Mastercard","workday","mastercard/wd1/CorporateCareers","careers.mastercard.com (Phenom) links this Workday site","Warsaw",""),
("Visa","workday","visa/wd5/Visa","corporate.visa.com/en/careers links this Workday site","Warsaw",""),
("Samsung (incl. SRPOL)","workday","sec/wd3/Samsung_Careers","samsung.com/pl/about-us/careers links this Workday site","Warsaw","Samsung R&D Poland may use other channels; only 1 PL hit at check"),
("Thomson Reuters","workday","thomsonreuters/wd5/External_Career_Site","thomsonreuters.com/en/careers links this Workday site","Gdynia (TR hub)",""),
("Fresha","lever","fresha","slug guess; job texts mention Fresha","London; (PL presence UNVERIFIED)","A 'fresha' Teamtailor board also answers (125 jobs); which is primary is UNVERIFIED"),
("Omnisend","lever","omnisend","slug guess; job texts mention Omnisend","Vilnius; remote","Lithuanian; included for EU-remote"),
]
FLAG = [
("Ramp Network","greenhouse","rampnetwork","rampnetwork.com/join-us links boards.eu.greenhouse.io/rampnetwork (EU-hosted Greenhouse)","US-host API returns 200 + 0 jobs; EU board page (WebFetch) says 'There are no current openings'. EU API host boards-api.eu.greenhouse.io was unreachable from the box (TLS hang) - UNVERIFIED"),
("Livespace","traffit","livespace","livespace.io/pl/praca embeds livespace.traffit.com","API 200, 0 published jobs at check"),
("Software Mansion","recruitee","jobs.swmansion.com","swmansion.com links jobs.swmansion.com (Recruitee custom domain)","API 200, 0 offers at check (only talent-pool/newsletter pages)"),
("10Clouds","workable","10clouds","10clouds.com/careers uses 10clouds@jobs.workablemail.com","Workable API 200, 0 jobs at check"),
("Sunscrapers","workable","sunscrapers","sunscrapers.com/careers links apply.workable.com/sunscrapers/","Workable widget API returns 404 at check - UNVERIFIED"),
]
def pl_stats(e, r):
    js = r["jobs"]
    if e["ats"] == "workday":
        t,w,s = e["slug"].split("/")
        st,_,b = A.req(f"https://{t}.{w}.myworkdayjobs.com/wday/cxs/{t}/{s}/jobs", data=json.dumps({"limit":20,"offset":0,"appliedFacets":{},"searchText":"Poland"}).encode(), headers={"Content-Type":"application/json"}, method="POST")
        d = A.J(b) or {}; plj = [(j.get("title",""), j.get("locationsText",""), False) for j in d.get("jobPostings",[])]
        e["pl_located_jobs_at_check"] = d.get("total"); e["notes"] = (e["notes"]+"; " if e["notes"] else "") + "PL count = Workday searchText='Poland' total (first 20 scanned for leadership)"
        pool = plj; eu = []
    else:
        e["pl_located_jobs_at_check"] = sum(1 for t,l,_ in js if PL.search(l or "") or PL.search(t))
        pool = [(t,l,rm) for t,l,rm in js if PL.search(l or "") or PL.search(t)]
        eu = [(t,l,rm) for t,l,rm in js if not (PL.search(l or "") or PL.search(t)) and rm and EU.search((l or "")+" "+t)]
    e["remote_flagged_jobs_at_check"] = None if e["ats"]=="workday" else sum(1 for _,_,rm in js if rm)
    p = [f"{t} [{l.strip()}]" for t,l,_ in pool if LEAD.search(t)]; q = [f"{t} [{l.strip()}]" for t,l,_ in eu if LEAD.search(t)]
    e["has_pl_eng_leadership_role_at_check"] = bool(p); e["has_eu_remote_eng_leadership_role_at_check"] = bool(q)
    e["has_pl_or_remote_eng_leadership_role_at_check"] = bool(p or q); e["sample_matching_roles"] = (p+q)[:6]
def build(item, flag=False):
    name, ats, slug, ev, hint, notes = item if not flag else (item[0],item[1],item[2],item[3],"",item[4])
    r = A.FETCH[ats](slug)
    board, api = A.urls(ats, slug, r)
    e = dict(name=name, ats=ats, slug=slug, board_url=board, api_url=api, hq_or_relevant_locations=hint or None, ats_evidence=ev,
             verified=bool(r and r["total"]>0) and not flag, verified_at=NOW, open_jobs_count_at_check=(r or {}).get("total"),
             identity_confirmed=not flag, notes=notes)
    if r and r.get("truncated"): e["notes"] = (e["notes"]+"; " if e["notes"] else "") + f"list scan capped at {len(r['jobs'])} of {r['total']}"
    if r and not flag: pl_stats(e, r)
    if flag or not e["verified"]: e["verified"] = False
    return e
if __name__ == "__main__":
    with cf.ThreadPoolExecutor(8) as ex:
        good = list(ex.map(build, SEL)); bad = list(ex.map(lambda x: build(x, True), FLAG))
    drop = [e for e in good if not e["verified"]]; good = [e for e in good if e["verified"]]
    # keep only EU-relevant: Fresha/Omnisend must show PL or EU-remote evidence
    for e in list(good):
        if e["name"] in ("Fresha","Omnisend") and not e["pl_located_jobs_at_check"] and not e["has_eu_remote_eng_leadership_role_at_check"]:
            good.remove(e); e["notes"] += "; dropped: 0 Poland-located jobs at check"; drop.append(e)
    already = json.load(open("/workspace/jobscanner/seed-companies.json"))["companies"]
    pl_in_main = [dict(name=c["name"], ats=c["ats"], slug=c["slug"], pl_located_jobs_at_check=c.get("pl_located_jobs_at_check")) for c in already if (c.get("pl_located_jobs_at_check") or 0) > 0]
    out = dict(generated_at=NOW, method="Each board re-fetched live by scripts/build_seed_pl.py (fetchers in scripts/ats_pl.py). ATS identified from careers-page HTML/links (scripts/detect_ats.py, detect_ats2.py) or a slug guess that passed identity checks (board/company name or job text names the company). verified=true => HTTP 200 + parseable feed + >=1 open job. pl_located_jobs_at_check = location or title matches Polish city/country regex. Leadership flags = title regex (EM/Head/Director/VP/CTO/Delivery Manager/kierownik/dyrektor) on PL-located jobs, or on remote-flagged EU/EMEA jobs. hq_or_relevant_locations is a hand-written hint (UNVERIFIED). Companies already in seed-companies.json are NOT duplicated (see already_in_seed_companies_json).",
        ats_types=sorted({e["ats"] for e in good}), companies=good, flagged_not_used=bad+drop,
        already_in_seed_companies_json=pl_in_main)
    P="/workspace/jobscanner/seed-companies-pl.json"
    if os.path.exists(P):  # keep hand-written review sections across re-runs
        old=json.load(open(P)); [out.__setitem__(k, old[k]) for k in ("corrections_to_seed_companies_json","unsupported_or_unresolved") if k in old]
    json.dump(out, open(P,"w"), indent=1, ensure_ascii=False)
    from collections import Counter
    print("verified:", len(good), Counter(e["ats"] for e in good)); print("flagged:", [(e["name"],e["ats"],e["open_jobs_count_at_check"]) for e in bad+drop])
    print("PL jobs total:", sum(e["pl_located_jobs_at_check"] or 0 for e in good), "PL lead:", sum(e["has_pl_eng_leadership_role_at_check"] for e in good), "EU lead:", sum(e["has_eu_remote_eng_leadership_role_at_check"] for e in good))
    for e in good: print(f"{e['name'][:26]:26} {e['ats']:15} {e['open_jobs_count_at_check']:>5} PL={e['pl_located_jobs_at_check']} {e['sample_matching_roles'][:2]}")
