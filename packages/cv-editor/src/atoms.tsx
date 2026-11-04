"use client"

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import {
  ArrowDown,
  ArrowUp,
  FoldVertical,
  ImagePlus,
  Link2,
  ListPlus,
  Plus,
  Rows3,
  Tag,
  Trash2,
} from "lucide-react"
import type { CvT } from "./copy"
import {
  newCard,
  newEducation,
  newJob,
  newSkill,
  techLine,
  type CvLocale,
} from "@newrole/cv-core/blank"
import {
  insertBullet,
  insertItem,
  insertParagraph,
  moveBullet,
  moveItem,
  moveParagraph,
  moveSection,
  removeBullet,
  removeItem,
  removeParagraph,
  updateBullet,
  updateHeader,
  updateItem,
  updateParagraph,
  updateSection,
} from "@newrole/cv-core/edit"
import { atomKey, type CvAtom } from "@newrole/cv-core/flow"
import {
  CV_SECTION_TYPES,
  type CvContent,
  type CvSection,
  type CvSectionType,
} from "@newrole/cv-core/schema"
import { Editable } from "./Editable"

/**
 * React views of the atoms in @newrole/cv-core/flow. The structure and classes mirror the print
 * markup in @newrole/cv-engine/render one to one, so both lay out the same with the shared CSS;
 * only the fields are editable and the controls (absolutely positioned) are added on top.
 */

export type EditorOps = {
  t: CvT
  locale: CvLocale
  content: CvContent
  edit: (update: (content: CvContent) => CvContent, group?: string) => void
  /** Focus a field once it has rendered */
  focusField: (field: string, where?: "start" | "end") => void
  /** Keep an empty optional field (summary, tech) on the page while it is in use */
  keepField: (key: string, on: boolean) => void
  addSection: (type: CvSectionType, afterId: string | null) => void
  removeSection: (section: CvSection) => void
  pickPhoto: () => void
  removePhoto: () => void
  openLinks: (anchor: HTMLElement) => void
}

type Control = {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
}

/** The hover strip on a block. Clicks keep the focus and selection where they are. */
export function Controls({ items, children }: { items: Control[]; children?: ReactNode }) {
  return (
    <span className="cve-ctl" onMouseDown={(event) => event.preventDefault()}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className="cve-ctl__btn"
          title={item.label}
          aria-label={item.label}
          aria-pressed={item.pressed}
          disabled={item.disabled}
          onClick={item.onClick}
        >
          {item.icon}
        </button>
      ))}
      {children}
    </span>
  )
}

