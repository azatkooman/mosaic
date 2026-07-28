# Mosaic Quick Start for Event Organizers

This guide takes you from signing in to taking your first registration. It is
written for the person running the event — no technical knowledge required.

If you just want the short version, read **[The ten-minute
version](#the-ten-minute-version)** and skip the rest until you need it.

**Contents**

1. [Before you start](#1-before-you-start)
2. [The ten-minute version](#the-ten-minute-version)
3. [Sign in and open the console](#2-sign-in-and-open-the-console)
4. [Create your event](#3-create-your-event)
5. [Fill in the settings](#4-fill-in-the-settings)
6. [Set up participant types](#5-set-up-participant-types)
7. [Build the registration form](#6-build-the-registration-form)
8. [Design the public event page](#7-design-the-public-event-page)
9. [Publish](#8-publish)
10. [Manage registrations](#9-manage-registrations)
11. [Export your data](#10-export-your-data)
12. [Add your team](#11-add-your-team)
13. [Troubleshooting](#12-troubleshooting)
14. [What Mosaic does not do](#13-what-mosaic-does-not-do)

---

## 1. Before you start

You need:

- **A Mosaic account.** Sign in once at the site's login page. Anyone signed in
  can create an event — you do not need to be granted a special role first.
- **Your event basics**: name, start and end date, timezone.
- **Optional but useful**: a cover image (JPG, PNG, WebP or AVIF, under 5 MB),
  your contact details, and a list of the questions you want to ask registrants.

Two words you will see throughout:

| Term | What it means |
| --- | --- |
| **Participant type** | A category of attendee — Student, Staff, Child, Volunteer. Each type can have its own capacity and its own set of questions. |
| **Form** | The set of questions someone fills in to register. Forms are versioned: the live form never changes until you press **Publish form**. |

---

## The ten-minute version

```
1.  Console → New event → name, dates, timezone → Create event
2.  Settings  → check the URL slug, registration window, capacity, visibility
3.  Settings  → Participant types → add the types you need, set capacities
4.  Forms     → Edit form → add your questions → Publish form   ← required
5.  Event Page→ add the event name, description, location, cover image
6.  Settings  → Publish
7.  Copy the public link from the Event Page tab and share it
```

Step 4 is the one people miss. **Mosaic will not let you publish the event
until you have opened a form and pressed Publish form at least once.**

---

## 2. Sign in and open the console

Sign in, then click **Events Hub** in the site header. You land on the console
at `/console`.

The console lists every event you have access to, with columns for **Event
Name**, **Starts**, **Participants** (confirmed + waitlisted), and a status
badge. Click an event's name to open it.

Inside an event you get six tabs:

| Tab | What it is for |
| --- | --- |
| **Overview** | Registration counts and capacity bars. Read-only. |
| **Event Page** | The public-facing page: name, description, cover image, all the marketing content, colours and fonts. |
| **Settings** | The mechanics: URL, dates, registration window, capacity, languages, contacts, participant types. |
| **Forms** | Your registration questions. |
| **Participants** | Everyone who has registered. Filtering, status changes, export. |
| **Team** | Who else can access this event, and at what level. |

---

## 3. Create your event

Click **New event**. The dialog asks for four things:

| Field | Required | Notes |
| --- | --- | --- |
| **Event Name** | Yes | You can change it later, and add other languages, on the Event Page tab. |
| **Starts** | Yes | Defaults to 30 days from today. |
| **Ends** | Yes | Must be after the start. Defaults to start + 2 days. |
| **Timezone** | Yes | Defaults to your computer's timezone. **Every date you enter afterwards is interpreted in this timezone**, so get it right now. |

Click **Create event**. Mosaic drops you on the **Settings** tab of a new
**Draft** event, and quietly sets up three things for you:

- a web address (slug) generated from the name, e.g. `summer-camp-m3x9ab`
- one participant type called **Participant**
- a starter form called **Default form** with a Name and an Email question

> **A note on languages.** The event name is stored in **English** at creation,
> regardless of which language you are using the console in. If your event runs
> in another language, go to the Event Page tab afterwards and fill in the name
> for that language.

---

## 4. Fill in the settings

The Settings tab has four cards and a **Save** button pinned to the bottom.
The footer tells you where you stand: **Edits not saved** (amber) while you have
unsaved changes, **Saved** (green) when it has gone through.

> **Two things save instantly and ignore the Save button:** adding or removing a
> participant type, and uploading an image on the Event Page tab. Everything
> else waits for **Save**.

### Languages

Choose which languages your event and registration form are offered in.
Attendees can switch between them.

- **Available Languages** — the list. Click **+ Add a language** to search for
  more. Five languages are built in (English, Español, Français, Русский,
  Українська); anything else counts as a *custom* language.
- **Default Language** — used whenever a translation is missing. You cannot
  remove the default; change it first, then remove the old one.

> **Custom languages come with a caveat.** Mosaic's own buttons and labels
> ("Register", "First name") stay in the default language for custom languages —
> only the text *you* write gets translated. The five built-in languages
> translate fully.

### The core details

| Field | What it does |
| --- | --- |
| **URL slug** | The last part of your public link. Lower-case letters, numbers and hyphens. **Changing it breaks any link you have already shared** — Mosaic will warn you before saving. |
| **Timezone** | As above. All the dates below are read in this zone. |
| **Starts** / **Ends** | When the event runs. |
| **Registration opens** | Optional. Before this moment the page shows "Registration opens {date}" instead of a Register button. |
| **Registration closes** | Optional. After this moment the page shows "Registration is closed". |
| **Capacity** | Total seats across the whole event. Leave empty for unlimited. Once it is full, new registrations become **waitlisted** rather than rejected. |
| **Visibility** | **Public** shows the event on the home page. **Unlisted** means only people with the link can find it. |

> If you leave both registration dates empty, registration is open from the
> moment you publish until the event ends.

### Contact information

Shown publicly on the event page: name, email, phone and website, plus as many
**Additional contacts** as you need. This is the same data as the Event Page
tab's Contact section — edit it in either place.

---

## 5. Set up participant types

Still on Settings, in the **Participant types** card.

Click **Add type** to open a picker with fifteen ready-made options — Child,
Commuter, Couple, Day-Pass Attendee, Guest, High School Only, Partner, Spouse,
Staff Member / Intern, Student, Student - Age 18 or Older, Student - Under Age
18, Vendor, Visitor, Volunteer — each already translated into the five built-in
languages. Or click **Create my own** for a blank one.

Each type has three fields:

| Field | Notes |
| --- | --- |
| **Name** | Shows the language you are currently viewing the console in, e.g. *Name (en)*. Switch the console language to fill in other languages. |
| **Capacity** | Seats for this type specifically. Blank = unlimited. When it fills, further registrations of that type are waitlisted — even if the event as a whole has room. |
| **Form** | Which set of questions this type answers. Leave it on your main form unless you have built a second one. |

Delete the default **Participant** type if it does not fit your event — but keep
at least one type, or nobody can register.

---

## 6. Build the registration form

Go to the **Forms** tab and click **Edit form**.

> **You must publish a form before you can publish the event.** The
> auto-generated "Default form" does not count, even though it looks published
> in the list. Open it, adjust it, and press **Publish form**.

### The three panes

- **Left — Add question.** Click a type to append it to the form.
- **Middle — the canvas.** Your questions, each showing a live preview of what
  the registrant will see. Drag the `⋮⋮` handle to reorder; click `×` to delete.
- **Right — the inspector.** Settings for whichever question you have selected.

Everything **saves automatically** about a second after you stop typing. The
toolbar shows *Saving…* then *Draft saved*. There is no Save button. If you see
a red *Saving failed*, stop and reload — your recent edits are not stored.

### Question types

| Type | What the registrant sees |
| --- | --- |
| **Name** | One, two or three boxes depending on the format you pick. |
| **Short text** | A single-line box. |
| **Paragraph** | A multi-line box. |
| **Dropdown** | A picker with your options. |
| **Multiple choice (many)** | Checkboxes — they can tick several. |
| **Multiple choice (one)** | Radio buttons — one answer only. |
| **Checkbox** | A single tick box. Good for consents and waivers. |
| **Date** | A date picker, shown in each person's own preferred date format. |
| **Number** | A numeric box. |
| **Email** | An email box. |
| **Phone** | A country-code dropdown plus a number box. |
| **Address** | Address line 1 and 2, city, state/province, postal code, country — you choose which parts to show and which are required. |
| **File upload** | A file picker. One file per question. |
| **Section header** | Not a question — a heading to break up a long form. |

### Setting up each question

Select a question, then use the inspector:

- **Label** — the question text. The language is shown in brackets, e.g.
  *Label (English)*.
- **Help text** — a line of guidance under the question.
- **Required** — a red asterisk appears and the form will not submit without it.
- **Options** (for the three choice types) — add, edit and remove answers.
- **Name format** (Name questions) — First + last / Full name / First + middle +
  last.
- **Address fields** (Address questions) — tick which parts to show, and which
  of those are required.

### Showing a question to only some participant types

In the inspector, the **Applies to** section starts on **All participant types**.
Tick one or more specific types and the question will only appear for them. Use
this for things like a parent/guardian question that only applies to under-18s.

### Conditional questions ("only show this if…")

The **Visibility conditions** section at the bottom of the inspector lets you
show a question based on an earlier answer.

1. Click **Add condition**.
2. Pick the **question** to test, an **operator**, and a **value**.
3. Add more conditions if you need them, and choose whether **all conditions
   match** or **any condition matches**.

The operators are shown as short codes. Here is what they mean:

| Code | Meaning |
| --- | --- |
| `eq` | is exactly |
| `neq` | is not |
| `in` | is one of |
| `notIn` | is none of |
| `contains` | includes (a ticked option, or text containing this) |
| `gt` / `gte` | greater than / greater than or equal to |
| `lt` / `lte` | less than / less than or equal to |
| `isEmpty` | was left blank |
| `isNotEmpty` | was answered |

Three rules worth knowing:

- **You can only reference questions above the current one.** Order your form so
  the trigger question comes first.
- **If you move a question above its own trigger**, the condition breaks and the
  dropdown shows `⚠️ Broken Question Reference`. Delete that condition and add
  it again.
- **Hidden questions are discarded.** If someone answers a question and then
  changes an earlier answer so it hides, their answer is thrown away — and a
  hidden Required question never blocks submission. This is intentional.

### Translations

If your event offers more than one language, an **Edit language** dropdown
appears in the toolbar. Switch it and the Label, Help text and option fields
now edit that language.

Switching to a non-default language **automatically machine-translates** any
empty fields in the background. There is no button and no progress indicator —
the text simply appears. Then:

- **Review it.** It is machine translation; treat it as a first draft.
- **Anything you type by hand is never overwritten** by a later translation.
- **If you add a question while already on another language**, switch away and
  back to translate it.

### Preview

Click **Preview** in the toolbar to see the form exactly as a registrant will,
with conditions and per-type filtering live. If your event has more than one
participant type, a **Preview as** dropdown lets you check each one. Nothing
you type in preview is saved.

### Publishing the form

Press **Publish form**. There is no confirmation step. You will see a green
*Form published* and a burst of confetti.

**How versioning works — worth understanding before your event goes live:**

- The live form is frozen at the version you published. Reopening the builder
  creates a **new draft** copied from it. Registrants keep seeing the old
  version until you press Publish form again.
- Each registrant's answers are stored against **the version they filled in**.
  If you rename or delete a question later, their record keeps the old wording.
- **Mosaic shows no warning that a form is live** or that people have already
  answered it. Check the Participants tab before making big changes.

### Single vs group forms

By default one form serves everyone. If you want different questions depending
on whether someone registers alone or brings a group, click **New form** and
pick **Single response form** or **Group response form**. You can copy the
questions from an existing form so you are not starting over.

You can have at most one of each — one Single, one Group — plus the default. Once
both exist, the **New form** button disappears.

---

## 7. Design the public event page

The **Event Page** tab is a live preview of your public page. Hover any section
and click the pencil to edit it, or use **Customize Page** to open the side
panel directly.

**Start with the Cover section** — it holds the fields that are not on Settings:

- **Event Name** in each language
- **Description** — the short intro under the title
- **Location**
- **Cover image or video** — images up to 5 MB, video up to 30 MB

Then work through the other sections as you need them. Each has a **Show This
Section** tick box, so you can turn off the ones you are not using: **About**,
**Speakers**, **Tracks**, **Agenda**, **Testimonials**, **Gallery**, **FAQ**,
**Tickets**, **Location & Map**, **Contact**. The **Style** tab controls colours,
fonts, corner radius, logo and the order of sections.

Two things to watch:

> **"Tickets" here are decorative.** The Tickets section is a pricing display —
> name, price as free text, a badge, a list of what is included. Mosaic does not
> process payments, and clicking a ticket does not pre-select a participant
> type. Every card shows the same Register button. Real capacity and
> registration behaviour come from **participant types** in Settings.

> **Images upload immediately, but the page does not save itself.** Press
> **Save Page** before you leave.

**Auto-translate**: on the Style tab, under Language options, the
**Auto-translate content** button fills every empty language field from your
default language. Existing text is kept. Review it, then Save Page.

Use **Copy Link** in the toolbar to grab the public URL, and **Open Page** to
view the real thing once published.

---

## 8. Publish

Go to **Settings** and press **Publish**.

If you get *"Publish at least one form before publishing the event"*, go back to
the Forms tab, open a form, and press **Publish form**.

Once published, your event's public page is live. Whether it also appears on the
Mosaic home page depends on three things all being true: status is Published,
Visibility is **Public**, and the end date is in the future.

**Publish** on the Settings tab is the one to use. There is also a Publish
button on the Event Page toolbar, but it skips the "must have a published form"
check — you can end up with a live page that nobody can register through.

### Event phases

Once published, Mosaic works out a phase from your dates and shows it as a badge:

| Badge | When | What the public sees |
| --- | --- | --- |
| **Registration opens soon** | Before your registration-opens date | "Registration opens {date}" |
| **Registration open** | The normal state | A **Register** button |
| **Registration closed** | After your registration-closes date | "Registration is closed" |
| **Happening now** | Between the start and end dates | Still registerable, unless registration has closed |
| **Event ended** | After the end date | No registration |

**Unpublish** returns the event to Draft and the public page stops working.

---

## 9. Manage registrations

The **Participants** tab lists everyone, 50 per page, newest first.

### Reading the table

The first column is **Reg. #** — a registration number like `7.3`, meaning the
seventh registration for this event, third person in it. A family of three
registering together gets `7.1`, `7.2`, `7.3`. Numbers are never reused.

Click a **Reg. #** to open that person's full detail panel.

Then come your form questions as columns, followed by participant type, status,
and the **Profile Name** / **Profile Email** of the account that submitted the
registration (which may not be the participant — a parent registering a child,
for instance).

> The table shows at most **8 question columns**. Your export contains all of
> them.

Click any header to sort; click it again to reverse.

### Finding people

- **Search** matches first name, last name, email, profile name and profile
  email. It does **not** search answers.
- **By status** and **By participant type** dropdowns filter to one value each.
- **Filter…** lets you filter on an actual form answer. Pick a question, then a
  value. Choice questions get a dropdown; text, email and phone questions match
  on a partial word. Date, number, address and file questions cannot be
  filtered.

Multiple filters combine with AND. Active answer filters are not shown as chips
— the only sign is the **Clear filters (N)** counter, so use it if results look
unexpectedly thin.

### Statuses

| Status | Meaning |
| --- | --- |
| **Confirmed** | Has a seat. |
| **Waitlisted** | Registered after a capacity was reached. |
| **Cancelled** | Gave up their seat, which frees capacity. |
| **Pending** | Appears in the dropdowns but is not used in practice. |

Change one person's status with the dropdown in the **Actions** column, or
select several rows and use **Bulk set status**. There is no confirmation step.

**Not every change is allowed:**

| From | You can move them to |
| --- | --- |
| Confirmed | Cancelled only |
| Waitlisted | Confirmed, Cancelled |
| Cancelled | Confirmed, Waitlisted |

So to move a confirmed person to the waitlist you must cancel them first, then
waitlist them. And confirming someone is **capacity-checked** — if the type or
the event is full you get *"cannot confirm participant: capacity is full"*.

### How the waitlist works

People are waitlisted automatically at registration when a capacity is full.

When you cancel a **confirmed** person, Mosaic automatically promotes **one**
waitlisted person to Confirmed — the one who has been waiting longest, across
the whole event, provided their own participant type also has room.

> **Nobody is notified.** Promotion sends no email, shows no message, and does
> not appear anywhere except the person's status changing in the table. If you
> promote someone, tell them yourself. Select their row and use **Copy Emails**.

### Editing someone's answers

Open the detail panel and click **Edit** (you need Check-in level access or
above). You get the real registration form with their answers filled in, so
conditions and validation behave normally. Press **Save**.

You cannot change someone's participant type, delete a participant, or see a
history of status changes from this screen.

---

## 10. Export your data

Two links on the Participants toolbar: **Export to Excel** and **Export to CSV**.

- **The export respects your current filters, search and sort** — but not
  pagination. You always get the whole filtered set, not just the page you are
  looking at.
- **Columns**: Reg. #, then *every* question this event has ever asked
  (including questions from older form versions), then participant type, status,
  Profile Name, Profile Email, and Registered at.
- **Headers are translated** into the language you are using the console in.
  Status values are not — they come out as `confirmed`, `waitlisted`.
- The file is named after your event and today's date. CSV opens correctly in
  Excel including accented characters.

For a very large event the export can time out; if it does, filter to a subset
and export in parts. Exports are limited to 10 per minute.

---

## 11. Add your team

The **Team** tab controls who else can work on this event.

### Access levels

| Level | Can do |
| --- | --- |
| **View** | View and export registrations and payments. |
| **Scholarship** | View, plus manage and add scholarships. |
| **Check-in** | Scholarship, plus add registrants and edit, add or delete payments. |
| **Update** | Check-in, plus change the event and its questions, and delete registrants. |
| **Full** | Everything, including managing the team. |

For the Participants tab specifically: **View** can read and export but change
nothing; **Check-in** is the first level that can confirm, cancel, waitlist, or
edit someone's answers.

You are automatically **Full** on any event you create.

### Adding someone

Type their email into **Add team member by email**, choose an access level, and
press **Submit**.

> **They must already have a Mosaic account.** If they have never signed in you
> will get *"no user with that email"*. Ask them to sign in once first, then add
> them — or use the event code below.

**No email is sent** when you add someone. Tell them yourself.

### The event code

The Team tab shows an **Event code** — your event's slug — with a **Copy**
button. Share it and people can request access themselves. Their requests appear
under **Access requests**, where you pick an access level and press **Approve**
or **Deny**. Again, no email either way.

---

## 12. Troubleshooting

**"Publish at least one form before publishing the event."**
Open the Forms tab, click **Edit form**, and press **Publish form**. The
auto-created Default form does not satisfy this even though it appears
published.

**My changes to the form are not showing up for registrants.**
You have a draft. Press **Publish form**. The Forms list shows the last
*published* version number, so a row reading `v1` may well have a `v2` draft
behind it.

**I changed the URL slug and the old link stopped working.**
That is expected, and Mosaic warns you before saving. There is no redirect from
the old address. If you have already shared the link, change it back.

**"Add the event name in that language on the Event Page tab before making it
the default."**
You picked a default language you have not written the event name in. Go to
Event Page → Cover, switch the preview language, fill in **Event Name**, save,
then set the default.

**"cannot confirm participant: capacity is full"**
Raise the capacity for that participant type (or the event) in Settings, or
cancel someone else first.

**A condition shows `⚠️ Broken Question Reference`.**
The question it pointed at was deleted or moved below this one. Delete the
condition and add it again.

**Nobody can see my published event on the home page.**
Check all three: status is Published, Visibility is **Public**, and the end date
is in the future. Unlisted events work fine by direct link.

**Someone says they registered but they are not in the table.**
Check your filters — clear the search box and press **Clear filters**. Also
check the status filter is not stuck on one value.

---

## 13. What Mosaic does not do

Worth knowing before you promise something to a stakeholder:

- **Payments.** The Tickets section displays prices as text. There is no
  checkout, no card processing, no invoicing.
- **Emails, mostly.** Registrants get one confirmation email when they register.
  That is it. Nothing is sent when someone is promoted off the waitlist,
  confirmed, cancelled, added to your team, or approved for access. Use **Copy
  Emails** on the Participants tab and send those yourself.
- **Deleting a participant.** You can cancel someone, not remove them.
- **Status history.** Changes are recorded but there is no screen showing them.
- **Reminders or scheduled messages.**
- **Editing a registrant's participant type** after they have registered.

---

## Where to go next

- **[docs/quickstart-admin.md](quickstart-admin.md)** — setting up a Mosaic
  instance, auth providers, global roles.
- **[docs/event-creation-runbook.md](event-creation-runbook.md)** — what to do
  when event creation fails in production.
- **[docs/auth-runbook.md](auth-runbook.md)** — sign-in provider configuration.
