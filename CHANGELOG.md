# Changelog

## [1.0.0] - 2026-11-06

First release. It includes everything built so far: the view bar with saved views, custom fields of any type, formulas, linked records, lookups and rollups, comments, history, import and export, grouping and totals, the toolbar options to hide each view bar item, and Excel exports that keep the grid's colours. The build log below lists the internal builds that led up to it.

## Development history (internal builds before 1.0.0)

### Internal build of 2026-11-06 (export colours)

#### Added

-   The export dialog has a **Keep grid colours** checkbox for Excel. When it is ticked, the cells get the colours the grid shows: row colours from the Color panel, select option colours, text colour rules (font, fill and bold), colour scales as cell fills, and data bars as native Excel data bars. Progress fields become a 0-100 data bar in the grid accent colour with the value as a percentage, and ratings become orange and grey stars. Link, email and phone fields become clickable links in the accent colour. When it is not ticked, the file has only the styled header, as before. CSV stays plain.
-   The Studio Pro option Export and import > Keep grid colours sets whether the checkbox starts ticked (default on). It is hidden when Export is None or CSV.

### Internal build of 2026-11-06 (numbered 1.3.1 during development)

#### Fixed

-   Counts of one read in the singular: "1 row" in the status bar, "Delete 1 row", "1 match in 1 row" and so on. Texts in other languages are left as they are.

### Internal build of 2026-11-06 (numbered 1.3.0 during development)

#### Added

-   Every item of the view bar can be switched off in Studio Pro (Features > Toolbar): Hide fields, Filter, Sort, Group, Color, Row height, the ⋮ more menu, Export and New row. All are on by default, so existing pages look the same. Search and Import keep their own settings (Quick search, Import).
-   A hidden button also leaves the command palette (Ctrl+K); with Filter off, the column menu no longer offers Filter by this field. When nothing is left on the left, the button row disappears.
-   Studio Pro hides these options while the view bar is off, and the Group option while Grouping is off.

### Internal build of 2026-11-05 (numbered 1.2.2 during development)

#### Fixed

-   The Add field / Edit field panel stays inside the window: it re-fits when its content grows (for example after picking Single select, which adds Options) and when the window resizes, and Cancel / Create stay visible at the bottom while the form scrolls.

### Internal build of 2026-10-30 (numbered 1.2.1 during development)

Enterprise feature round, drop 2. All earlier keys and contracts are unchanged.

- **Linked records** (field type linkedRecord): pick one or more rows of another grid (linkSource, filtered by the
  link target) or of this grid. Values are arrays of row keys; cells show the labels as chips. Settings are kept in
  the options JSON: `{ "target", "multiple" }`.
- **Lookup and rollup fields:** show a field of the linked rows (lookup) or aggregate it (rollup: sum, avg, min, max,
  count). Settings in the options JSON: `{ "link", "field", "fn" }`. addColumn and updateColumn payloads carry `link`.
- **Cell and row comments** (commentsSource): a corner marker on cells with open comments, a comment icon on rows,
  threads with @mentions (suggestions while typing), resolve and reopen. New ops `addComment`
  `{ comment: { key, row, col, text, mentions } }` and `resolveComment` `{ comment, resolved }` (not undoable).
- **Row history** (historySource): a timeline of who changed what in the record drawer.
- **Record drawer:** title from the first field, comments and history sections.
- **Live collaboration:**
  - refreshInterval polls the data sources (never during a save or with unsent auto-save edits);
  - rows changed by others flash and show a dot with the name (rowChangedBy); echoes of your own saves are ignored;
  - a banner in the drawer when someone else changes the record you have unsent edits on (Reload or Keep mine);
  - presence avatars of the other viewers in the view bar.
- **Locked rows** (rowLocked): padlock, no editing, no delete, no drag.
- **Command palette** (Ctrl+K or the ⋯ menu): all toolbar actions, views and shortcuts, plus the undo history (undo
  back to any step).
