import db from "../db"
import { monthlyBasePln } from "../src/server/jobs/offer-facts"
import { listOfferPage } from "../src/server/jobs/browse"

async function main() {
  const rows = await db.job.findMany({
    where: { status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] } },
    select: {
      id: true,
      title: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
      locationText: true,
      countryCode: true,
      workplaceType: true,
      lastSeenAt: true,
      company: { select: { name: true } },
    },
    orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
  })
  const withPay = rows.filter((r) => r.salaryMin != null || r.salaryMax != null)
  const currencies = new Map<string, number>()
  for (const r of withPay) {
    const key = r.salaryCurrency ?? "(null)"
    currencies.set(key, (currencies.get(key) ?? 0) + 1)
  }
  console.log("open", rows.length, "withPay", withPay.length)
  console.log(
    "currencies",
    [...currencies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
  )

  let converted = 0
  let hiddenListed = 0
  let ge30 = 0
  const samples: string[] = []
  const failSamples: string[] = []
  const near: string[] = []
  for (const r of withPay) {
    const pay = monthlyBasePln({
      salaryMin: r.salaryMin,
      salaryMax: r.salaryMax,
      salaryCurrency: r.salaryCurrency,
    })
    if (!pay.listed) continue
    if (!pay.converted) {
      hiddenListed++
      if (failSamples.length < 15) {
        failSamples.push(
          `${r.company.name} | ${r.title.slice(0, 60)} | ${r.salaryMin}-${r.salaryMax} [${r.salaryCurrency}]`
        )
      }
      continue
    }
    converted++
    if (pay.max >= 30000) {
      ge30++
      if (samples.length < 15) {
        samples.push(
          `${r.company.name} | ${r.title.slice(0, 50)} | raw ${r.salaryMin}-${r.salaryMax} ${r.salaryCurrency} => ${pay.min}-${pay.max} ${pay.period} ${pay.note}`
        )
      }
    } else if (pay.max >= 20000 && near.length < 8) {
      near.push(
        `${r.company.name} | raw ${r.salaryMin}-${r.salaryMax} ${r.salaryCurrency} => ${pay.min}-${pay.max} ${pay.period}`
      )
    }
  }
  console.log("converted", converted, "unconvertedListed", hiddenListed, "monthlyMax>=30000", ge30)
  console.log("--- matches ---")
  for (const s of samples) console.log(s)
  console.log("--- near 20k ---")
  for (const s of near) console.log(s)
  console.log("--- unconverted ---")
  for (const s of failSamples) console.log(s)

  const recent = rows.slice(0, 480)
  let recent30 = 0
  for (const r of recent) {
    const pay = monthlyBasePln({
      salaryMin: r.salaryMin,
      salaryMax: r.salaryMax,
      salaryCurrency: r.salaryCurrency,
    })
    if (pay.listed && pay.converted && pay.max >= 30000) recent30++
  }
  console.log("recent480 >=30k", recent30, "of", recent.length)

  const paidOrdered = withPay
  let paidRecent30 = 0
  let firstPaid30 = -1
  for (let i = 0; i < paidOrdered.length; i++) {
    const r = paidOrdered[i]
    const pay = monthlyBasePln({
      salaryMin: r.salaryMin,
      salaryMax: r.salaryMax,
      salaryCurrency: r.salaryCurrency,
    })
    if (pay.listed && pay.converted && pay.max >= 30000) {
      paidRecent30++
      if (firstPaid30 < 0) {
        firstPaid30 = i
        console.log(
          "first paid>=30k index",
          i,
          r.company.name,
          r.title.slice(0, 60),
          r.salaryMin,
          r.salaryMax,
          r.salaryCurrency,
          pay.min,
          pay.max,
          pay.period,
          pay.note,
          r.lastSeenAt.toISOString()
        )
      }
    }
  }
  console.log("paid ordered", paidOrdered.length, "of first 480 paid >=30k", (() => {
    let n = 0
    for (const r of paidOrdered.slice(0, 480)) {
      const pay = monthlyBasePln({
        salaryMin: r.salaryMin,
        salaryMax: r.salaryMax,
        salaryCurrency: r.salaryCurrency,
      })
      if (pay.listed && pay.converted && pay.max >= 30000) n++
    }
    return n
  })(), "total >=30k", paidRecent30)

  const explicitMonth = withPay.filter((r) => {
    const pay = monthlyBasePln({
      salaryMin: r.salaryMin,
      salaryMax: r.salaryMax,
      salaryCurrency: r.salaryCurrency,
    })
    return pay.listed && pay.converted && pay.period === "month" && pay.max >= 30000 && pay.note == null
  })
  console.log("explicit month >=30k", explicitMonth.length)
  for (const r of explicitMonth.slice(0, 8)) {
    const pay = monthlyBasePln({
      salaryMin: r.salaryMin,
      salaryMax: r.salaryMax,
      salaryCurrency: r.salaryCurrency,
    })
    if (!pay.listed || !pay.converted) continue
    console.log(
      "explicit",
      r.company.name,
      r.title.slice(0, 50),
      r.salaryMin,
      r.salaryMax,
      r.salaryCurrency,
      pay.min,
      pay.max
    )
  }

  const fits = await db.jobMatch.aggregate({
    _count: { _all: true },
    where: { fitSalaryMonthly: { not: null } },
  })
  const fits30 = await db.jobMatch.count({ where: { fitSalaryMonthly: { gte: 30000 } } })
  const fitsAny = await db.jobMatch.count()
  console.log("jobMatch", fitsAny, "with fitSalary", fits._count._all, "fit>=30000", fits30)

  const page = await listOfferPage({ pay: 30000 }, "pl")
  console.log("listOfferPage pay=30000 offers", page.offers.length, "next", page.nextCursor)
  if (page.offers[0]) {
    console.log(
      "first",
      page.offers[0].company,
      page.offers[0].title,
      page.offers[0].payLabel,
      page.offers[0].payMin,
      page.offers[0].payMax
    )
  }

  await db.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