/** "Add a section" with its type picker; used on the sheet and in the outline. */
export function SectionTypeMenu({
  ops,
  afterId,
  children,
}: {
  ops: EditorOps
  afterId: string | null
  children: (props: { open: boolean; toggle: () => void }) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    box.current?.querySelector<HTMLElement>(".menu__item")?.focus()
    function onDown(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  return (
    <span className="rel cve-typemenu" ref={box}>
      {children({ open, toggle: () => setOpen((value) => !value) })}
      {open ? (
        <span className="menu cve-typemenu__list" role="menu">
          {CV_SECTION_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="menu__item"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                ops.addSection(type, afterId)
              }}
            >
              {ops.t(`cv.type.${type}`)}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}

function itemControls(
  ops: EditorOps,
  section: CvSection,
  itemId: string,
  onAdd: () => void
): Control[] {
  const { t, edit } = ops
  const items =
    section.type === "text" || section.type === "letter" ? [] : (section.items as { id: string }[])
  const at = items.findIndex((item) => item.id === itemId)
  return [
    { icon: <Plus />, label: t("cv.ctl.add"), onClick: onAdd },
    {
      icon: <ArrowUp />,
      label: t("cv.ctl.up"),
      disabled: at <= 0,
      onClick: () => edit((content) => moveItem(content, section.id, itemId, -1)),
    },
    {
      icon: <ArrowDown />,
      label: t("cv.ctl.down"),
      disabled: at < 0 || at >= items.length - 1,
      onClick: () => edit((content) => moveItem(content, section.id, itemId, 1)),
    },
    {
      icon: <Trash2 />,
      label: t("cv.ctl.delete"),
      onClick: () => edit((content) => removeItem(content, section.id, itemId)),
    },
  ]
}

function HeaderAtom({ ops }: { ops: EditorOps }) {
  const { t, edit, content } = ops
  const header = content.header
  const set = (key: "name" | "headline" | "location" | "email" | "phone") => (value: string) =>
    edit((current) => updateHeader(current, { [key]: value }), `header:${key}`)
  const linksButton = useRef<HTMLButtonElement>(null)
  return (
    <div className={`cv-header${header.photo ? "" : " cv-header--nophoto"}`}>
      <div className="cv-header__main">
        <Editable
          as="h1"
          className="cv-name"
          field="header:name"
          value={header.name}
          label={t("cv.ph.name")}
          placeholder={t("cv.ph.name")}
          onChange={set("name")}
        />
        <Editable
          as="p"
          className="cv-headline"
          field="header:headline"
          value={header.headline}
          label={t("cv.ph.headline")}
          placeholder={t("cv.ph.headline")}
          onChange={set("headline")}
        />
        <div className="cv-contact">
          <span className="cv-contact__item">
            <Editable
              as="span"
              field="header:location"
              value={header.location}
              label={t("cv.ph.location")}
              placeholder={t("cv.ph.location")}
              onChange={set("location")}
            />
          </span>
          <span className="cv-sep">·</span>
          <span className="cv-contact__item">
            <a>
              <Editable
                as="span"
                field="header:email"
                value={header.email}
                label={t("cv.ph.email")}
                placeholder={t("cv.ph.email")}
                onChange={set("email")}
              />
            </a>
          </span>
          <span className="cv-sep">·</span>
          <span className="cv-contact__item">
            <a>
              <Editable
                as="span"
                field="header:phone"
                value={header.phone}
                label={t("cv.ph.phone")}
                placeholder={t("cv.ph.phone")}
                onChange={set("phone")}
              />
            </a>
          </span>
          {header.links.length ? <br /> : null}
          {header.links.map((link, index) => (
            <Fragment key={index}>
              {index ? <span className="cv-sep">·</span> : null}
              <span className="cv-contact__item">
                <a>
                  <Editable
                    as="span"
                    field={`header:link:${index}`}
                    value={link.label}
                    label={t("cv.ph.link")}
                    placeholder={t("cv.ph.link")}
                    onChange={(value) =>
                      edit(
                        (current) =>
                          updateHeader(current, {
                            links: current.header.links.map((entry, at) =>
                              at === index ? { ...entry, label: value } : entry
                            ),
                          }),
                        `header:link:${index}`
                      )
                    }
                  />
                </a>
              </span>
            </Fragment>
          ))}
        </div>
      </div>
      {header.photo ? <PhotoButton ops={ops} src={header.photo} /> : null}
      <Controls
        items={
          header.photo
            ? []
            : [{ icon: <ImagePlus />, label: t("cv.photo.add"), onClick: ops.pickPhoto }]
        }
      >
        <button
          ref={linksButton}
          type="button"
          className="cve-ctl__btn"
          title={t("cv.links.edit")}
          aria-label={t("cv.links.edit")}
          onClick={() => linksButton.current && ops.openLinks(linksButton.current)}
        >
          <Link2 />
        </button>
      </Controls>
    </div>
  )
}

/** The photo: click to change or remove it. */
function PhotoButton({ ops, src }: { ops: EditorOps; src: string }) {
  const { t } = ops
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  return (
    <span className="cve-photo" ref={box}>
      <button
        type="button"
        className="cve-photo__btn"
        aria-label={t("cv.photo.change")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URL inside the CV sheet */}
        <img className="cv-photo" src={src} alt={ops.content.header.name} />
      </button>
      {open ? (
        <span className="menu" role="menu">
          <button
            type="button"
            className="menu__item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              ops.pickPhoto()
            }}
          >
            {t("cv.photo.change")}
          </button>
          <button
            type="button"
            className="menu__item menu__item--danger"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              ops.removePhoto()
            }}
          >
            {t("cv.photo.remove")}
          </button>
        </span>
      ) : null}
    </span>
  )
}

