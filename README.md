# Xigmatic SPC demo

A clickable manufacturing SPC prototype based on `Xigmatic_SPC_Master_Specification.md` v0.2 and the existing Xigmatic Lab frontend design. The ASP.NET Core host serves HTML, CSS and JavaScript. All demo state stays in browser localStorage; there is no database, backend business service or package installation step.

## Run

Requires .NET 10 SDK or later. Open `XigmaticSPC.slnx` in Visual Studio, or run from this directory:

```powershell
dotnet run --project XigmaticSPC.Frontend
```

Open **http://localhost:5088/#walkthrough** for the customer meeting. `npm start` runs the same command. Node is needed only for the optional checks, not to run the frontend. The interface remains in English to match the existing prototype; the presenter runbook below is in Danish.

## Kundegennemgang — 10–15 minutter

Formålet er at vise et sammenhængende forløb: **produktionsordre → registrering → afvigelse → handling → kontrol af effekt → dokumentation**. Vis kun dette forløb først; brug de øvrige sider til spørgsmål bagefter.

### Klargøring før mødet

1. Start programmet og åbn **Customer walkthrough** på `http://localhost:5088/#walkthrough`.
2. Vælg **Load customer scenario** og bekræft udskiftningen af browserens demodata. Scenariet hedder **Nordic Foods** og indeholder fiktive ordrer, produkter og målinger. Det er ikke kundens faktiske data eller specifikationer.
3. Brug **PO-1042** på **PACK-01**. Produktet er **Chicken strips · 500 g**, og ordren er knyttet til en publiceret kontrolplan og et batchnummer. **PO-1043** er en anden ordre, som kan bruges til at demonstrere adskillelsen mellem ordrer.
4. Gennemfør nedenstående forløb én gang som generalprøve. Brug derefter **Reset demo data** til at gendanne kundescenariet før mødet. Kontrollér, at der ikke er aktive inspektioner eller åbne hændelser fra generalprøven.

Siden **Customer walkthrough** viser fremdrift og særskilte præsentationsnoter. Her står også, hvilke dele af en produktionsløsning der stadig skal implementeres.

### 1. Vælg produktionsordren — 1–2 minutter

Vis ordren **PO-1042**, produkt, batch og linje. Skift eventuelt til **Operator** via brugermenuen øverst, og vælg **Start / resume inspection** for ordren.

Sig eksempelvis: *“Her vælger operatøren den produktion, der skal kontrolleres. Ordre, batch, linje og de gældende specifikationer følger med registreringen. I produktionsversionen skal de aftalte stamdata og ordrer hentes fra M3; her bruger vi fiktive demonstrationsordrer.”*

### 2. Registrér målinger — 2 minutter

Brug **All characteristics**, og indtast følgende værdier manuelt:

| Parameter | Værdi til første inspektion | Forventet resultat |
| --- | ---: | --- |
| Net weight | **493 g** | Uden for de illustrative specifikationsgrænser på 495–505 g; giver også et statistisk signal. |
| Seal width | **4 mm** | Inden for specifikation og uden statistisk signal. |
| Label position | **10 mm** | Inden for specifikation og uden statistisk signal. |

Vælg **Save entered readings**. Åbn vægtmålingens status for at vise forskellen mellem specifikationsgrænser og statistiske kontrolgrænser samt den anvendte revision.

Sig: *“Værdien bliver gemt, selv om den er forkert i forhold til kravet. Vi skal kunne dokumentere afvigelsen og reaktionen. Operatøren kan se, hvad der kræver handling.”*

Alle grænser i dette scenarie er illustrative kvalitetskrav. De repræsenterer hverken lovbestemte vægttolerancer eller godkendte fødevaresikkerhedskriterier.

### 3. Dokumentér reaktionen — 2–3 minutter

Vælg **Required response** på vægtmålingen. Vis, at hændelsen peger tilbage på målingen og den rigtige ordre. Udfyld årsag, containment, handling, ansvarlig, deadline og noter. Et eksempel til generalprøven:

| Felt | Forslag til demonstration |
| --- | --- |
| Cause | `Doseringsindstilling afviger fra godkendt opsætning.` |
| Containment | `Berørte demopakker er tilbageholdt til kvalitetsvurdering.` |
| Action | `Doseringsindstilling kontrolleret og justeret. Nye kontrolmålinger aftalt.` |
| Owner | `M. Sørensen` |
| Due | Vælg et passende fremtidigt tidspunkt i feltet. |
| Notes | `Produktionsansvarlig informeret. Afventer dokumenteret opfølgning.` |

