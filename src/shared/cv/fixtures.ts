import { CV_ACCENT, CV_VERSION, type CvContent } from "./schema"

/**
 * Synthetic CV for tests and render checks: a person who does not exist, in the reference
 * layout. Never put real personal data here. `jobs` makes it longer to force page breaks.
 */
export function syntheticCv(jobs = 8): CvContent {
  const job = (n: number) => ({
    id: `job${n}`,
    company: `Przykładowa Firma ${n}`,
    role: n === 1 ? "Head of Engineering" : "Senior Developer",
    dates: `0${(n % 9) + 1}.20${10 + n} – 0${(n % 9) + 1}.20${11 + n}`,
    summary:
      "Prowadziłem zespół programistów, wspierałem inżynierów w codziennej pracy i pomagałem dostarczać funkcje produktu razem z działem produktu i innymi zespołami.",
    bullets:
      n <= 4
        ? [
            "<strong>Platforma:</strong> współtworzyłem system, który powstał w sześć miesięcy i obsługuje duży ruch produkcyjny bez przestojów.",
            "Odpowiadałem za architekturę, przekładałem potrzeby produktowe i biznesowe na plany techniczne oraz standardy pracy.",
            "Ustalałem standardy kodu, testów oraz dokumentacji technicznej i pomagałem zespołom dostarczać oprogramowanie w stałym tempie.",
          ]
        : [],
    tech: n <= 4 ? "<strong>Technologie:</strong> Node.js, PostgreSQL, Kubernetes, API" : "",
    compact: n > 4,
  })
  return {
    version: CV_VERSION,
    header: {
      name: "Anna Przykładowa",
      headline: "Engineering Leader · Head of Engineering",
      location: "Łódź",
      email: "anna@example.com",
      phone: "+48 600 000 000",
      links: [
        {
          label: "linkedin.com/in/anna-przykladowa",
          url: "https://www.linkedin.com/in/anna-przykladowa/",
        },
      ],
      photo: null,
    },
    sections: [
      {
        id: "profile",
        type: "text",
        title: "Profil",
        body: "Kieruję zespołami inżynierskimi i projektuję platformy od pierwszego planu technicznego aż po wdrożenie produkcyjne. Łączę praktyczne programowanie z architekturą systemów, budowaniem zespołów i dostarczaniem produktu.",
      },
      {
        id: "skills",
        type: "skills",
        title: "Kluczowe kompetencje",
        items: [
          {
            id: "sk1",
            label: "Przywództwo inżynierskie",
            text: "budowanie zespołów, rekrutacja, coaching",
          },
          { id: "sk2", label: "Architektura", text: "projektowanie systemów, API, ADR" },
          { id: "sk3", label: "Backend i dane", text: "Node.js, PostgreSQL, MongoDB" },
        ],
      },
      {
        id: "experience",
        type: "experience",
        title: "Doświadczenie zawodowe",
        items: Array.from({ length: jobs }, (_, index) => job(index + 1)),
      },
      {
        id: "projects",
        type: "cards",
        title: "Projekty własne",
        items: [
          {
            id: "c1",
            title: "Projekt A · Co-Founder",
            body: "Platforma, która pomaga użytkownikom w codziennej pracy. Zajmuję się rozwojem produktu.",
          },
          {
            id: "c2",
            title: "Projekt B · Co-Founder",
            body: "Produkt oparty na danych, nastawiony na wartość dla klienta oraz rentowność.",
          },
        ],
      },
      {
        id: "education",
        type: "education",
        title: "Wykształcenie",
        items: [
          {
            id: "e1",
            school: "Politechnika Przykładowa",
            degree: "Magister inżynier, Informatyka",
            dates: "2013 – 2016",
          },
        ],
      },
      {
        id: "languages",
        type: "text",
        title: "Języki",
        body: "polski (ojczysty) · angielski (swobodnie)",
      },
    ],
    consent:
      "Wyrażam zgodę na przetwarzanie moich danych osobowych zawartych w tym dokumencie w celu realizacji procesu rekrutacji.",
    theme: { accent: CV_ACCENT },
  }
}

/** A synthetic document with the classes and structure of the reference HTML. */
export const SYNTHETIC_CV_HTML = `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="utf-8"><title>Anna Przykładowa — CV</title>
<style>:root { --ink:#172333; --muted:#536273; --accent:#175c72; --line:#d8e0e7; }</style></head>
<body>
<main class="document"><article class="page">
<header><div>
  <h1>Anna Przykładowa</h1>
  <p class="headline">Engineering Leader · Head of Engineering</p>
  <div class="contact">
    <span>Łódź</span><span class="sep">·</span><span><a href="mailto:anna@example.com">anna@example.com</a></span><span class="sep">·</span><span><a href="tel:+48600000000">+48 600 000 000</a></span><br>
    <span><a href="https://www.linkedin.com/in/anna-przykladowa/">linkedin.com/in/anna-przykladowa</a></span>
  </div>
</div>
<img class="photo" src="data:image/jpeg;base64,/9j/4AAQSkZJRg==" alt="Anna Przykładowa"></header>
<section><h2>Profil</h2><p>Kieruję zespołami&#8209;inżynierskimi i projektuję platformy.</p></section>
<section><h2>Kluczowe kompetencje</h2><div class="skills"><p class="skill"><strong>Przywództwo inżynierskie:</strong> budowanie zespołów, rekrutacja</p><p class="skill"><strong>Architektura:</strong> projektowanie systemów, API</p></div></section>
<section><h2>Doświadczenie zawodowe</h2>
<article class="job"><div class="job-head"><h3>Firma Główna <span class="role">· Architect &amp; Head of Engineering</span></h3><div class="dates">06.2025 – obecnie</div></div><p>Kieruję inżynierią i architekturą platformy.</p><ul><li><strong>AdVantage:</strong> współtworzyłem ad server.</li><li>Dla porównania: podobny system powstawał 18 miesięcy.</li></ul><p class="tech"><strong>Technologie:</strong> Node.js, PostgreSQL</p></article>
<article class="job compact-job"><div class="job-head"><h3>Starsza Firma <span class="role">· Developer</span></h3><div class="dates">2016 – 02.2018</div></div><p>Tworzyłem aplikacje webowe.</p></article>
</section>
<section><h2>Projekty własne</h2><div class="ventures"><div class="venture"><h3>Projekt A · Co-Founder</h3><p>Platforma AI.</p></div><div class="venture"><h3>Projekt B · Co-Founder</h3><p>Produkt oparty na danych.</p></div></div></section>
<section><h2>Wykształcenie</h2><div class="education-item"><div><strong>Politechnika Przykładowa</strong><span class="small">Magister inżynier, Informatyka</span></div><div class="dates">2013 – 2016</div></div></section>
<section><h2>Języki</h2><p>polski (ojczysty) <span class="sep">·</span> angielski (swobodnie)</p></section>
<p class="consent">Wyrażam zgodę na przetwarzanie moich danych osobowych.</p>
</article></main>
</body></html>`