function TitleAtom({ ops, section }: { ops: EditorOps; section: CvSection }) {
  const { t, edit, content } = ops
  const at = content.sections.findIndex((entry) => entry.id === section.id)
  const field = atomKey(section.id, "title")
  return (
    <>
      <Editable
        as="h2"
        className="cv-h2"
        field={field}
        value={section.title}
        label={t("cv.ph.title")}
        placeholder={t("cv.ph.title")}
        onChange={(value) =>
          edit((current) => updateSection(current, section.id, { title: value }), field)
        }
      />
      <Controls
        items={[
          {
            icon: <ArrowUp />,
            label: t("cv.ctl.up"),
            disabled: at <= 0,
            onClick: () => edit((current) => moveSection(current, section.id, -1)),
          },
          {
            icon: <ArrowDown />,
            label: t("cv.ctl.down"),
            disabled: at >= content.sections.length - 1,
            onClick: () => edit((current) => moveSection(current, section.id, 1)),
          },
          {
            icon: <Trash2 />,
            label: t("cv.ctl.delete"),
            onClick: () => ops.removeSection(section),
          },
        ]}
      >
        <SectionTypeMenu ops={ops} afterId={section.id}>
          {({ open, toggle }) => (
            <button
              type="button"
              className="cve-ctl__btn"
              title={t("cv.ctl.addSection")}
              aria-label={t("cv.ctl.addSection")}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={toggle}
            >
              <Plus />
            </button>
          )}
        </SectionTypeMenu>
      </Controls>
    </>
  )
}