Vælg **Save & acknowledge**. Gå tilbage til inspektionen og vælg **Complete inspection**. Inspektionen er nu registreret færdig, mens hændelsen fortsat er åben for opfølgning.

Sig: *“Registreringen og opfølgningen har hver sin status. Vi har dokumenteret den umiddelbare reaktion, og der er stadig en ansvarlig opgave, som skal verificeres.”*

### 4. Registrér opfølgning — 2–3 minutter

Åbn vægthændelsen, og brug **Record follow-up** til en ny måling på samme ordre og parameter. Indtast **500 g**. Den første tilbagevenden fra 493 til 500 g udløser et **moving-range-signal**, fordi springet mellem de to målinger er stort. Det er forventet statistisk adfærd.

Dokumentér også reaktionen på denne nye hændelse; brug eksempelvis årsagen `Forventet spring efter den dokumenterede justering`, og henvis i noterne til den oprindelige afvigelse. Bevar ansvarlig, deadline og containment, indtil opfølgningen er vurderet. Registrér derefter endnu en opfølgende måling på **500 g**. Denne måling er inden for specifikation og uden statistisk signal i det forberedte scenarie.

Sig: *“En god måling lukker ikke automatisk en hændelse. Systemet bevarer også det statistiske signal, som opstår under genopretningen, så vi kan forklare hele forløbet.”*

### 5. Verificér og luk — 1–2 minutter

Skift til **Quality engineer**. Åbn den oprindelige hændelse, vælg den seneste rene opfølgningsmåling som dokumentation, og skriv en særskilt vurdering, eksempelvis `Den gemte opfølgningsmåling er vurderet; den dokumenterede justering har haft den forventede effekt i demonstrationen.` Luk hændelsen. Vurdér og luk også hændelsen fra springet tilbage til 500 g med den samme senere, rene opfølgningsmåling.

Vis hændelseshistorikken med tidspunkt, person og de gemte svar. Lukning kræver **Quality engineer**, en begrundelse og en senere gemt måling på samme ordre og parameter, som er statistisk evalueret og uden OOS/OOC. Det er en afgrænset demonstrationsregel; kundens faktiske krav til verifikation og produktfrigivelse skal aftales særskilt.

### 6. Vis dokumentationen — 2 minutter

Åbn **Order report** for **PO-1042**. Vis de oprindelige inspektionsmålinger, opfølgningen og både åbne og lukkede hændelser. Kontroller, at årsag, containment, handling, ansvarlig, deadline og verifikation er synlige.

Vis **Measurement CSV** og eksporten af **JSON evidence**. CSV giver målingernes sporbarhed; JSON-pakken bevarer den tilhørende dokumentation og historik. Brug rapportens printknap til udskrift eller **Save as PDF** i browserens printdialog.

Sig: *“Det, vi lige har registreret og besluttet, kan findes igen under den samme ordre. Herfra vil vi sammen med jer afklare den præcise rapportering og de dokumentationskrav, der skal gælde i produktionen.”*

## Scenarier, datoer og browserdata

- Et nyt browsermiljø starter med det oprindelige industrielle datasæt, indtil **Load customer scenario** vælges. Åbning af **Customer walkthrough** alene erstatter ikke gemte data.
- **Load customer scenario** erstatter efter bekræftelse det aktive browserdatasæt med fødevarescenariet. **Restore industrial scenario** i guiden skifter tilbage til det oprindelige datasæt. Scenarieskift bevarer ikke separate versioner af begge datasæt; eksportér ønsket dokumentation først.
- **Reset demo data** gendanner det aktuelt aktive scenarie og fjerner dets nye demomålinger, svar, konfigurationsændringer og personlige dashboards. Fødevarescenariet får friske syntetiske datoer ved indlæsning/nulstilling.
- Genindlæsning af siden bevarer det aktive scenarie, målinger, svar og inspektionskladder i samme browsers `localStorage`. Data deles ikke mellem browsere, profiler, værter eller porte.
- Hvis browserlagring er utilgængelig, viser prototypen en advarsel; ændringer varer da kun i den åbne fane.
- **Current shift** beregnes ud fra det aktuelle tidspunkt og **Europe/Copenhagen**, inklusive sommer-/vintertid. Det tidligere faste vindue fra 22. oktober 2026 bruges ikke som den aktuelle vagt.
- Kundens **Order report** følger den valgte ordre på tværs af vagter og viser også lukkede hændelser. Nye målinger forsvinder derfor ikke, fordi de er taget uden for den oprindelige demos vagttid.

## Try the industrial demo

