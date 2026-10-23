# Xigmatic SPC demo

A clickable manufacturing SPC prototype based on `Xigmatic_SPC_Master_Specification.md` v0.2 and the existing Xigmatic Lab frontend design. The ASP.NET Core host serves HTML, CSS and JavaScript. All demo state stays in browser localStorage; there is no database, backend business service or package installation step.

## Run

Requires .NET 10 SDK or later. Open `XigmaticSPC.slnx` in Visual Studio, or run from this directory:

```powershell
dotnet run --project XigmaticSPC.Frontend
```

Open **http://localhost:5088**. `npm start` runs the same command. Node is needed only for the optional checks, not to run the frontend.

## Try the demo

1. Open **CNC-01** in Overview. Switch between Individuals, Moving Range and Histogram. Select a chart point or history row to see traceability and revision evidence.
2. Choose **New inspection**, select the Precision shaft plan and enter a batch. **All characteristics** shows every field together. Enter several readings, watch the filled-count progress and live limit warnings, then choose **Save entered readings**. Valid warning readings are recorded; their required cause, action and notes must be recorded before completion. **One at a time** retains guided entry. Reload to verify that drafts and saved progress resume.
3. Open **Quality events**. Acknowledge or close an investigation with an outcome. New acceptable readings do not close old events. Switch persona from the top-right account button to explore Operator and Viewer restrictions.
4. Open **Baselines & limits**, review 25 reference observations and approve a new version with a reason. Limits remain fixed as observations arrive or display filters change.
5. Open **Inspection plans** and choose **New plan**. Name the plan, choose a workstation, select and order its existing characteristics, and publish revision 1 with a reason. **Run plan** starts an inspection using it. **Review & revise** lets you rename a plan, change its selected characteristics and reorder them. Use each characteristic’s settings button to publish new specification limits and instructions. Running sessions retain their pinned plan, instructions and specification. Publishing plans requires the Quality engineer persona; plans persist in this browser.
6. Open **Data import**, choose **Load demo data**, then validate and commit. Try replacing a value with text to see row errors block the whole import. Source IDs detect identical replay and conflicting content; timestamps enforce stream ordering.
7. Open **Handover & reports** to print or save a PDF through the browser’s print dialog, or export measurements with UTC timestamps and revision references.

**Reset demo data** restores the original synthetic scenario. Browser storage is separate for each browser/origin. There are six workstations, eight characteristics, 350 initial observations, three unresolved events and one workstation with no observations. The example day-shift report covers 22 October 2026, 06:00–14:00 Europe/Copenhagen; unresolved actions carry forward across that cutoff. Newly entered observations use the actual current timestamp.

## Inspection entry

The interface uses a 16px body size with supporting text at least 14px, relative type sizes that follow browser font preferences, and higher-contrast secondary text in light and dark themes. Forms, tables and cards keep those readable sizes on mobile. Charts preserve readable labels as they resize and scroll locally on narrow screens.

The default **All characteristics** view allows readings to be entered in any order, then saved together or in smaller batches. The top counter shows filled characteristics (for example, **1 out of 5**) and a separate count of recorded readings and pending responses. Valid out-of-specification drafts count as filled; blank or malformed inputs do not. Drafts persist per characteristic and are shared with **One at a time** view.

Each characteristic has a compact specification gradient with the target centered, marked lower/upper limits and some space beyond each limit. The measured-value line updates while typing. Readings beyond the displayed range retain their actual number and show a directional arrow at the edge. Expand the bar to reveal the exact limits and units. Both inspection views use the same display; asymmetric tolerances scale each side independently to keep the target centered.

Specification and statistical feedback updates while typing. An in-control reading shows a quiet green check at the top right. Statistical signals and out-of-bounds readings have prominent amber/red status buttons and a subtle tint across the card. Click a status to inspect its specification, control limits, triggered rules and baseline; the two evaluations remain independent. A pass with no approved baseline is labeled **Within spec**, rather than **In control**. Entry screens omit success banners, demo-value buttons and instructional callouts. Limit equality passes. The preview does not create measurements or quality events. A save validates all entered numeric fields before writing, accepts valid warning readings, and leaves blank fields for later. Saved fields remain immutable, and completion requires every characteristic plus all mandatory responses.

## Custom dashboards

Open **Dashboards** in the sidebar, then choose **Edit layout**. The initial Production focus board includes metrics, a process chart, unresolved events and workstation status.

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

Working flows include overview, customizable dashboards, process history and filtering, plan and individual entry, quality responses, reference approval, measurement corrections, versioned configuration, CSV intake, descriptive distributions, audit activity and handover/export. Statistics use the specification’s selected I–MR constants (`d2 = 1.128`, `D4 = 3.267`), strict comparisons and independent specification/control classifications. The baseline review proposes the first 25 observations; approval explicitly creates a new version.

This is a demonstration, not the production architecture proposed in the specification. Calculations are JavaScript for this browser-only prototype; a production implementation would use the specified independently validated calculation service. Persona restrictions demonstrate workflows and are not a security boundary. The demo does not connect identity, machines, email, MES/ERP, suppliers or external services. Subgroup/attribute charts, capability, advanced analytics/ML, shared dashboard permissions, instrument management and the wider P1–P3 roadmap are not implemented. Histogram, descriptive analysis and personal dashboard composition are prototype previews. No standards certification or production validation is claimed.