function ExperienceAtom({
  ops,
  atom,
  section,
}: {
  ops: EditorOps
  atom: CvAtom
  section: Extract<CvSection, { type: "experience" }>
}) {
  const { t, edit, locale } = ops
  const item = section.items.find((entry) => entry.id === atom.itemId)
  if (!item) return null
  const sid = section.id
  const iid = item.id
  const set = (key: string) => (value: string) =>
    edit((current) => updateItem(current, sid, iid, { [key]: value }), atomKey(sid, iid, key))

  if (atom.kind === "job-head") {
    const summaryKey = atomKey(sid, iid, "summary")
    const techKey = atomKey(sid, iid, "tech")
    const hasSummary = Boolean(item.summary)
    const hasTech = Boolean(item.tech)
    return (
      <div className="cv-job-head">
        <h3 className="cv-company">
          <Editable
            as="span"
            field={atomKey(sid, iid, "company")}
            value={item.company}
            label={t("cv.ph.company")}
            placeholder={t("cv.ph.company")}
            onChange={set("company")}
          />{" "}
          <span className="cv-role">
            ·{" "}
            <Editable
              as="span"
              field={atomKey(sid, iid, "role")}
              value={item.role}
              label={t("cv.ph.role")}
              placeholder={t("cv.ph.role")}
              onChange={set("role")}
            />
          </span>
        </h3>
        <Editable
          as="div"
          className="cv-dates"
          field={atomKey(sid, iid, "dates")}
          value={item.dates}
          label={t("cv.ph.dates")}
          placeholder={t("cv.ph.dates")}
          onChange={set("dates")}
        />
        <Controls
          items={[
            ...(hasSummary
              ? []
              : [
                  {
                    icon: <Rows3 />,
                    label: t("cv.ctl.addSummary"),
                    onClick: () => {
                      ops.keepField(summaryKey, true)
                      ops.focusField(summaryKey)
                    },
                  },
                ]),
            {
              icon: <ListPlus />,
              label: t("cv.ctl.addBullet"),
              onClick: () => {
                edit((current) => insertBullet(current, sid, iid, item.bullets.length - 1))
                ops.focusField(atomKey(sid, iid, "bullet", item.bullets.length))
              },
            },
            ...(hasTech
              ? []
              : [
                  {
                    icon: <Tag />,
                    label: t("cv.ctl.addTech"),
                    onClick: () => {
                      edit((current) =>
                        updateItem(current, sid, iid, { tech: `${techLine(locale)} ` })
                      )
                      ops.focusField(techKey)
                    },
                  },
                ]),
            {
              icon: <FoldVertical />,
              label: t("cv.ctl.compact"),
              pressed: item.compact,
              onClick: () =>
                edit((current) => updateItem(current, sid, iid, { compact: !item.compact })),
            },
            ...itemControls(ops, section, iid, () => {
              const job = newJob(locale)
              edit((current) => insertItem(current, sid, job, iid))
              ops.focusField(atomKey(sid, job.id, "company"))
            }),
          ]}
        />
      </div>
    )
  }

  if (atom.kind === "job-summary") {
    const key = atomKey(sid, iid, "summary")
    return (
      <Editable
        as="div"
        rich
        multiline
        className="cv-summary"
        field={key}
        value={item.summary}
        label={t("cv.ph.summary")}
        placeholder={t("cv.ph.summary")}
        onChange={set("summary")}
        onFocus={() => ops.keepField(key, true)}
        onBlur={() => ops.keepField(key, false)}
      />
    )
  }

  if (atom.kind === "bullet") {
    const index = atom.index ?? 0
    const key = atomKey(sid, iid, "bullet", index)
    return (
      <>
        <Editable
          as="div"
          rich
          className="cv-bullet"
          field={key}
          value={item.bullets[index] ?? ""}
          label={t("cv.ph.bullet")}
          placeholder={t("cv.ph.bullet")}
          onChange={(value) =>
            edit((current) => updateBullet(current, sid, iid, index, value), key)
          }
          onSplit={(before, after) => {
            edit((current) =>
              insertBullet(updateBullet(current, sid, iid, index, before), sid, iid, index, after)
            )
            ops.focusField(atomKey(sid, iid, "bullet", index + 1), "start")
          }}
          onBackspaceEmpty={() => {
            edit((current) => removeBullet(current, sid, iid, index))
            if (index > 0) ops.focusField(atomKey(sid, iid, "bullet", index - 1))
            else ops.focusField(atomKey(sid, iid, "company"))
          }}
        />
        <Controls
          items={[
            {
              icon: <Plus />,
              label: t("cv.ctl.add"),
              onClick: () => {
                edit((current) => insertBullet(current, sid, iid, index))
                ops.focusField(atomKey(sid, iid, "bullet", index + 1))
              },
            },
            {
              icon: <ArrowUp />,
              label: t("cv.ctl.up"),
              disabled: index === 0,
              onClick: () => edit((current) => moveBullet(current, sid, iid, index, -1)),
            },
            {
              icon: <ArrowDown />,
              label: t("cv.ctl.down"),
              disabled: index >= item.bullets.length - 1,
              onClick: () => edit((current) => moveBullet(current, sid, iid, index, 1)),
            },
            {
              icon: <Trash2 />,
              label: t("cv.ctl.delete"),
              onClick: () => edit((current) => removeBullet(current, sid, iid, index)),
            },
          ]}
        />
      </>
    )
  }

  if (atom.kind === "tech") {
    const key = atomKey(sid, iid, "tech")
    return (
      <>
        <Editable
          as="div"
          rich
          className="cv-tech"
          field={key}
          value={item.tech}
          label={t("cv.ctl.techLabel")}
          placeholder={t("cv.ph.tech")}
          onChange={set("tech")}
          onFocus={() => ops.keepField(key, true)}
          onBlur={() => ops.keepField(key, false)}
        />
        <Controls
          items={[
            {
              icon: <Trash2 />,
              label: t("cv.ctl.delete"),
              onClick: () => {
                ops.keepField(key, false)
                edit((current) => updateItem(current, sid, iid, { tech: "" }))
              },
            },
          ]}
        />
      </>
    )
  }
  return null
}