Select **Restore industrial scenario** from the demo guide to explore the original machining scenario.

1. Open **CNC-01** in Overview. Switch between Individuals, Moving Range and Histogram. Select a chart point or history row to see traceability and revision evidence.
2. Choose **New inspection**, select the Precision shaft plan and enter a batch. **All characteristics** shows every field together. Enter several readings, watch the filled-count progress and live limit warnings, then choose **Save entered readings**. Valid warning readings are recorded; their required cause, action and notes must be recorded before completion. **One at a time** retains guided entry. Reload to verify that drafts and saved progress resume.
3. Open **Quality events**. Acknowledge or close an investigation with an outcome. New acceptable readings do not close old events. Switch persona from the top-right account button to explore Operator and Viewer restrictions.
4. Open **Baselines & limits**, review 25 reference observations and approve a new version with a reason. Limits remain fixed as observations arrive or display filters change.
5. Open **Inspection plans** and choose **New plan**. Name the plan, choose a workstation, select and order its existing characteristics, and publish revision 1 with a reason. **Run plan** starts an inspection using it. **Review & revise** lets you rename a plan, change its selected characteristics and reorder them. Use each characteristic’s settings button to publish new specification limits and instructions. Running sessions retain their pinned plan, instructions and specification. Publishing plans requires the Quality engineer persona; plans persist in this browser.
6. Open **Data import**, choose **Load demo data**, then validate and commit. Try replacing a value with text to see row errors block the whole import. Source IDs detect identical replay and conflicting content; timestamps enforce stream ordering.
7. Open **Handover & reports** to print or save a PDF through the browser’s print dialog, or export measurements with UTC timestamps and revision references.

The industrial seed contains six workstations, eight characteristics, 350 initial observations, three unresolved events and one workstation with no observations. These historical seed observations retain their original dates. Choose **All demo observations** to review them when they are outside the current shift. Newly entered observations use the actual current timestamp.

## Inspection entry

The interface uses a 16px body size with supporting text at least 14px, relative type sizes that follow browser font preferences, and higher-contrast secondary text in light and dark themes. Forms, tables and cards keep those readable sizes on mobile. Charts preserve readable labels as they resize and scroll locally on narrow screens.

The default **All characteristics** view allows readings to be entered in any order, then saved together or in smaller batches. The top counter shows filled characteristics (for example, **1 out of 5**) and a separate count of recorded readings and pending responses. Valid out-of-specification drafts count as filled; blank or malformed inputs do not. Drafts persist per characteristic and are shared with **One at a time** view.

Each characteristic has a compact specification gradient with the target centered, marked lower/upper limits and some space beyond each limit. The measured-value line updates while typing. Readings beyond the displayed range retain their actual number and show a directional arrow at the edge. Expand the bar to reveal the exact limits and units. Both inspection views use the same display; asymmetric tolerances scale each side independently to keep the target centered.

Specification and statistical feedback updates while typing. An in-control reading shows a quiet green check at the top right. Statistical signals and out-of-bounds readings have prominent amber/red status buttons and a subtle tint across the card. Click a status to inspect its specification, control limits, triggered rules and baseline; the two evaluations remain independent. A pass with no approved baseline is labeled **Within spec**, rather than **In control**. Entry screens omit success banners, demo-value buttons and instructional callouts. Limit equality passes. The preview does not create measurements or quality events. A save validates all entered numeric fields before writing, accepts valid warning readings, and leaves blank fields for later. Saved fields remain immutable, and completion requires every characteristic plus all mandatory responses.

## Custom dashboards

Open **Dashboards** in the sidebar, then choose **Edit layout**. The initial Production focus board includes metrics, a process chart, unresolved events and workstation status. Its default process chart follows the active scenario: net weight on PACK-01 for the customer scenario, and outer diameter on CNC-01 for the industrial scenario.

- Create named dashboards from a blank canvas, the production template or a copy of the current board. Dashboard settings also support renaming and deletion; at least one board remains available.
- Add, rename, remove or reorder sections. Each section supports one to four columns and independent expand/collapse state.
- Add metrics, process charts, quality events, workstation status, recent observations, inspection sessions, approved limits or text notes. Configure titles, data scope, chart family, observation window and width as applicable.
- Drag widgets by their grip within or between sections, including empty or collapsed sections. Section grips reorder entire sections. Grey drop slots appear without shifting the layout; every slot corresponds to the final numbered position, so dropping on the second card puts the widget second. The original position accepts a drop to keep the order unchanged. The selected destination highlights while a thumbnail follows the pointer. Mouse and touch support page-edge scrolling. **Esc** cancels without changing the layout.
- Use the **Move** button as an alternative to dragging. On a focused grip, **Space** lifts the item, arrow keys select a slot and **Enter** places it. **Alt + Up/Down** also reorders immediately; widget grips support **Alt + Left/Right** to move between sections.
- Collapse individual widgets or sections, or use Collapse all / Expand all. The latest 20 layout changes can be undone, including removals of widgets, sections and dashboards.