- **Print this view:** a print-friendly table of the visible fields and rows with the filter summary.

### Internal build of 2026-10-30 (numbered 1.2.0 during development)

Enterprise feature round, drop 1. All earlier keys and contracts are unchanged.

- **Board, Calendar and Gallery views.** "+ Add view" asks for the type, and each tab shows its type icon.
  - **Board:** lanes come from a single-select field and show a count and a summary. Drag a card to another lane to
    change the value (one setCell). Add a row directly in a lane.
  - **Calendar:** month or week view of a date field, with an optional end date for ranges. Drag an item to another
    day to reschedule it (the end date moves with it). Hover a day and click + to add a row. Today, previous and
    next navigation.
  - **Gallery:** cards with a cover image (URL field) and chosen fields.
  - All three use the view's filters, sort and search, and open the record on click.
  - The Customize button sets lanes, card fields, the lane summary, the date fields and the cover.
- **Color:** colour rows by a select field (its option colours), or by condition rules (the same rule builder as
  Filter, first matching rule wins). Number fields keep the colour scale and data bar under Conditional formatting.
- **Bulk edit:** select rows, choose "Edit n rows", pick a field and a value. Sent as one change set.
- **Find and replace** (Ctrl+H or the ⋯ menu): match case, one field or all text fields, a live match count and a
  before/after preview.
- **Formulas:**
  - new functions: IFS, SWITCH, CEILING, FLOOR, AVERAGE, LEFT, RIGHT, MID, TRIM, REPLACE, SUBSTITUTE, NOW, DATEADD,
    WEEKDAY, WORKDAY and FORMAT_DATE;
  - the formula editor shows the signature of the function at the caret and a live result for the first row.
- **Onboarding hints** (showHints): three coach marks (Add field, view bar, views), remembered per browser.
- New properties for drop 2 are already in the XML and do nothing yet:
  - linkSource and its link* attributes, comments*, history*;
  - refreshInterval, rowChangedBy/At, presence, rowLocked;
  - showCommandPalette, allowViewTypes.
- New field types (drop 2): linkedRecord, lookup, rollup.

### Internal build of 2026-10-29 (numbered 1.1.1 during development)

Fixes from the live review of the 1.1 examples.

- View tabs: the default (or first) saved view is the active tab when the page opens.
- Template picker: the grid keeps enough height for the cards. New row and Import are hidden until the grid has
  fields.
- Row numbers count data rows only (group headers no longer shift them).
- The summary bar shows the total row count in server mode. Narrow summary cells drop the function name instead of
  cutting the value. The duplicate row count in the status bar is hidden when the summary bar shows it.

### Internal build of 2026-10-29 (numbered 1.1.0 during development)

Enterprise UX redesign (Airtable / Notion style). All 1.0 property keys and contracts are unchanged.

- **View bar** with labelled buttons that show a count when active: Hide fields, Filter, Sort, Group, Row height.
  It also has expanding search, a save-status pill, Import, Export and a primary + New row. Undo/redo, the columns
  panel, keyboard help, print and reset view move to the "⋯" menu.
- **Filter rule builder**: "Where [field] [operator] [value]" with and/or. Operators depend on the field type: is,
  contains, comparisons, is any of / none of, before/after, is within (today, this week, next week, past week, this
  month), empty and not empty. The rules are stored in the view state and sent to server mode as "rules".
- **Sort list** with drag reorder; **group** up to three levels with collapse and expand all; **hide fields** with
  search, switches, drag reorder, show all and hide all; **row height** short, medium, tall or extra tall
  (32/40/56/88 px).
- **View tabs** over the saved views: add, rename (double-click), duplicate, set default, share or make personal,
  delete. Changes show an unsaved dot and a Save view action.
- **Field header**: click a header for the field menu (now with Freeze up to here and Filter by this field). A
  description (i) marker shows on the header. The "+" is now a labelled "+ Add field" header.
