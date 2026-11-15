/**
 * Strings for the evaluation of an offer before applying (src/server/evaluation). Keys "ev.".
 */
export const evaluationPl = {
  "ev.title": "Czy warto aplikować",
  "ev.sub": "{title} · {company}",
  "ev.back": "Wróć do oferty",
  "ev.source":
    "Układ tej oceny (kilka wymiarów, progi decyzji i reguły, które zmieniają decyzję bez zmiany wyniku) wzorujemy na projekcie career-ops (MIT). Wagi i punkty ustaliliśmy sami.",

  "ev.none.title": "Tej oferty jeszcze nie oceniliśmy",
  "ev.none.body":
    "Porównamy ofertę z Twoim CV ogólnym i profilem: wymagania, poziom stanowiska, wynagrodzenie, tryb pracy i samo ogłoszenie. Każdy wynik liczy kod i pokazuje dane, z których powstał.",
  "ev.none.noModel":
    "Model językowy nie jest skonfigurowany, więc nie sprawdzimy wymagań oferty w Twoim CV i nie będzie wyniku łącznego. Policzymy to, co wynika z reguł: poziom, wynagrodzenie, tryb pracy i pewność rekrutacji.",
  "ev.run": "Oceń ofertę",
  "ev.rerun": "Oceń ponownie",
  "ev.run.title": "Oceniamy ofertę",
  "ev.run.wait": "Model czyta ofertę i Twoje CV. Nie zamykaj tej karty.",
  "ev.step.score": "Wynik i decyzja",
  "ev.step.score.hint": "Kod liczy wymiary, wynik łączny i decyzję.",
  "ev.err.failed": "Nie udało się ocenić oferty. Spróbuj ponownie.",
  "ev.err.noJob": "Nie znaleźliśmy tej oferty.",

  "ev.decision.apply": "Warto aplikować",
  "ev.decision.consider": "Do rozważenia",
  "ev.decision.skip": "Lepiej odpuścić",
  "ev.decision.unknown": "Za mało danych na decyzję",
  "ev.decision.apply.hint":
    "Wynik łączny to co najmniej {apply} na 100 i żadna z reguł poniżej nie zmienia decyzji.",
  "ev.decision.consider.hint":
    "Wynik łączny jest niższy niż {apply} na 100 albo jedna z reguł poniżej obniża decyzję.",
  "ev.decision.skip.hint":
    "Wynik łączny jest niższy niż {consider} na 100 albo jedna z reguł poniżej wymusza tę decyzję.",
  "ev.decision.unknown.hint":
    "Nie sprawdziliśmy wymagań oferty w Twoim CV, więc nie ma wyniku łącznego. Poniżej jest to, co dało się policzyć, i powód, dla którego brakuje reszty.",
  "ev.score.label": "Wynik łączny",
  "ev.score.value": "{n}/100",
  "ev.score.none": "Brak wyniku łącznego",
  "ev.coverage":
    "Wynik obejmuje {n}% wagi wymiarów. Wymiar, dla którego brakuje danych, nie wchodzi do wyniku.",
  "ev.stops.title": "Reguły, które zmieniają decyzję niezależnie od wyniku",
  "ev.stop.critical-gap":
    "Wśród wymaganych jest luka krytyczna: Twoje CV i profil w ogóle tego nie pokazują. To wymusza decyzję „Lepiej odpuścić”.",
  "ev.stop.closed": "Ogłoszenie jest zamknięte. To wymusza decyzję „Lepiej odpuścić”.",
  "ev.stop.pay-below-minimum":
    "Górna granica widełek jest niższa niż Twoje minimum. Decyzja to wtedy najwyżej „Do rozważenia”.",
  "ev.stop.low-hiring-confidence":
    "Mało wskazuje na to, że firma teraz zatrudnia na to stanowisko. Decyzja to wtedy najwyżej „Do rozważenia”.",
  "ev.meta.cv": "Ocena z {when}, na podstawie CV „{cv}”.",
  "ev.meta.noCv": "Ocena z {when}.",
  "ev.meta.rules": "Model nie brał udziału w tej ocenie: policzyliśmy tylko to, co wynika z reguł.",
  "ev.stale.title": "Ta ocena może być nieaktualna",
  "ev.stale.cv": "Od czasu tej oceny zmieniło się Twoje CV.",
  "ev.stale.offer": "Od czasu tej oceny zmieniła się treść oferty.",
  "ev.stale.profile": "Od czasu tej oceny zmienił się Twój profil.",

  "ev.dims.title": "Wymiary oceny",
  "ev.dims.sub":
    "Każdy wymiar liczy kod z danych pokazanych przy nim. Gdy danych brakuje, wymiar nie ma wyniku. Nie wstawiamy wtedy wartości środkowej.",
  "ev.dim.requirements": "Wymagania",
  "ev.dim.level": "Poziom stanowiska",
  "ev.dim.pay": "Wynagrodzenie",
  "ev.dim.workMode": "Tryb pracy i miejsce",
  "ev.dim.posting": "Ogłoszenie",
  "ev.dim.weight": "waga {n}%",
  "ev.dim.score": "{n}/100",
  "ev.dim.unknown": "nie wiadomo",

  "ev.req.required": "Wymagane: spełnione {met} z {total}, częściowo {partial}.",
  "ev.req.preferred": "Mile widziane: spełnione {met} z {total}, częściowo {partial}.",
  "ev.req.formula":
    "To wynik dopasowania: wymagane liczą się w 70%, mile widziane w 30%, a spełnione częściowo liczy się w połowie.",
  "ev.req.why.no-model":
    "Model językowy nie jest skonfigurowany, więc nie sprawdziliśmy wymagań oferty w Twoim CV.",
  "ev.req.why.no-cv":
    "Nie masz jeszcze CV z treścią, z którym można porównać ofertę. Dodaj CV i oceń ofertę ponownie.",
  "ev.req.why.no-offer-text":
    "Nie mamy treści tej oferty. Wklej ją na stronie oferty i oceń ofertę ponownie.",
  "ev.req.why.withheld":
    "Strona z tą ofertą nie zgadza się na czytanie jej przez AI, więc model nie dostał treści oferty.",
  "ev.req.why.offer-failed": "Model nie odczytał wymagań z treści oferty. Oceń ofertę ponownie.",
  "ev.req.why.match-failed":
    "Model odczytał wymagania, ale nie sprawdził ich w Twoim CV. Oceń ofertę ponownie.",
  "ev.req.why.no-requirements":
    "W ofercie nie ma wymagań ani elementów mile widzianych, więc nie ma czego punktować.",

  "ev.lvl.intern": "Stażysta",
  "ev.lvl.junior": "Junior",
  "ev.lvl.mid": "Mid",
  "ev.lvl.senior": "Senior",
  "ev.lvl.lead": "Lead",
  "ev.lvl.principal": "Principal",
  "ev.lvl.manager": "Manager",
  "ev.lvl.senior_manager": "Senior manager",
  "ev.lvl.head": "Head",
  "ev.lvl.director": "Dyrektor",
  "ev.lvl.vp": "VP",
  "ev.lvl.c_level": "C-level",
  "ev.level.offer.stated": "Oferta: {level}. W ofercie: „{quote}”.",
  "ev.level.offer.title": "Oferta: {level}. Odczytane z tytułu: „{quote}”.",
  "ev.level.offer.none": "Oferta nie podaje poziomu stanowiska.",
  "ev.level.person": "Twój profil: {level}.",
  "ev.level.person.none": "W Twoim profilu nie ma poziomu.",
  "ev.level.why.same": "Oferta i Twój profil mają ten sam poziom.",
  "ev.level.why.above.one": "Oferta jest o {n} poziom wyżej niż Twój profil.",
  "ev.level.why.above.few": "Oferta jest o {n} poziomy wyżej niż Twój profil.",
  "ev.level.why.above.many": "Oferta jest o {n} poziomów wyżej niż Twój profil.",
  "ev.level.why.below.one": "Oferta jest o {n} poziom niżej niż Twój profil.",
  "ev.level.why.below.few": "Oferta jest o {n} poziomy niżej niż Twój profil.",
  "ev.level.why.below.many": "Oferta jest o {n} poziomów niżej niż Twój profil.",
  "ev.level.why.track":
    "Jeden z tych poziomów jest menedżerski, a drugi specjalistyczny. Takich ścieżek nie porównujemy, więc ten wymiar nie ma wyniku.",
  "ev.level.why.offer-unknown":
    "Ani treść oferty, ani jej tytuł nie nazywają poziomu, więc ten wymiar nie ma wyniku.",
  "ev.level.why.person-unknown": "Podaj poziom w profilu, żeby porównać go z ofertą.",
  "ev.level.rule":
    "Ten sam poziom daje {same}, różnica jednego poziomu {one}, dwóch {two}, a większa {further}.",

  "ev.pay.offer.range": "Oferta: {min}–{max} {currency}.",
  "ev.pay.offer.from": "Oferta: od {min} {currency}.",
  "ev.pay.offer.upTo": "Oferta: do {max} {currency}.",
  "ev.pay.offer.one": "Oferta: {min} {currency}.",
  "ev.pay.offer.none": "W danych oferty nie ma kwoty.",
  "ev.pay.period.hour": "Okres w ofercie: godzina.",
  "ev.pay.period.day": "Okres w ofercie: dzień.",
  "ev.pay.period.month": "Okres w ofercie: miesiąc.",
  "ev.pay.period.year": "Okres w ofercie: rok.",
  "ev.pay.period.none": "Oferta nie podaje, za jaki okres jest ta kwota.",
  "ev.pay.period.quote": "Okres odczytany z wiersza oferty: „{quote}”.",
  "ev.pay.expected.both.month":
    "Twój profil, miesięcznie: minimum {floor} {currency}, cel {target} {currency}.",
  "ev.pay.expected.both.year":
    "Twój profil, rocznie: minimum {floor} {currency}, cel {target} {currency}.",
  "ev.pay.expected.floor.month": "Twój profil, miesięcznie: minimum {floor} {currency}.",
  "ev.pay.expected.floor.year": "Twój profil, rocznie: minimum {floor} {currency}.",
  "ev.pay.expected.target.month": "Twój profil, miesięcznie: cel {target} {currency}.",
  "ev.pay.expected.target.year": "Twój profil, rocznie: cel {target} {currency}.",
  "ev.pay.expected.none": "W Twoim profilu nie ma oczekiwanego wynagrodzenia.",
  "ev.pay.perMonth": "Kwoty roczne podzieliliśmy przez 12, żeby porównać je miesięcznie.",
  "ev.pay.why.target": "Górna granica widełek sięga Twojego celu.",
  "ev.pay.why.meets": "Całe widełki są na poziomie Twojego minimum albo wyżej.",
  "ev.pay.why.straddle": "Twoje minimum mieści się w widełkach, ale ich dolna granica jest niżej.",
  "ev.pay.why.near-target":
    "Górna granica widełek jest niższa od Twojego celu najwyżej o jedną piątą.",
  "ev.pay.why.below": "Górna granica widełek jest niższa niż Twoje minimum.",
  "ev.pay.why.belowTarget":
    "Górna granica widełek jest niższa od Twojego celu o ponad jedną piątą.",
  "ev.pay.why.far-below":
    "Górna granica widełek jest niższa niż Twoje minimum o ponad jedną piątą.",
  "ev.pay.why.offer-undisclosed":
    "W danych oferty nie ma kwoty, więc nie ma czego porównać. Kwoty zapisanej tylko w treści oferty jeszcze nie odczytujemy.",
  "ev.pay.why.no-expectation":
    "Podaj w profilu oczekiwane wynagrodzenie, żeby porównać je z ofertą.",
  "ev.pay.why.currency":
    "Oferta i Twój profil podają różne waluty albo jedno z nich nie podaje waluty. Nie przeliczamy kursów.",
  "ev.pay.why.period-unknown":
    "Nie wiadomo, za jaki okres jest kwota z oferty, więc jej nie porównujemy.",
  "ev.pay.why.period-differs":
    "Oferta podaje stawkę za godzinę albo dzień, a Twój profil kwotę za miesiąc albo rok. Nie zakładamy liczby godzin.",
  "ev.pay.note":
    "Porównujemy same kwoty w tej samej walucie. Nie przeliczamy rodzaju umowy (B2B, umowa o pracę) ani podatków i nie korzystamy z danych rynkowych.",

  "ev.mode.offer.REMOTE": "Oferta: praca zdalna.",
  "ev.mode.offer.HYBRID": "Oferta: praca hybrydowa.",
  "ev.mode.offer.ONSITE": "Oferta: praca stacjonarna.",
  "ev.mode.offer.UNKNOWN": "W danych oferty nie ma trybu pracy.",
  "ev.mode.location": "Miejsce w ofercie: {location}.",
  "ev.mode.pref.remote": "Twój profil: praca zdalna.",
  "ev.mode.pref.hybrid": "Twój profil: praca hybrydowa.",
  "ev.mode.pref.onsite": "Twój profil: praca stacjonarna.",
  "ev.mode.pref.any": "Twój profil: dowolny tryb pracy.",
  "ev.mode.pref.none": "W Twoim profilu nie ma preferowanego trybu pracy.",
  "ev.mode.places": "Twoje miejsca: {places}.",
  "ev.mode.relocation.yes": "Przeprowadzka: tak.",
  "ev.mode.relocation.no": "Przeprowadzka: nie.",
  "ev.mode.why.same": "Tryb pracy z oferty jest taki, jaki wolisz.",
  "ev.mode.why.any": "Odpowiada Ci każdy tryb pracy.",
  "ev.mode.why.adjacent":
    "Tryb pracy z oferty jest o jeden krok od tego, który wolisz (zdalnie, hybrydowo, stacjonarnie).",
  "ev.mode.why.opposite": "Oferta i Twój profil są na przeciwnych końcach: zdalnie i stacjonarnie.",
  "ev.mode.why.place":
    "Biuro jest w mieście, którego nie ma w Twoim profilu, a w profilu nie zaznaczono przeprowadzki.",
  "ev.mode.why.offer-unknown": "W danych oferty nie ma trybu pracy, więc ten wymiar nie ma wyniku.",
  "ev.mode.why.no-preference": "Podaj w profilu preferowany tryb pracy, żeby porównać go z ofertą.",
  "ev.mode.rule": "Ten sam tryb daje {same}, sąsiedni {adjacent}, a przeciwny {opposite}.",
  "ev.place.match": "Biuro jest w jednym z Twoich miast.",
  "ev.place.relocation": "Biuro jest w innym mieście, a w profilu zaznaczono przeprowadzkę.",
  "ev.place.mismatch": "Biuro jest w innym mieście niż Twoje.",
  "ev.place.unknown":
    "Nie porównaliśmy miasta biura z Twoimi miastami: oferta albo profil nie podaje miasta, które rozpoznajemy.",
  "ev.place.not-needed": "Przy pracy zdalnej nie sprawdzamy miasta ani kraju.",

  "ev.posting.hiring": "Pewność rekrutacji: {n}/100.",
  "ev.posting.flags": "Czerwone flagi w treści oferty: {n}. Odejmujemy {points} pkt.",
  "ev.posting.flags.none": "W treści oferty nie ma czerwonych flag.",
  "ev.posting.flags.unknown":
    "Czerwonych flag nie sprawdziliśmy, bo treści oferty nie czytał model.",
  "ev.posting.closed": "Ogłoszenie jest zamknięte, więc ten wymiar nie ma wyniku.",
  "ev.posting.rule":
    "Wynik to pewność rekrutacji pomniejszona o {points} pkt za każdą czerwoną flagę. Liczymy najwyżej {max}.",

  "ev.table.title": "Wymagania oferty w Twoich danych",
  "ev.table.sub":
    "Model wskazuje fragment Twojego CV albo profilu, a kod sprawdza, czy ten fragment naprawdę tam jest. Fragment, którego nie znalazł, się nie liczy.",
  "ev.table.none": "Wymagań nie sprawdziliśmy. Powód znajdziesz wyżej, przy wymiarze „Wymagania”.",
  "ev.group.required": "Wymagane",
  "ev.group.preferred": "Mile widziane",
  "ev.group.soft": "Kompetencje miękkie",
  "ev.status.met": "Spełniasz",
  "ev.status.partial": "Częściowo",
  "ev.status.missing": "Brak",
  "ev.gap.critical": "Luka krytyczna",
  "ev.gap.major": "Luka istotna",
  "ev.gap.minor": "Luka drobna",
  "ev.evidence": "Z Twoich danych: „{quote}”",

  "ev.gaps.title": "Luki w wymaganych",
  "ev.gaps.sub":
    "Wymagane elementy, których Twoje CV i profil nie pokazują w całości, od najpoważniejszej. Przy każdej jest uczciwy sposób, jak sobie z nią poradzić.",
  "ev.gaps.none": "Twoje CV i profil pokazują każdy wymagany element.",
  "ev.gaps.noNote": "Model nie podał sposobu na tę lukę.",
  "ev.lead.title": "Od czego zacząć",
  "ev.strengths.title": "Twoje mocne strony w tej ofercie",
  "ev.flags.title": "Czerwone flagi w ofercie",
  "ev.flags.sub": "Każda jest cytatem z treści oferty.",

  "ev.next.title": "Co dalej",
  "ev.next.tailor": "Dopasuj CV do tej oferty",
  "ev.next.match": "Zobacz dopasowanie CV",
  "ev.next.offer": "Otwórz ofertę",
  "ev.next.profile": "Uzupełnij profil",
  "ev.next.cv": "Moje CV",

  "ev.card.none": "Sprawdź, czy warto aplikować, zanim dopasujesz CV.",
  "ev.card.open": "Zobacz ocenę",
  "ev.card.when": "Ocena z {when}.",
  "ev.card.stale": "Od tego czasu zmieniło się Twoje CV, profil albo treść oferty.",
}