function SkillsRow({
  ops,
  atom,
  section,
}: {
  ops: EditorOps
  atom: CvAtom
  section: Extract<CvSection, { type: "skills" }>
}) {
  const { t, edit, locale } = ops
  const sid = section.id
  const items = (atom.itemIds ?? [])
    .map((id) => section.items.find((item) => item.id === id))
    .filter(Boolean)
  return (
    <div className="cv-skills">
      {items.map((item) => {
        const iid = item!.id
        return (
          <div className="cv-skill cve-block" key={iid}>
            <strong>
              <Editable
                as="span"
                field={atomKey(sid, iid, "label")}
                value={item!.label}
                label={t("cv.ph.label")}
                placeholder={t("cv.ph.label")}
                onChange={(value) =>
                  edit(
                    (current) => updateItem(current, sid, iid, { label: value }),
                    atomKey(sid, iid, "label")
                  )
                }
              />
              :
            </strong>{" "}
            <Editable
              as="span"
              rich
              field={atomKey(sid, iid, "text")}
              value={item!.text}
              label={t("cv.ph.skill")}
              placeholder={t("cv.ph.skill")}
              onChange={(value) =>
                edit(
                  (current) => updateItem(current, sid, iid, { text: value }),
                  atomKey(sid, iid, "text")
                )
              }
            />
            <Controls
              items={itemControls(ops, section, iid, () => {
                const skill = newSkill(locale)
                edit((current) => insertItem(current, sid, skill, iid))
                ops.focusField(atomKey(sid, skill.id, "label"))
              })}
            />
          </div>
        )
      })}
    </div>
  )
}

function CardsRow({
  ops,
  atom,
  section,
}: {
  ops: EditorOps
  atom: CvAtom
  section: Extract<CvSection, { type: "cards" }>
}) {
  const { t, edit, locale } = ops
  const sid = section.id
  const items = (atom.itemIds ?? [])
    .map((id) => section.items.find((item) => item.id === id))
    .filter(Boolean)
  return (
    <div className="cv-cards">
      {items.map((item) => {
        const iid = item!.id
        return (
          <div className="cv-card cve-block" key={iid}>
            <Editable
              as="h3"
              className="cv-card__title"
              field={atomKey(sid, iid, "title")}
              value={item!.title}
              label={t("cv.ph.cardTitle")}
              placeholder={t("cv.ph.cardTitle")}
              onChange={(value) =>
                edit(
                  (current) => updateItem(current, sid, iid, { title: value }),
                  atomKey(sid, iid, "title")
                )
              }
            />
            <Editable
              as="div"
              rich
              multiline
              className="cv-card__body"
              field={atomKey(sid, iid, "body")}
              value={item!.body}
              label={t("cv.ph.cardBody")}
              placeholder={t("cv.ph.cardBody")}
              onChange={(value) =>
                edit(
                  (current) => updateItem(current, sid, iid, { body: value }),
                  atomKey(sid, iid, "body")
                )
              }
            />
            <Controls
              items={itemControls(ops, section, iid, () => {
                const card = newCard(locale)
                edit((current) => insertItem(current, sid, card, iid))
                ops.focusField(atomKey(sid, card.id, "title"))
              })}
            />
          </div>
        )
      })}
    </div>
  )
}