- **Field dialog**: a searchable type list grouped as Basic, Choice, Number, Date and time, Contact, Advanced and
  System, with descriptions and a live preview cell.
- **Rows**: the row number turns into a checkbox on hover (no separate checkbox column), and the header holds
  select all. An inline "+ New row" sits at the end of the grid; the dashed bar under the grid is gone.
- **Summary bar** under every column. Click a cell to choose None, Count, Empty, Filled, Unique or % empty;
  numbers add Sum, Average, Min, Max and Range, dates add Earliest and Latest. The choice is stored in the view.
- **Save pill**: All changes saved, Saving…, n unsaved · Save, or Couldn't save · Retry.
- **Empty states**:
  - template picker (Tasks, Contacts, Inventory, Budget by month, Blank) for a grid without fields;
  - "No records yet + New row";
  - "No records match these filters · Clear filters".
- **Height mode**: auto (grow with the rows up to maxHeight, default 640px), fixed, or fill parent. The first field
  is frozen by default.
- New properties:
  - showViewBar, showViewTabs, freezeFirstColumn, showTemplates, showHints;
  - heightMode, maxHeight, rowHeight;
  - 102 new translatable texts.
- showHeaderFilters now defaults to off.
- showHints, colour rules and the formula live preview are reserved for 1.1.1.

### Internal build of 2026-10-29 (numbered 1.0.1 during development)

UI polish after the first live review.

- Header groups:
  - Columns without a header group no longer get an empty group cell with resize separators; their header spans
    the full header height.
  - When no column has a group, there is no group row at all.
- Number and date header filters on narrow columns (under 200 px) collapse into one compact button. It opens a
  popover with from/to, empty and not empty.
- Totals footer:
  - It is hidden when no visible column has an aggregate.
  - It shows a "Total" label (in the row-number column, or the first free column).
  - It has a white background with a stronger top border.
- The horizontal scrollbar is always visible when columns overflow, thin and themed (also in dark mode).
- Pinned left and right sections get a subtle edge shadow, so the "+" column no longer seems to cut the last header.
- Tighter, density-aware heights:
  - header: 44/78 px normal, 36/66 compact, 52/88 comfortable (without/with filters);
  - group row: 30 px (26 compact, 34 comfortable);
  - rows: 44 px (36 compact, 52 comfortable).
- Atlas / Data Grid 2 look: white header, Atlas border, hover and selection colours, faint column lines, header
  separators shown on hover only, and captions and filters on one baseline.

### Internal build of 2026-10-29 (numbered 1.0.0 during development)

First release.

- Runtime columns: a "+" field form with a type picker (23 types) and type-specific options. A header menu with
  rename, edit, change type with a conversion preview, duplicate, insert, sort, filter, group, pin, hide, auto-size,
  formatting, and delete with undo.
- Change-set v1 save contract:
  - auto or manual save;
  - optimistic overlay;
  - result errors mapped to cells;
  - retry without losing edits;
  - optimistic concurrency through baseVersion.
- Typed editors and renderers. Record drawer. Add, duplicate, delete and drag rows. Range selection, fill handle,
  TSV copy/paste (adds rows and fields), and undo/redo for data and structure.
- Header filters by type, set filter, quick search, multi-sort, paging, virtual scrolling or load more, and selection
  with select all across pages.
- Grouping with aggregates, totals footer, status bar with range aggregates, columns panel, conditional formatting,
  personalization, and saved views (personal, shared, default).
- Static Data Grid 2 style columns (attribute, dynamic text, custom content).
- Styled xlsx and CSV export. Formula-injection safe. Before/after export events. Server-mode export through every
  page.
- CSV/XLSX import with field mapping and field creation.
- Client, server and auto data modes, with the view state JSON for self-paging microflow data sources.
- Light/dark, density, motion levels respecting prefers-reduced-motion, 225 translatable texts, and Studio Pro design
  and structure previews.
