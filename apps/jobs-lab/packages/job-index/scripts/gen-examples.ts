/**
 * Generates query-expansion.examples.json: hand-written reference LLM outputs (what a good model should return),
 * validated with ExpansionLLMOutputSchema, then finalized with code-built search queries.
 * Run: npm run gen:examples -w @newrole/job-index
 */
import { writeFileSync } from "node:fs"
import {
  buildQueryExpansionMessages,
  ExpansionLLMOutputSchema,
  finalizeExpansion,
  type ExpansionLLMOutput,
  type QueryExpansionInput,
} from "../src/matching/query-expansion.schema"

const COMMON_TECH_EXCLUSIONS = [
  "Sales Engineer",
  "Solutions Engineer",
  "Pre-sales",
  "Recruiter",
  "Talent Acquisition",
  "Intern",
  "Staż",
  "Praktyki",
]

const examples: Array<{ input: QueryExpansionInput; output: ExpansionLLMOutput; note: string }> = [
  {
    note: "EN management role; exclusions cover non-software 'engineering' and sales/recruiting look-alikes.",
    input: { phrase: "Head of Engineering" },
    output: {
      inputPhrase: "Head of Engineering",
      detectedLanguage: "en",
      canonicalRole: {
        titleEn: "Head of Engineering",
        titlePl: "Dyrektor ds. Inżynierii Oprogramowania",
        function: "engineering",
        seniority: "head",
        track: "management",
      },
      relatedTitles: [
        { title: "Head of Software Engineering", lang: "en", relation: "equivalent", weight: 0.95 },
        { title: "Head of Software Development", lang: "en", relation: "equivalent", weight: 0.9 },
        { title: "Director of Engineering", lang: "en", relation: "equivalent", weight: 0.9 },
        { title: "Engineering Director", lang: "en", relation: "equivalent", weight: 0.9 },
        { title: "Head of Technology", lang: "en", relation: "adjacent", weight: 0.75 },
        { title: "Head of Platform Engineering", lang: "en", relation: "adjacent", weight: 0.7 },
        { title: "Head of Product Engineering", lang: "en", relation: "adjacent", weight: 0.75 },
        { title: "VP of Engineering", lang: "en", relation: "step_up", weight: 0.7 },
        { title: "CTO", lang: "en", relation: "step_up", weight: 0.6 },
        { title: "Senior Engineering Manager", lang: "en", relation: "step_down", weight: 0.6 },
        {
          title: "Kierownik Działu Rozwoju Oprogramowania",
          lang: "pl",
          relation: "equivalent",
          weight: 0.85,
        },
        {
          title: "Dyrektor ds. Rozwoju Oprogramowania",
          lang: "pl",
          relation: "equivalent",
          weight: 0.85,
        },
        { title: "Szef Działu Inżynierii", lang: "pl", relation: "equivalent", weight: 0.8 },
        { title: "Dyrektor IT", lang: "pl", relation: "adjacent", weight: 0.55 },
      ],
      seniorityVariants: [
        { title: "Group Head of Engineering", lang: "en", seniority: "head" },
        { title: "Senior Director of Engineering", lang: "en", seniority: "director" },
        { title: "Engineering Manager", lang: "en", seniority: "manager" },
        { title: "VP Engineering", lang: "en", seniority: "vp" },
      ],
      synonyms: {
        en: ["Head of Eng", "Head of R&D"],
        pl: [
          "Head of Engineering",
          "Kierownik Działu Rozwoju Oprogramowania",
          "Dyrektor ds. Inżynierii",
        ],
      },
      signalKeywords: [
        "engineering managers",
        "org design",
        "hiring plan",
        "delivery",
        "engineering strategy",
        "budget",
        "zarządzanie zespołami",
        "rekrutacja inżynierów",
      ],
      exclusions: {
        titleKeywords: [
          ...COMMON_TECH_EXCLUSIONS,
          "Mechanical",
          "Civil",
          "Electrical",
          "Process Engineering",
          "Manufacturing",
          "Kierownik budowy",
          "Head of Sales",
        ],
        descriptionKeywords: ["CAD", "AutoCAD", "SolidWorks", "plac budowy"],
        rationale:
          "'Engineering' is ambiguous: exclude physical-engineering disciplines and sales/recruiting roles that borrow the word.",
      },
      webQueries: [
        '"Head of Engineering" job remote Poland',
        '"Head of Engineering" praca Warszawa',
        '"Director of Engineering" remote Europe job',
        '"Head of Software Development" oferta pracy',
      ],
    },
  },
  {
    note: "Abbreviation input; executive track. Adjacent titles cover 'technical co-founder' and 'VP Engineering' at small companies.",
    input: { phrase: "CTO" },
    output: {
      inputPhrase: "CTO",
      detectedLanguage: "en",
      canonicalRole: {
        titleEn: "Chief Technology Officer",
        titlePl: "Dyrektor ds. Technologii",
        function: "engineering",
        seniority: "c_level",
        track: "executive",
      },
      relatedTitles: [
        { title: "CTO", lang: "en", relation: "equivalent", weight: 1 },
        { title: "Chief Technical Officer", lang: "en", relation: "equivalent", weight: 0.95 },
        { title: "Technical Co-founder", lang: "en", relation: "adjacent", weight: 0.6 },
        { title: "VP of Engineering", lang: "en", relation: "step_down", weight: 0.7 },
        { title: "VP Technology", lang: "en", relation: "equivalent", weight: 0.8 },
        { title: "Head of Technology", lang: "en", relation: "step_down", weight: 0.7 },
        { title: "Head of Engineering", lang: "en", relation: "step_down", weight: 0.65 },
        { title: "Chief Information Officer", lang: "en", relation: "adjacent", weight: 0.5 },
        { title: "Dyrektor Techniczny", lang: "pl", relation: "equivalent", weight: 0.85 },
        { title: "Dyrektor ds. Technologii", lang: "pl", relation: "equivalent", weight: 0.95 },
        {
          title: "Członek Zarządu ds. Technologii",
          lang: "pl",
          relation: "equivalent",
          weight: 0.85,
        },
        { title: "Dyrektor IT", lang: "pl", relation: "adjacent", weight: 0.55 },
      ],
      seniorityVariants: [
        { title: "Group CTO", lang: "en", seniority: "c_level" },
        { title: "Fractional CTO", lang: "en", seniority: "c_level" },
        { title: "Deputy CTO", lang: "en", seniority: "vp" },
      ],
      synonyms: {
        en: ["CTO", "Chief Technology Officer"],
        pl: ["CTO", "Dyrektor Technologiczny", "Wiceprezes ds. Technologii"],
      },
      signalKeywords: [
        "technology strategy",
        "board",
        "architecture",
        "engineering organisation",
        "build vs buy",
        "strategia technologiczna",
        "zarząd",
      ],
      exclusions: {
        titleKeywords: [
          "CTO Office Assistant",
          "Office of the CTO Intern",
          "Field CTO",
          "Sales",
          "Recruiter",
          "Intern",
        ],
        descriptionKeywords: ["assistant to the CTO", "asystent zarządu"],
        rationale:
          "Exclude support roles in a CTO office and 'Field CTO' (pre-sales evangelist) roles.",
      },
      webQueries: [
        "CTO job Poland remote",
        '"Chief Technology Officer" Warszawa praca',
        '"Dyrektor ds. Technologii" oferta pracy',
        "startup CTO hiring Europe remote",
      ],
    },
  },
  {
    note: "Mid-management; step_down to Team Lead included with low weight; PL synonyms map to 'Kierownik Zespołu …'.",
    input: { phrase: "Engineering Manager" },
    output: {
      inputPhrase: "Engineering Manager",
      detectedLanguage: "en",
      canonicalRole: {
        titleEn: "Engineering Manager",
        titlePl: "Kierownik Zespołu Programistów",
        function: "engineering",
        seniority: "manager",
        track: "management",
      },
      relatedTitles: [
        { title: "Software Engineering Manager", lang: "en", relation: "equivalent", weight: 1 },
        { title: "Software Development Manager", lang: "en", relation: "equivalent", weight: 0.95 },
        { title: "Development Manager", lang: "en", relation: "equivalent", weight: 0.85 },
        { title: "Senior Engineering Manager", lang: "en", relation: "step_up", weight: 0.8 },
        { title: "Group Engineering Manager", lang: "en", relation: "step_up", weight: 0.75 },
        { title: "Head of Engineering", lang: "en", relation: "step_up", weight: 0.6 },
        { title: "Engineering Team Lead", lang: "en", relation: "step_down", weight: 0.55 },
        { title: "Tech Lead Manager", lang: "en", relation: "adjacent", weight: 0.6 },
        {
          title: "Kierownik Zespołu Programistów",
          lang: "pl",
          relation: "equivalent",
          weight: 0.9,
        },
        {
          title: "Kierowniczka Zespołu Programistów",
          lang: "pl",
          relation: "equivalent",
          weight: 0.9,
        },
        {
          title: "Kierownik Zespołu Developerskiego",
          lang: "pl",
          relation: "equivalent",
          weight: 0.85,
        },
        { title: "Menedżer Zespołu IT", lang: "pl", relation: "equivalent", weight: 0.8 },
        { title: "Lider Zespołu Programistów", lang: "pl", relation: "step_down", weight: 0.5 },
      ],
      seniorityVariants: [
        { title: "Senior Engineering Manager", lang: "en", seniority: "senior_manager" },
        { title: "Engineering Manager II", lang: "en", seniority: "manager" },
        { title: "Principal Engineering Manager", lang: "en", seniority: "senior_manager" },
        { title: "Director of Engineering", lang: "en", seniority: "director" },
      ],
      synonyms: {
        en: ["EM", "Eng Manager", "Software Engineering Manager"],
        pl: ["Engineering Manager", "Kierownik Zespołu Programistów", "Team Manager IT"],
      },
      signalKeywords: [
        "1:1s",
        "people management",
        "direct reports",
        "performance reviews",
        "hiring",
        "delivery",
        "zarządzanie zespołem",
        "rozwój ludzi",
      ],
      exclusions: {
        titleKeywords: [
          ...COMMON_TECH_EXCLUSIONS,
          "Mechanical",
          "Manufacturing",
          "Process Engineering",
          "Field Service",
          "Kierownik budowy",
          "Kierownik produkcji",
        ],
        descriptionKeywords: ["CAD", "linia produkcyjna", "plac budowy"],
        rationale: "Exclude physical/plant engineering managers and sales/recruiting roles.",
      },
      webQueries: [
        '"Engineering Manager" job remote Poland',
        '"Engineering Manager" praca Kraków OR Warszawa',
        '"Software Engineering Manager" remote Europe',
        '"Kierownik Zespołu Programistów" oferta pracy',
      ],
    },
  },
  {
    note: "Polish input; 'IT' department head is broader than software engineering (infra/helpdesk/ERP). Exclusions cover other 'kierownik działu' roles.",
    input: { phrase: "Kierownik działu IT", locationHint: "Warszawa" },
    output: {
      inputPhrase: "Kierownik działu IT",
      detectedLanguage: "pl",
      canonicalRole: {
        titleEn: "Head of IT",
        titlePl: "Kierownik Działu IT",
        function: "it",
        seniority: "head",
        track: "management",
      },
      relatedTitles: [
        { title: "Kierownik Działu IT", lang: "pl", relation: "equivalent", weight: 1 },
        { title: "Kierowniczka Działu IT", lang: "pl", relation: "equivalent", weight: 1 },
        { title: "Kierownik Działu Informatyki", lang: "pl", relation: "equivalent", weight: 0.95 },
        { title: "Szef Działu IT", lang: "pl", relation: "equivalent", weight: 0.9 },
        { title: "Kierownik IT", lang: "pl", relation: "equivalent", weight: 0.85 },
        { title: "Dyrektor IT", lang: "pl", relation: "step_up", weight: 0.75 },
        { title: "Dyrektor Departamentu IT", lang: "pl", relation: "step_up", weight: 0.7 },
        { title: "Head of IT", lang: "en", relation: "equivalent", weight: 1 },
        { title: "IT Manager", lang: "en", relation: "equivalent", weight: 0.85 },
        { title: "IT Director", lang: "en", relation: "step_up", weight: 0.75 },
        { title: "Head of IT Operations", lang: "en", relation: "adjacent", weight: 0.65 },
        { title: "Head of Engineering", lang: "en", relation: "adjacent", weight: 0.5 },
        { title: "Kierownik Zespołu IT", lang: "pl", relation: "step_down", weight: 0.55 },
      ],
      seniorityVariants: [
        { title: "Zastępca Kierownika Działu IT", lang: "pl", seniority: "manager" },
        { title: "Dyrektor IT", lang: "pl", seniority: "director" },
        { title: "CIO", lang: "en", seniority: "c_level" },
      ],
      synonyms: {
        en: ["Head of IT", "IT Manager", "IT Department Manager"],
        pl: ["Kierownik Działu IT", "Kierownik Działu Informatyki", "Szef IT", "Menedżer IT"],
      },
      signalKeywords: [
        "infrastruktura IT",
        "budżet IT",
        "dostawcy",
        "ERP",
        "bezpieczeństwo IT",
        "zarządzanie zespołem",
        "helpdesk team",
        "IT governance",
      ],
      exclusions: {
        titleKeywords: [
          "Kierownik budowy",
          "Kierownik sklepu",
          "Kierownik produkcji",
          "Kierownik działu sprzedaży",
          "Kierownik działu HR",
          "Helpdesk",
          "Specjalista",
          "Stażysta",
          "Praktykant",
        ],
        descriptionKeywords: ["plac budowy", "obsługa kasy"],
        rationale:
          "Other department heads (sales, HR, construction, retail) share 'Kierownik działu'; helpdesk/specialist roles are too junior.",
      },
      webQueries: [
        '"Kierownik Działu IT" praca Warszawa',
        '"Kierownik IT" oferta pracy Warszawa',
        '"Head of IT" Warszawa job',
        '"Dyrektor IT" praca',
      ],
    },
  },
  {
    note: "Fifth example: 'VP Engineering' — exec/management boundary; synonyms include 'VPE' and 'VP of Engineering'.",
    input: { phrase: "VP Engineering" },
    output: {
      inputPhrase: "VP Engineering",
      detectedLanguage: "en",
      canonicalRole: {
        titleEn: "VP of Engineering",
        titlePl: "Wiceprezes ds. Inżynierii",
        function: "engineering",
        seniority: "vp",
        track: "executive",
      },
      relatedTitles: [
        { title: "VP Engineering", lang: "en", relation: "equivalent", weight: 1 },
        { title: "Vice President of Engineering", lang: "en", relation: "equivalent", weight: 1 },
        { title: "SVP Engineering", lang: "en", relation: "step_up", weight: 0.7 },
        { title: "CTO", lang: "en", relation: "step_up", weight: 0.65 },
        { title: "Head of Engineering", lang: "en", relation: "step_down", weight: 0.75 },
        { title: "Senior Director of Engineering", lang: "en", relation: "step_down", weight: 0.7 },
        { title: "VP of Software Development", lang: "en", relation: "equivalent", weight: 0.9 },
        { title: "VP Technology", lang: "en", relation: "adjacent", weight: 0.7 },
        { title: "Dyrektor ds. Inżynierii", lang: "pl", relation: "equivalent", weight: 0.8 },
        {
          title: "Dyrektor Działu Rozwoju Oprogramowania",
          lang: "pl",
          relation: "equivalent",
          weight: 0.8,
        },
      ],
      seniorityVariants: [
        { title: "SVP Engineering", lang: "en", seniority: "vp" },
        { title: "Director of Engineering", lang: "en", seniority: "director" },
      ],
      synonyms: {
        en: ["VPE", "VP of Eng", "VP Software Engineering"],
        pl: ["VP of Engineering", "Dyrektor ds. Inżynierii Oprogramowania"],
      },
      signalKeywords: [
        "engineering organisation",
        "directors",
        "managers of managers",
        "org of 50+",
        "technical roadmap",
        "budget ownership",
      ],
      exclusions: {
        titleKeywords: [
          ...COMMON_TECH_EXCLUSIONS,
          "VP Sales",
          "VP Sales Engineering",
          "Mechanical",
          "Manufacturing",
        ],
        descriptionKeywords: ["quota", "CAD"],
        rationale: "Exclude sales-engineering VPs and physical-engineering VP roles.",
      },
      webQueries: [
        '"VP of Engineering" remote Europe job',
        '"VP Engineering" Poland',
        '"Vice President of Engineering" remote EMEA',
      ],
    },
  },
]

const out = examples.map(({ input, output, note }) => {
  ExpansionLLMOutputSchema.parse(output)
  const finalized = finalizeExpansion(JSON.stringify(output), input)
  const messages = buildQueryExpansionMessages(input)
  return { note, input, userMessage: messages[1]!.content, modelOutput: output, finalized }
})
writeFileSync(
  new URL("../src/matching/query-expansion.examples.json", import.meta.url),
  JSON.stringify(out, null, 2) + "\n"
)
console.log(`wrote ${out.length} examples`)