function EducationAtom({
  ops,
  atom,
  section,
}: {
  ops: EditorOps
  atom: CvAtom
  section: Extract<CvSection, { type: "education" }>
}) {
  const { t, edit, locale } = ops
  const item = section.items.find((entry) => entry.id === atom.itemId)
  if (!item) return null
  const sid = section.id
  const iid = item.id
  const set = (key: string) => (value: string) =>
    edit((current) => updateItem(current, sid, iid, { [key]: value }), atomKey(sid, iid, key))
  return (
    <div className="cv-edu">
      <div className="cv-edu__main">
        <strong className="cv-edu__school">
          <Editable
            as="span"
            field={atomKey(sid, iid, "school")}
            value={item.school}
            label={t("cv.ph.school")}
            placeholder={t("cv.ph.school")}
            onChange={set("school")}
          />
        </strong>
        <span className="cv-small">
          <Editable
            as="span"
            field={atomKey(sid, iid, "degree")}
            value={item.degree}
            label={t("cv.ph.degree")}
            placeholder={t("cv.ph.degree")}
            onChange={set("degree")}
          />
        </span>
      </div>
      <Editable
        as="div"
        className="cv-dates"
        field={atomKey(sid, iid, "dates")}
        value={item.dates}
        label={t("cv.ph.dates")}
        placeholder={t("cv.ph.dates")}
        onChange={set("dates")}
      />
      <Controls
        items={itemControls(ops, section, iid, () => {
          const school = newEducation(locale)
          edit((current) => insertItem(current, sid, school, iid))
          ops.focusField(atomKey(sid, school.id, "school"))
        })}
      />
    </div>
  )
}

/** A cover letter on the sheet: the same fields and page flow as the CV, in reading order. */
function LetterAtom({
  ops,
  atom,
  section,
}: {
  ops: EditorOps
  atom: CvAtom
  section: Extract<CvSection, { type: "letter" }>
}) {
  const { t, edit } = ops
  const sid = section.id
  const line = (
    key: "date" | "recipient" | "subject" | "greeting" | "closing" | "signature",
    className: string
  ) => (
    <Editable
      as="p"
      className={className}
      field={atomKey(sid, key)}
      value={section[key]}
      label={t(`tl.ph.${key}`)}
      placeholder={t(`tl.ph.${key}`)}
      onChange={(value) =>
        edit((current) => updateSection(current, sid, { [key]: value }), atomKey(sid, key))
      }
    />
  )
  if (atom.kind === "letter-head") {
    return (
      <>
        {line("date", "cv-letter-date")}
        {line("recipient", "cv-letter-to")}
      </>
    )
  }
  if (atom.kind === "letter-subject") return line("subject", "cv-letter-subject")
  if (atom.kind === "letter-greeting") return line("greeting", "cv-letter-text")
  if (atom.kind === "letter-closing") {
    return (
      <>
        {line("closing", "cv-letter-text")}
        {line("signature", "cv-letter-sign")}
      </>
    )
  }
  if (atom.kind !== "letter-para") return null
  const index = atom.index ?? 0
  const key = atomKey(sid, "para", index)
  return (
    <>
      <Editable
        as="div"
        rich
        className="cv-letter-text"
        field={key}
        value={section.paragraphs[index] ?? ""}
        label={t("tl.ph.paragraph")}
        placeholder={t("tl.ph.paragraph")}
        onChange={(value) => edit((current) => updateParagraph(current, sid, index, value), key)}
        onSplit={(before, after) => {
          edit((current) =>
            insertParagraph(updateParagraph(current, sid, index, before), sid, index, after)
          )
          ops.focusField(atomKey(sid, "para", index + 1), "start")
        }}
        onBackspaceEmpty={() => {
          edit((current) => removeParagraph(current, sid, index))
          ops.focusField(index > 0 ? atomKey(sid, "para", index - 1) : atomKey(sid, "greeting"))
        }}
      />
      <Controls
        items={[
          {
            icon: <Plus />,
            label: t("cv.ctl.add"),
            onClick: () => {
              edit((current) => insertParagraph(current, sid, index))
              ops.focusField(atomKey(sid, "para", index + 1))
            },
          },
          {
            icon: <ArrowUp />,
            label: t("cv.ctl.up"),
            disabled: index === 0,
            onClick: () => edit((current) => moveParagraph(current, sid, index, -1)),
          },
          {
            icon: <ArrowDown />,
            label: t("cv.ctl.down"),
            disabled: index >= section.paragraphs.length - 1,
            onClick: () => edit((current) => moveParagraph(current, sid, index, 1)),
          },
          {
            icon: <Trash2 />,
            label: t("cv.ctl.delete"),
            onClick: () => edit((current) => removeParagraph(current, sid, index)),
          },
        ]}
      />
    </>
  )
}