export const evaluationEn: Record<keyof typeof evaluationPl, string> = {
  "ev.title": "Is it worth applying",
  "ev.sub": "{title} · {company}",
  "ev.back": "Back to the offer",
  "ev.source":
    "The shape of this evaluation (several dimensions, decision thresholds, and rules that change the decision without changing the score) follows the career-ops project (MIT). The weights and points are our own.",

  "ev.none.title": "We haven't evaluated this offer yet",
  "ev.none.body":
    "We compare the offer with your general CV and your profile: requirements, level, pay, work mode and the posting itself. Code computes every score and shows the data it came from.",
  "ev.none.noModel":
    "No language model is set up, so we won't check the offer's requirements against your CV and there will be no overall score. We'll compute what rules can: level, pay, work mode and hiring confidence.",
  "ev.run": "Evaluate the offer",
  "ev.rerun": "Evaluate again",
  "ev.run.title": "Evaluating the offer",
  "ev.run.wait": "The model is reading the offer and your CV. Keep this tab open.",
  "ev.step.score": "Score and decision",
  "ev.step.score.hint": "Code computes the dimensions, the overall score and the decision.",
  "ev.err.failed": "We couldn't evaluate the offer. Try again.",
  "ev.err.noJob": "We couldn't find this offer.",

  "ev.decision.apply": "Worth applying",
  "ev.decision.consider": "Worth considering",
  "ev.decision.skip": "Better to skip",
  "ev.decision.unknown": "Not enough data to decide",
  "ev.decision.apply.hint":
    "The overall score is at least {apply} out of 100 and none of the rules below changes the decision.",
  "ev.decision.consider.hint":
    "The overall score is below {apply} out of 100, or one of the rules below lowers the decision.",
  "ev.decision.skip.hint":
    "The overall score is below {consider} out of 100, or one of the rules below forces this decision.",
  "ev.decision.unknown.hint":
    "We didn't check the offer's requirements against your CV, so there is no overall score. Below is what could be computed, and why the rest is missing.",
  "ev.score.label": "Overall score",
  "ev.score.value": "{n}/100",
  "ev.score.none": "No overall score",
  "ev.coverage":
    "The score covers {n}% of the dimensions' weight. A dimension with missing data stays out of the score.",
  "ev.stops.title": "Rules that change the decision whatever the score",
  "ev.stop.critical-gap":
    "One of the required items is a critical gap: your CV and profile don't show it at all. This forces “Better to skip”.",
  "ev.stop.closed": "The posting is closed. This forces “Better to skip”.",
  "ev.stop.pay-below-minimum":
    "The top of the pay range is below your minimum. The decision is then “Worth considering” at most.",
  "ev.stop.low-hiring-confidence":
    "Little suggests the company is hiring for this role now. The decision is then “Worth considering” at most.",
  "ev.meta.cv": "Evaluated {when}, against the CV “{cv}”.",
  "ev.meta.noCv": "Evaluated {when}.",
  "ev.meta.rules": "No model took part in this evaluation: we computed only what rules can.",
  "ev.stale.title": "This evaluation may be out of date",
  "ev.stale.cv": "Your CV has changed since this evaluation.",
  "ev.stale.offer": "The offer's text has changed since this evaluation.",
  "ev.stale.profile": "Your profile has changed since this evaluation.",

  "ev.dims.title": "Dimensions",
  "ev.dims.sub":
    "Code computes each dimension from the data shown next to it. When data is missing, the dimension has no score. We don't put a middle value in its place.",
  "ev.dim.requirements": "Requirements",
  "ev.dim.level": "Level",
  "ev.dim.pay": "Pay",
  "ev.dim.workMode": "Work mode and place",
  "ev.dim.posting": "The posting",
  "ev.dim.weight": "weight {n}%",
  "ev.dim.score": "{n}/100",
  "ev.dim.unknown": "unknown",

  "ev.req.required": "Required: {met} of {total} met, {partial} partly.",
  "ev.req.preferred": "Nice to have: {met} of {total} met, {partial} partly.",
  "ev.req.formula":
    "This is the match score: required items count for 70%, nice-to-have ones for 30%, and a partly met item counts as half.",
  "ev.req.why.no-model":
    "No language model is set up, so we didn't check the offer's requirements against your CV.",
  "ev.req.why.no-cv":
    "You don't have a CV with content to compare the offer with yet. Add a CV and evaluate the offer again.",
  "ev.req.why.no-offer-text":
    "We don't have this offer's text. Paste it on the offer's page and evaluate the offer again.",
  "ev.req.why.withheld":
    "The site with this offer opts out of AI reading it, so the model was not given the offer's text.",
  "ev.req.why.offer-failed":
    "The model didn't read any requirements from the offer's text. Evaluate the offer again.",
  "ev.req.why.match-failed":
    "The model read the requirements but didn't check them against your CV. Evaluate the offer again.",
  "ev.req.why.no-requirements":
    "The offer lists neither required nor nice-to-have items, so there is nothing to score.",

  "ev.lvl.intern": "Intern",
  "ev.lvl.junior": "Junior",
  "ev.lvl.mid": "Mid",
  "ev.lvl.senior": "Senior",
  "ev.lvl.lead": "Lead",
  "ev.lvl.principal": "Principal",
  "ev.lvl.manager": "Manager",
  "ev.lvl.senior_manager": "Senior manager",
  "ev.lvl.head": "Head",
  "ev.lvl.director": "Director",
  "ev.lvl.vp": "VP",
  "ev.lvl.c_level": "C-level",
  "ev.level.offer.stated": "The offer: {level}. In the offer: “{quote}”.",
  "ev.level.offer.title": "The offer: {level}. Read from the title: “{quote}”.",
  "ev.level.offer.none": "The offer doesn't state a level.",
  "ev.level.person": "Your profile: {level}.",
  "ev.level.person.none": "Your profile has no level.",
  "ev.level.why.same": "The offer and your profile are at the same level.",
  "ev.level.why.above.one": "The offer is {n} level above your profile.",
  "ev.level.why.above.few": "The offer is {n} levels above your profile.",
  "ev.level.why.above.many": "The offer is {n} levels above your profile.",
  "ev.level.why.below.one": "The offer is {n} level below your profile.",
  "ev.level.why.below.few": "The offer is {n} levels below your profile.",
  "ev.level.why.below.many": "The offer is {n} levels below your profile.",
  "ev.level.why.track":
    "One of these levels is a management one and the other a specialist one. We don't compare such tracks, so this dimension has no score.",
  "ev.level.why.offer-unknown":
    "Neither the offer's text nor its title names a level, so this dimension has no score.",
  "ev.level.why.person-unknown": "Add your level to your profile to compare it with the offer.",
  "ev.level.rule":
    "The same level gives {same}, one level apart {one}, two levels {two}, and more than that {further}.",

  "ev.pay.offer.range": "The offer: {min}–{max} {currency}.",
  "ev.pay.offer.from": "The offer: from {min} {currency}.",
  "ev.pay.offer.upTo": "The offer: up to {max} {currency}.",
  "ev.pay.offer.one": "The offer: {min} {currency}.",
  "ev.pay.offer.none": "The offer's data has no amount.",
  "ev.pay.period.hour": "Period in the offer: an hour.",
  "ev.pay.period.day": "Period in the offer: a day.",
  "ev.pay.period.month": "Period in the offer: a month.",
  "ev.pay.period.year": "Period in the offer: a year.",
  "ev.pay.period.none": "The offer doesn't say what period this amount is for.",
  "ev.pay.period.quote": "Period read from this line of the offer: “{quote}”.",
  "ev.pay.expected.both.month":
    "Your profile, per month: minimum {floor} {currency}, target {target} {currency}.",
  "ev.pay.expected.both.year":
    "Your profile, per year: minimum {floor} {currency}, target {target} {currency}.",
  "ev.pay.expected.floor.month": "Your profile, per month: minimum {floor} {currency}.",
  "ev.pay.expected.floor.year": "Your profile, per year: minimum {floor} {currency}.",
  "ev.pay.expected.target.month": "Your profile, per month: target {target} {currency}.",
  "ev.pay.expected.target.year": "Your profile, per year: target {target} {currency}.",
  "ev.pay.expected.none": "Your profile has no expected pay.",
  "ev.pay.perMonth": "We divided yearly amounts by 12 to compare them per month.",
  "ev.pay.why.target": "The top of the range reaches your target.",
  "ev.pay.why.meets": "The whole range is at or above your minimum.",
  "ev.pay.why.straddle":
    "Your minimum lies inside the range, but the bottom of the range is below it.",
  "ev.pay.why.near-target": "The top of the range is below your target by a fifth at most.",
  "ev.pay.why.below": "The top of the range is below your minimum.",
  "ev.pay.why.belowTarget": "The top of the range is below your target by more than a fifth.",
  "ev.pay.why.far-below": "The top of the range is below your minimum by more than a fifth.",
  "ev.pay.why.offer-undisclosed":
    "The offer's data has no amount, so there is nothing to compare. We don't yet read an amount that is written only in the offer's text.",
  "ev.pay.why.no-expectation":
    "Add your expected pay to your profile to compare it with the offer.",
  "ev.pay.why.currency":
    "The offer and your profile name different currencies, or one of them names none. We don't convert currencies.",
  "ev.pay.why.period-unknown":
    "We can't tell what period the offer's amount is for, so we don't compare it.",
  "ev.pay.why.period-differs":
    "The offer gives an hourly or daily rate and your profile a monthly or yearly amount. We don't assume a number of hours.",
  "ev.pay.note":
    "We compare the amounts alone, in the same currency. We don't convert contract type (B2B, employment) or taxes, and we use no market data.",

  "ev.mode.offer.REMOTE": "The offer: remote.",
  "ev.mode.offer.HYBRID": "The offer: hybrid.",
  "ev.mode.offer.ONSITE": "The offer: on-site.",
  "ev.mode.offer.UNKNOWN": "The offer's data has no work mode.",
  "ev.mode.location": "Place in the offer: {location}.",
  "ev.mode.pref.remote": "Your profile: remote.",
  "ev.mode.pref.hybrid": "Your profile: hybrid.",
  "ev.mode.pref.onsite": "Your profile: on-site.",
  "ev.mode.pref.any": "Your profile: any work mode.",
  "ev.mode.pref.none": "Your profile has no preferred work mode.",
  "ev.mode.places": "Your places: {places}.",
  "ev.mode.relocation.yes": "Relocation: yes.",
  "ev.mode.relocation.no": "Relocation: no.",
  "ev.mode.why.same": "The offer's work mode is the one you prefer.",
  "ev.mode.why.any": "Any work mode suits you.",
  "ev.mode.why.adjacent":
    "The offer's work mode is one step from the one you prefer (remote, hybrid, on-site).",
  "ev.mode.why.opposite": "The offer and your profile are at opposite ends: remote and on-site.",
  "ev.mode.why.place":
    "The office is in a city your profile doesn't list, and your profile doesn't say you would relocate.",
  "ev.mode.why.offer-unknown": "The offer's data has no work mode, so this dimension has no score.",
  "ev.mode.why.no-preference":
    "Add your preferred work mode to your profile to compare it with the offer.",
  "ev.mode.rule":
    "The same mode gives {same}, the next one {adjacent}, and the opposite {opposite}.",
  "ev.place.match": "The office is in one of your cities.",
  "ev.place.relocation": "The office is in another city, and your profile says you would relocate.",
  "ev.place.mismatch": "The office is in a city other than yours.",
  "ev.place.unknown":
    "We didn't compare the office's city with yours: the offer or your profile names no city we recognise.",
  "ev.place.not-needed": "For remote work we don't check the city or the country.",

  "ev.posting.hiring": "Hiring confidence: {n}/100.",
  "ev.posting.flags": "Red flags in the offer's text: {n}. We take off {points} pts.",
  "ev.posting.flags.none": "The offer's text has no red flags.",
  "ev.posting.flags.unknown":
    "We didn't check for red flags, because no model read the offer's text.",
  "ev.posting.closed": "The posting is closed, so this dimension has no score.",
  "ev.posting.rule":
    "The score is the hiring confidence less {points} pts for each red flag. We count {max} at most.",

  "ev.table.title": "The offer's requirements in your data",
  "ev.table.sub":
    "The model points to a fragment of your CV or profile, and code checks that the fragment is really there. A fragment it can't find doesn't count.",
  "ev.table.none":
    "We didn't check the requirements. The reason is above, next to the “Requirements” dimension.",
  "ev.group.required": "Required",
  "ev.group.preferred": "Nice to have",
  "ev.group.soft": "Soft skills",
  "ev.status.met": "Met",
  "ev.status.partial": "Partly",
  "ev.status.missing": "Missing",
  "ev.gap.critical": "Critical gap",
  "ev.gap.major": "Major gap",
  "ev.gap.minor": "Minor gap",
  "ev.evidence": "From your data: “{quote}”",

  "ev.gaps.title": "Gaps in the required items",
  "ev.gaps.sub":
    "Required items your CV and profile don't fully show, the most serious first. Each comes with an honest way to handle it.",
  "ev.gaps.none": "Your CV and profile show every required item.",
  "ev.gaps.noNote": "The model gave no way to handle this gap.",
  "ev.lead.title": "What to lead with",
  "ev.strengths.title": "Your strengths for this offer",
  "ev.flags.title": "Red flags in the offer",
  "ev.flags.sub": "Each one is a quote from the offer's text.",

  "ev.next.title": "What next",
  "ev.next.tailor": "Tailor your CV to this offer",
  "ev.next.match": "See the CV match",
  "ev.next.offer": "Open the offer",
  "ev.next.profile": "Complete your profile",
  "ev.next.cv": "My CVs",

  "ev.card.none": "Check whether it is worth applying before you tailor your CV.",
  "ev.card.open": "See the evaluation",
  "ev.card.when": "Evaluated {when}.",
  "ev.card.stale": "Your CV, your profile or the offer's text has changed since then.",
}
