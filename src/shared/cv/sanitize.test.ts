import { describe, expect, it } from "vitest"
import {
  decodeEntities,
  inlineToText,
  isBlankInline,
  normalizeHref,
  safeHref,
  sanitizeInline,
  textToInline,
} from "./sanitize"

describe("sanitizeInline", () => {
  it("keeps the allowed subset and normalizes b/i", () => {
    expect(sanitizeInline("<b>AdVantage:</b> ad server <i>w 6 mies.</i>")).toBe(
      "<strong>AdVantage:</strong> ad server <em>w 6 mies.</em>"
    )
    expect(sanitizeInline('<a href="https://example.com/a?b=1&amp;c=2">link</a>')).toBe(
      '<a href="https://example.com/a?b=1&amp;c=2">link</a>'
    )
    expect(sanitizeInline("one<br/>two<BR>three")).toBe("one<br>two<br>three")
  })

  it("drops scripts and their content", () => {
    expect(sanitizeInline("a<script>alert(1)</script>b")).toBe("ab")
    expect(sanitizeInline("a<SCRIPT type=x>alert('<b>x</b>')</SCRIPT>b")).toBe("ab")
    expect(sanitizeInline("<style>body{}</style>ok")).toBe("ok")
    expect(sanitizeInline("<svg><script>alert(1)</script></svg>x")).toBe("x")
    expect(sanitizeInline("<iframe src=//evil></iframe>y")).toBe("y")
  })

  it("drops event handlers and other attributes", () => {
    expect(sanitizeInline('<img src=x onerror="alert(1)">hi')).toBe("hi")
    expect(sanitizeInline('<strong onclick="alert(1)" style="color:red">B</strong>')).toBe(
      "<strong>B</strong>"
    )
    expect(sanitizeInline('<a href="https://x.pl" onmouseover="alert(1)">x</a>')).toBe(
      '<a href="https://x.pl">x</a>'
    )
    expect(sanitizeInline("<img src=x onerror=alert(1)//>")).toBe("")
  })

  it("rejects javascript:, data: and obfuscated hrefs", () => {
    expect(sanitizeInline('<a href="javascript:alert(1)">x</a>')).toBe("x")
    expect(sanitizeInline('<a href="  JaVaScRiPt:alert(1)">x</a>')).toBe("x")
    expect(sanitizeInline('<a href="java\tscript:alert(1)">x</a>')).toBe("x")
    expect(sanitizeInline('<a href="&#106;avascript:alert(1)">x</a>')).toBe("x")
    expect(sanitizeInline('<a href="data:text/html,<script>alert(1)</script>">x</a>')).toBe("x")
    expect(sanitizeInline('<a href="/relative">x</a>')).toBe("x")
    expect(sanitizeInline('<a href="//evil.com">x</a>')).toBe("x")
    expect(sanitizeInline('<a href="mailto:a@b.pl">mail</a> <a href="tel:+48600">tel</a>')).toBe(
      '<a href="mailto:a@b.pl">mail</a> <a href="tel:+48600">tel</a>'
    )
  })

  it("escapes attribute breakouts in hrefs", () => {
    const html = sanitizeInline(`<a href='https://x.pl/"><script>alert(1)</script>'>x</a>`)
    expect(html).toBe(
      '<a href="https://x.pl/&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">x</a>'
    )
  })

  it("closes, repairs and drops nested or unbalanced tags", () => {
    expect(sanitizeInline("<strong>bold <em>both</strong> tail</em>")).toBe(
      "<strong>bold <em>both</em></strong> tail"
    )
    expect(sanitizeInline("<strong>open")).toBe("<strong>open</strong>")
    expect(sanitizeInline("close</strong>")).toBe("close")
    expect(sanitizeInline('<a href="https://a.pl">a <a href="https://b.pl">b</a></a>')).toBe(
      '<a href="https://a.pl">a b</a>'
    )
    expect(sanitizeInline("<strong></strong><em> </em>x")).toBe("<em> </em>x")
    expect(sanitizeInline("<span style='x'><font>t</font></span>")).toBe("t")
  })

  it("turns blocks from contentEditable into line breaks", () => {
    expect(sanitizeInline("<div>a</div><div><br></div><div>b</div>")).toBe("a<br><br>b")
    expect(sanitizeInline("<p>one</p><p>two</p>")).toBe("one<br>two")
    expect(sanitizeInline("text<br><br>")).toBe("text")
  })

  it("escapes text and stray angle brackets", () => {
    expect(sanitizeInline("a < b && c > d")).toBe("a &lt; b &amp;&amp; c &gt; d")
    expect(sanitizeInline("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    )
    expect(sanitizeInline("<!-- <script>x</script> -->ok")).toBe("ok")
    expect(sanitizeInline("unterminated <a href='x")).toBe("unterminated &lt;a href='x")
  })

  it("is idempotent", () => {
    const inputs = [
      '<b>x</b> & <a href="https://e.pl/?a=1&b=2">y</a><br>z&nbsp;&#8209;',
      "<div>a</div><div>b</div>",
      "a < b",
    ]
    for (const input of inputs) {
      const once = sanitizeInline(input)
      expect(sanitizeInline(once)).toBe(once)
    }
  })
})

describe("helpers", () => {
  it("decodes common entities", () => {
    expect(decodeEntities("AI&#8209;native &amp; R&amp;D &ndash; &nbsp;&unknown;")).toBe(
      "AI‑native & R&D –  &unknown;"
    )
  })

  it("converts between inline HTML and text", () => {
    expect(inlineToText("<strong>A:</strong> b<br>c &amp; d")).toBe("A: b\nc & d")
    expect(textToInline("a < b\nc")).toBe("a &lt; b<br>c")
    expect(isBlankInline("<strong> </strong><br>")).toBe(true)
    expect(isBlankInline("x")).toBe(false)
  })

  it("normalizes what people type into a link box", () => {
    expect(normalizeHref(" https://x.pl/a ")).toBe("https://x.pl/a")
    expect(normalizeHref("x.pl/a")).toBe("https://x.pl/a")
    expect(normalizeHref("a@b.pl")).toBe("mailto:a@b.pl")
    expect(normalizeHref("+48 600 000 000")).toBe("tel:+48600000000")
    expect(normalizeHref("javascript:alert(1)")).toBeNull()
    expect(normalizeHref("javascript:alert.call(1)")).toBeNull()
    expect(normalizeHref("data:text/html,x.y")).toBeNull()
    expect(normalizeHref("plain words")).toBeNull()
    expect(normalizeHref("")).toBeNull()
  })

  it("accepts only safe link schemes", () => {
    expect(safeHref("https://linkedin.com/in/x")).toBe("https://linkedin.com/in/x")
    expect(safeHref("javascript:alert(1)")).toBeNull()
    expect(safeHref("vbscript:x")).toBeNull()
    expect(safeHref("")).toBeNull()
  })
})