function EmptySection({ ops, section }: { ops: EditorOps; section: CvSection }) {
  const { t, edit, locale } = ops
  const add = () => {
    const sid = section.id
    if (section.type === "letter") {
      edit((current) => insertParagraph(current, sid, -1))
      ops.focusField(atomKey(sid, "para", 0))
    } else if (section.type === "skills") {
      const skill = newSkill(locale)
      edit((current) => insertItem(current, sid, skill))
      ops.focusField(atomKey(sid, skill.id, "label"))
    } else if (section.type === "experience") {
      const job = newJob(locale)
      edit((current) => insertItem(current, sid, job))
      ops.focusField(atomKey(sid, job.id, "company"))
    } else if (section.type === "cards") {
      const card = newCard(locale)
      edit((current) => insertItem(current, sid, card))
      ops.focusField(atomKey(sid, card.id, "title"))
    } else if (section.type === "education") {
      const school = newEducation(locale)
      edit((current) => insertItem(current, sid, school))
      ops.focusField(atomKey(sid, school.id, "school"))
    }
  }
  return (
    <button type="button" className="cve-empty" onClick={add}>
      <Plus aria-hidden /> {t("cv.ctl.addItem")}
    </button>
  )
}

/** One atom's contents. */
export function AtomContent({ ops, atom }: { ops: EditorOps; atom: CvAtom }) {
  const { t, edit, content } = ops
  if (atom.kind === "header") return <HeaderAtom ops={ops} />
  if (atom.kind === "consent") {
    return (
      <>
        <Editable
          as="p"
          className="cv-consent"
          field="consent"
          value={content.consent ?? ""}
          label={t("cv.ph.consent")}
          placeholder={t("cv.ph.consent")}
          onChange={(value) => edit((current) => ({ ...current, consent: value }), "consent")}
        />
        <Controls
          items={[
            {
              icon: <Trash2 />,
              label: t("cv.ctl.delete"),
              onClick: () => edit((current) => ({ ...current, consent: null })),
            },
          ]}
        />
      </>
    )
  }
  const section = content.sections.find((entry) => entry.id === atom.sectionId)
  if (!section) return null
  if (atom.kind === "title") return <TitleAtom ops={ops} section={section} />
  if (atom.kind === "empty") return <EmptySection ops={ops} section={section} />
  if (section.type === "letter") return <LetterAtom ops={ops} atom={atom} section={section} />
  if (atom.kind === "text" && section.type === "text") {
    const key = atomKey(section.id, "text")
    return (
      <Editable
        as="div"
        rich
        multiline
        className="cv-text"
        field={key}
        value={section.body}
        label={t("cv.ph.text")}
        placeholder={t("cv.ph.text")}
        onChange={(value) =>
          edit((current) => updateSection(current, section.id, { body: value }), key)
        }
      />
    )
  }
  if (atom.kind === "skills" && section.type === "skills")
    return <SkillsRow ops={ops} atom={atom} section={section} />
  if (atom.kind === "cards" && section.type === "cards")
    return <CardsRow ops={ops} atom={atom} section={section} />
  if (atom.kind === "edu" && section.type === "education")
    return <EducationAtom ops={ops} atom={atom} section={section} />
  if (section.type === "experience")
    return <ExperienceAtom ops={ops} atom={atom} section={section} />
  return null
}