Layouts, active dashboard and collapse states persist in the same browser storage as the demo. Existing measurements and investigations survive the dashboard migration. Operators and quality engineers can edit; viewers can inspect and expand/collapse. Reset demo data also resets custom dashboards. These are personal browser layouts, rather than shared server-side dashboards.

## Project structure

```text
XigmaticSPC.Frontend/
  Program.cs                   Minimal static host and /health
  wwwroot/masterpages/app.html Application shell
  wwwroot/pages/               Screen and dialog HTML templates
  wwwroot/styles/app.css       Responsive light/dark Xigmatic styling
  wwwroot/scripts/
    htmly.js                   Original binding library from Xigmatic Lab
    gaffa.js                   Original template library from Xigmatic Lab
    app.js                     Navigation, view models and interactions
    demo-store.mjs             Browser-local state and workflow rules
    customer-scenario.mjs      Synthetic food-production orders and reference observations
    reporting.mjs             Order-scoped report data, measurement CSV and JSON evidence
    statistics.mjs             Pure I–MR and specification calculations
    inspection-preview.mjs     Pure entry preview and filled/saved progress calculations
    specification-gauge.mjs    Range positions, centered targets and overflow indicators
    inspections.mjs            Multi-field and guided inspection entry interactions
    plans.mjs                  Plan creation, characteristic selection and revision editor
    charts.mjs                 SVG charts and interactive observation points
    dashboards.mjs             Dashboard rendering, forms and pointer/keyboard interaction
    dashboard-store.mjs        Dashboard layouts, validation, migration and undo history
    dashboard-drop-slots.mjs   Valid insertion destinations for widget and section moves
tests/                         Statistical, workflow and dashboard regression checks
```

The two Xigmatic libraries are copied unchanged from `XigmaticLab.Frontend/wwwroot/scripts`. Page lists use htmly bindings and gaffa templates. An adapter handles the `/demo-api/` binding namespace entirely inside the browser; these are not server APIs. The icon font is copied from Lab with its license and loads locally. There are no CDN dependencies.

## Checks

```powershell
dotnet build XigmaticSPC.slnx
npm test
```

The Node checks cover numeric validation, I–MR constants and boundaries, missing baselines, independent OOS/OOC states, idempotent submissions, session resume and required responses, permissions, CSV replay/conflicts/ordering, corrections, frozen baselines and pinned configuration revisions. Browser verification covers inspection completion, event responses, baseline approval, configuration publication, CSV validation/commit/download, dark appearance and mobile overflow/navigation.

## Prototype scope

Working flows include the customer walkthrough with synthetic production-order selection, pinned order context, plan and individual entry, quality responses, saved follow-up measurements and verified closure, order reports and evidence exports. The industrial workflow, overview, customizable dashboards, process history and filtering, reference approval, measurement corrections, versioned configuration, CSV intake, descriptive distributions and audit activity remain available. Statistics use the specification’s selected I–MR constants (`d2 = 1.128`, `D4 = 3.267`), strict comparisons and independent specification/control classifications. The baseline review proposes the first 25 observations; approval explicitly creates a new version.

This is a demonstration, not the production architecture proposed in the specification. All customer-scenario names, orders, measurements and thresholds are synthetic. Calculations are JavaScript for this browser-only prototype; a production implementation would use the specified independently validated calculation service. Persona restrictions demonstrate workflows and are not authentication or a security boundary. There are no actual M3/Kameloen connections, external APIs, MCP server, machine connections, sent emails or automatic notification escalation. The `/demo-api/` paths are local view bindings, not deployed integration endpoints.

The customer response and verification flow demonstrates a bounded investigation with containment, ownership, deadline, history and evidence-backed closure. It is not the full configurable Reaction Plan / CAPA lifecycle in the requirements. Passing a follow-up measurement does not automatically close an event or release product. Subgroup/attribute charts (including X-bar/R), Cp/Cpk or Pp/Ppk capability studies, advanced analytics/ML, shared dashboard permissions, instrument management and the wider P1–P3 roadmap are not implemented. Histogram, descriptive analysis and personal dashboard composition are prototype previews. No standards certification, SQMS compliance or production validation is claimed.
