// Single source of the translatable UI texts. Generates the "Texts" property group of src/MxDynamicGrid.xml
// (between the TEXTS markers) and src/utils/textDefaults.ts:   node scripts/texts.mjs
// Placeholders use square brackets ([count], [name]); curly braces are not allowed in text templates.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/** [property key suffix, Studio Pro caption, English default, group] */
export const TEXTS = [
    // Toolbar
    ["Search", "Search placeholder", "Search...", "Toolbar"],
    ["AddRow", "Add row", "Add row", "Toolbar"],
    ["AddColumn", "Add column", "Add column", "Toolbar"],
    ["Undo", "Undo", "Undo", "Toolbar"],
    ["Redo", "Redo", "Redo", "Toolbar"],
    ["Export", "Export", "Export", "Toolbar"],
    ["Import", "Import", "Import", "Toolbar"],
    ["Columns", "Columns", "Columns", "Toolbar"],
    ["GroupBy", "Group by", "Group by", "Toolbar"],
    ["Views", "Views", "Views", "Toolbar"],
    ["Density", "Row density", "Row density", "Toolbar"],
    ["KeyboardHelp", "Keyboard shortcuts", "Keyboard shortcuts", "Toolbar"],
    ["ClearFilters", "Clear filters", "Clear filters", "Toolbar"],
    ["DeleteRows", "Delete selected rows", "Delete [count] rows", "Toolbar"],
    // Saving
    ["Save", "Save", "Save", "Saving"],
    ["Discard", "Discard", "Discard", "Saving"],
    ["Saving", "Saving", "Saving...", "Saving"],
    ["Saved", "Saved", "All changes saved", "Saving"],
    ["Unsaved", "Unsaved changes", "[count] unsaved changes", "Saving"],
    ["SaveFailed", "Save failed", "Saving failed: [message]", "Saving"],
    ["Retry", "Retry", "Retry", "Saving"],
    ["InvalidBlocked", "Invalid cells block saving", "Fix [count] invalid cells before saving", "Saving"],
    ["Conflict", "Version conflict", "Someone else changed this grid. Reload to see their changes; your edits are kept.", "Saving"],
    // Columns
    ["FieldName", "Field name", "Field name", "Columns"],
    ["FieldType", "Field type", "Field type", "Columns"],
    ["Description", "Description", "Description", "Columns"],
    ["DefaultValue", "Default value", "Default value", "Columns"],
    ["Required", "Required", "Required", "Columns"],
    ["Unique", "Unique values", "Unique values", "Columns"],
    ["Options", "Options", "Options", "Columns"],
    ["AddOption", "Add option", "Add option", "Columns"],
    ["Decimals", "Decimals", "Decimals", "Columns"],
    ["Thousands", "Thousands separator", "Thousands separator", "Columns"],
    ["CurrencySymbol", "Currency symbol", "Currency symbol", "Columns"],
    ["DateFormat", "Date format", "Date format", "Columns"],
    ["RatingMax", "Maximum rating", "Maximum rating", "Columns"],
    ["Formula", "Formula", "Formula", "Columns"],
    ["FormulaHelp", "Formula help", "Type an opening brace to insert a column. Functions: IF, AND, OR, NOT, ROUND, SUM, AVG, MIN, MAX, ABS, CONCAT, LEN, UPPER, LOWER, TODAY, DATEDIF.", "Columns"],
    ["Minimum", "Minimum", "Minimum", "Columns"],
    ["Maximum", "Maximum", "Maximum", "Columns"],
    ["Pattern", "Pattern", "Pattern (regular expression)", "Columns"],
    ["ErrorMessage", "Error message", "Error message", "Columns"],
    ["Create", "Create field", "Create field", "Columns"],
    ["Apply", "Apply", "Apply", "Columns"],
    ["Cancel", "Cancel", "Cancel", "Columns"],
    ["Close", "Close", "Close", "Columns"],
    ["NewColumn", "New column caption", "Field [number]", "Columns"],
    ["Copy", "Copy suffix", "copy", "Columns"],
    // Column menu
    ["Rename", "Rename", "Rename", "Column menu"],
    ["EditField", "Edit field", "Edit field", "Column menu"],
    ["ChangeType", "Change type", "Change type", "Column menu"],
    ["Duplicate", "Duplicate", "Duplicate", "Column menu"],
    ["InsertLeft", "Insert left", "Insert left", "Column menu"],
    ["InsertRight", "Insert right", "Insert right", "Column menu"],
    ["SortAsc", "Sort ascending", "Sort ascending", "Column menu"],
    ["SortDesc", "Sort descending", "Sort descending", "Column menu"],
    ["ClearSort", "Clear sort", "Clear sort", "Column menu"],
    ["Filter", "Filter", "Filter", "Column menu"],
    ["GroupByColumn", "Group by this field", "Group by this field", "Column menu"],
    ["Ungroup", "Ungroup", "Remove grouping", "Column menu"],
    ["PinLeft", "Pin left", "Pin left", "Column menu"],
    ["PinRight", "Pin right", "Pin right", "Column menu"],
    ["Unpin", "Unpin", "Unpin", "Column menu"],
    ["Hide", "Hide", "Hide field", "Column menu"],
    ["AutoSize", "Auto-size", "Auto-size", "Column menu"],
    ["Delete", "Delete", "Delete", "Column menu"],
    ["Formatting", "Conditional formatting", "Conditional formatting", "Column menu"],
    ["DeleteColumnConfirm", "Delete field confirmation", "Delete the field [name] and its values in every row?", "Column menu"],
    ["ColumnDeleted", "Field deleted", "Field [name] deleted", "Column menu"],
    ["TypeChangeWarning", "Type change warning", "[count] of [total] values cannot be converted and will be cleared.", "Column menu"],
    ["TypeChangeSafe", "Type change safe", "All [total] values convert without loss.", "Column menu"],
    ["Before", "Before", "Before", "Column menu"],
    ["After", "After", "After", "Column menu"],
    // Rows
    ["InsertAbove", "Insert above", "Insert row above", "Rows"],
    ["InsertBelow", "Insert below", "Insert row below", "Rows"],
    ["DuplicateRow", "Duplicate row", "Duplicate row", "Rows"],
    ["DeleteRow", "Delete row", "Delete row", "Rows"],
    ["ExpandRow", "Expand row", "Expand record", "Rows"],
    ["CopyCells", "Copy", "Copy", "Rows"],
    ["Paste", "Paste", "Paste", "Rows"],
    ["DeleteRowsConfirm", "Delete rows confirmation", "Delete [count] rows?", "Rows"],
    ["RowsDeleted", "Rows deleted", "[count] rows deleted", "Rows"],
    ["Previous", "Previous record", "Previous", "Rows"],
    ["Next", "Next record", "Next", "Rows"],
    ["Record", "Record", "Record [number] of [total]", "Rows"],
    ["PasteAddColumns", "Paste adds columns", "The pasted block is [count] columns wider than the grid. Add them as new fields?", "Rows"],
    ["AddColumns", "Add fields", "Add fields", "Rows"],
    ["Ignore", "Ignore", "Ignore", "Rows"],
    ["ReadOnly", "Read-only", "Read-only", "Rows"],
    ["Pending", "Pending value", "Pending", "Rows"],
    // Filters
    ["FilterContains", "Contains", "Contains", "Filters"],
    ["FilterEquals", "Equals", "Equals", "Filters"],
    ["FilterNotEquals", "Not equal", "Not equal", "Filters"],
    ["FilterStartsWith", "Starts with", "Starts with", "Filters"],
    ["FilterEmpty", "Is empty", "Is empty", "Filters"],
    ["FilterNotEmpty", "Is not empty", "Is not empty", "Filters"],
    ["FilterFrom", "From", "From", "Filters"],
    ["FilterTo", "To", "To", "Filters"],
    ["FilterAny", "Any", "Any", "Filters"],
    ["FilterYes", "Yes", "Yes", "Filters"],
    ["FilterNo", "No", "No", "Filters"],
    ["SelectAll", "Select all", "(Select all)", "Filters"],
    ["Blanks", "Blanks", "(Blanks)", "Filters"],
    ["SearchValues", "Search values", "Search values", "Filters"],
    ["ClearFilter", "Clear filter", "Clear", "Filters"],
    // Grouping and totals
    ["NoGrouping", "No grouping", "No grouping", "Grouping"],
    ["ExpandAll", "Expand all", "Expand all", "Grouping"],
    ["CollapseAll", "Collapse all", "Collapse all", "Grouping"],
    ["Empty", "Empty group", "(Empty)", "Grouping"],
    ["Total", "Totals row", "Total", "Grouping"],
    ["Sum", "Sum", "Sum", "Grouping"],
    ["Avg", "Average", "Average", "Grouping"],
    ["Min", "Minimum value", "Min", "Grouping"],
    ["Max", "Maximum value", "Max", "Grouping"],
    ["Count", "Count", "Count", "Grouping"],
    ["Filled", "Filled", "Filled", "Grouping"],
    ["None", "None", "None", "Grouping"],
    // Status bar and paging
    ["Rows", "Rows", "[count] rows", "Status bar"],
    ["RowsOf", "Rows of total", "[count] of [total] rows", "Status bar"],
    ["Selected", "Selected", "[count] selected", "Status bar"],
    ["SelectAllPages", "Select all pages", "Select all [total] rows", "Status bar"],
    ["ClearSelection", "Clear selection", "Clear selection", "Status bar"],
    ["PagingStatus", "Paging status", "[first] to [last] of [total]", "Status bar"],
    ["PageSize", "Page size", "Rows per page", "Status bar"],
    ["LoadMore", "Load more", "Load more", "Status bar"],
    ["Loading", "Loading", "Loading...", "Status bar"],
    ["NoRows", "No rows", "No rows to show", "Status bar"],
    ["FirstPage", "First page", "First page", "Status bar"],
    ["PreviousPage", "Previous page", "Previous page", "Status bar"],
    ["NextPage", "Next page", "Next page", "Status bar"],
    ["LastPage", "Last page", "Last page", "Status bar"],
    // Export and import
    ["ExportExcel", "Excel", "Excel (.xlsx)", "Export and import"],
    ["KeepGridColors", "Keep grid colours", "Keep grid colours", "Export and import"],
    ["ExportCsv", "CSV", "CSV (.csv)", "Export and import"],
    ["ExportColumns", "Export columns", "Columns", "Export and import"],
    ["VisibleColumns", "Visible columns", "Visible columns", "Export and import"],
    ["AllColumns", "All columns", "All columns", "Export and import"],
    ["ExportRows", "Export rows", "Rows", "Export and import"],
    ["AllRows", "All rows", "All rows", "Export and import"],
    ["FilteredRows", "Filtered rows", "Filtered rows", "Export and import"],
    ["SelectedRows", "Selected rows", "Selected rows", "Export and import"],
    ["Download", "Download", "Download", "Export and import"],
    ["Exporting", "Exporting", "Exporting... [count] rows", "Export and import"],
    ["ImportTitle", "Import title", "Import rows", "Export and import"],
    ["ImportPick", "Choose file", "Choose a .csv or .xlsx file", "Export and import"],
    ["ImportFirstRowHeader", "First row is header", "First row contains field names", "Export and import"],
    ["ImportMapTo", "Map to", "Import into", "Export and import"],
    ["ImportSkip", "Skip", "Skip", "Export and import"],
    ["ImportNewField", "New field", "New field", "Export and import"],
    ["ImportRun", "Import rows", "Import [count] rows", "Export and import"],
    ["ImportDone", "Imported", "[count] rows imported", "Export and import"],
    ["ImportFailed", "Import failed", "The file could not be read", "Export and import"],
    // Views
    ["SaveView", "Save view", "Save current view as...", "Views"],
    ["ViewName", "View name", "View name", "Views"],
    ["SharedView", "Shared view", "Share with everyone", "Views"],
    ["DefaultView", "Default view", "Open by default", "Views"],
    ["DeleteView", "Delete view", "Delete view", "Views"],
    ["ResetView", "Reset view", "Reset layout", "Views"],
    ["PersonalViews", "Personal views", "My views", "Views"],
    ["SharedViews", "Shared views", "Shared views", "Views"],
    // Conditional formatting
    ["ColorScale", "Colour scale", "Colour scale", "Formatting"],
    ["DataBar", "Data bar", "Data bar", "Formatting"],
    ["TextColor", "Text colour when", "Text colour when value", "Formatting"],
    ["AddRule", "Add rule", "Add rule", "Formatting"],
    ["RemoveRule", "Remove rule", "Remove", "Formatting"],
    // Validation
    ["ErrRequired", "Required error", "A value is required", "Validation"],
    ["ErrMin", "Minimum error", "Must be at least [min]", "Validation"],
    ["ErrMax", "Maximum error", "Must be at most [max]", "Validation"],
    ["ErrPattern", "Pattern error", "Value does not match the expected pattern", "Validation"],
    ["ErrOption", "Option error", "Not one of the allowed options", "Validation"],
    ["ErrNumber", "Number error", "Not a number", "Validation"],
    ["ErrDate", "Date error", "Not a date", "Validation"],
    ["ErrUnique", "Unique error", "Value must be unique", "Validation"],
    ["ErrEmail", "Email error", "Not an email address", "Validation"],
    ["Issues", "Invalid cells", "[count] invalid cells", "Validation"],
    // Misc
    ["UndoDone", "Undone", "Undone: [action]", "Messages"],
    ["Pasted", "Pasted", "Pasted [count] cells", "Messages"],
    ["FilledCells", "Filled cells", "Filled [count] cells", "Messages"],
    ["NoPermission", "No permission", "You do not have permission to do this", "Messages"],
    ["ShortcutsTitle", "Shortcuts title", "Keyboard shortcuts", "Messages"],
    // 1.1 view bar
    ["HideFields", "Hide fields", "Hide fields", "View bar"],
    ["Sort", "Sort", "Sort", "View bar"],
    ["Group", "Group", "Group", "View bar"],
    ["Color", "Color", "Color", "View bar"],
    ["RowHeight", "Row height", "Row height", "View bar"],
    ["NewRow", "New row", "New row", "View bar"],
    ["AddField", "Add field", "Add field", "View bar"],
    ["More", "More", "More", "View bar"],
    ["Print", "Print", "Print", "View bar"],
    ["Where", "Where", "Where", "View bar"],
    ["And", "And", "and", "View bar"],
    ["Or", "Or", "or", "View bar"],
    ["AddCondition", "Add condition", "Add condition", "View bar"],
    ["NoConditions", "No filter conditions", "No filter conditions are applied to this view", "View bar"],
    ["AddSort", "Add sort", "Add another sort", "View bar"],
    ["NoSorts", "No sorts", "No sorts applied", "View bar"],
    ["AddGroup", "Add group", "Add subgroup", "View bar"],
    ["NoGroups", "No groups", "Rows are not grouped", "View bar"],
    ["ShowAll", "Show all", "Show all", "View bar"],
    ["HideAll", "Hide all", "Hide all", "View bar"],
    ["FindField", "Find a field", "Find a field", "View bar"],
    ["ColorNone", "No colour", "No colour", "View bar"],
    ["ColorBySelect", "Colour by select field", "Colour rows by a select field", "View bar"],
    ["ColorByConditions", "Colour by conditions", "Colour rows by conditions", "View bar"],
    ["RowShort", "Short", "Short", "View bar"],
    ["RowMedium", "Medium", "Medium", "View bar"],
    ["RowTall", "Tall", "Tall", "View bar"],
    ["RowExtraTall", "Extra tall", "Extra tall", "View bar"],
    ["Ascending", "Ascending", "A → Z", "View bar"],
    ["Descending", "Descending", "Z → A", "View bar"],
    ["SavedAll", "All changes saved", "All changes saved", "View bar"],
    ["UnsavedSave", "Unsaved changes pill", "[count] unsaved", "View bar"],
    ["CouldNotSave", "Could not save", "Couldn't save", "View bar"],
    // 1.1 operators
    ["OpIs", "is", "is", "Operators"],
    ["OpIsNot", "is not", "is not", "Operators"],
    ["OpContains", "contains", "contains", "Operators"],
    ["OpNotContains", "does not contain", "does not contain", "Operators"],
    ["OpIsEmpty", "is empty", "is empty", "Operators"],
    ["OpIsNotEmpty", "is not empty", "is not empty", "Operators"],
    ["OpGt", "greater than", ">", "Operators"],
    ["OpGte", "greater or equal", "≥", "Operators"],
    ["OpLt", "less than", "<", "Operators"],
    ["OpLte", "less or equal", "≤", "Operators"],
    ["OpIsAnyOf", "is any of", "is any of", "Operators"],
    ["OpIsNoneOf", "is none of", "is none of", "Operators"],
    ["OpBefore", "is before", "is before", "Operators"],
    ["OpAfter", "is after", "is after", "Operators"],
    ["OpIsWithin", "is within", "is within", "Operators"],
    ["Today", "Today", "Today", "Operators"],
    ["ThisWeek", "This week", "this week", "Operators"],
    ["NextWeek", "Next week", "next week", "Operators"],
    ["PastWeek", "Past week", "the past week", "Operators"],
    ["ThisMonth", "This month", "this month", "Operators"],
    ["Checked", "Checked", "checked", "Operators"],
    ["Unchecked", "Unchecked", "unchecked", "Operators"],
    // 1.1 views, summary, empty states, hints
    ["AddView", "Add view", "Add view", "View tabs"],
    ["RenameView", "Rename view", "Rename", "View tabs"],
    ["DuplicateView", "Duplicate view", "Duplicate", "View tabs"],
    ["SetDefaultView", "Set default view", "Set as default", "View tabs"],
    ["ShareView", "Share view", "Share with everyone", "View tabs"],
    ["UnshareView", "Make personal", "Make personal", "View tabs"],
    ["UnsavedView", "Unsaved view changes", "Unsaved view changes", "View tabs"],
    ["NewViewName", "New view name", "View [number]", "View tabs"],
    ["Summarize", "Summarize", "Summarize", "Summary bar"],
    ["SumEmpty", "Empty", "Empty", "Summary bar"],
    ["SumUnique", "Unique", "Unique", "Summary bar"],
    ["SumPercentEmpty", "Percent empty", "% empty", "Summary bar"],
    ["SumRange", "Range", "Range", "Summary bar"],
    ["SumEarliest", "Earliest", "Earliest", "Summary bar"],
    ["SumLatest", "Latest", "Latest", "Summary bar"],
    ["StartTemplate", "Start with a template", "Start with a template", "Empty states"],
    ["OrAddField", "Or add first field", "or add your first field", "Empty states"],
    ["TplTasks", "Tasks template", "Tasks", "Empty states"],
    ["TplTasksHelp", "Tasks template help", "Status, owner, due date and priority", "Empty states"],
    ["TplCrm", "CRM template", "Contacts", "Empty states"],
    ["TplCrmHelp", "CRM template help", "Company, email, phone and deal stage", "Empty states"],
    ["TplInventory", "Inventory template", "Inventory", "Empty states"],
    ["TplInventoryHelp", "Inventory template help", "SKU, stock on hand, price and stock value", "Empty states"],
    ["TplBudget", "Budget template", "Budget by month", "Empty states"],
    ["TplBudgetHelp", "Budget template help", "Twelve months as columns with a year total", "Empty states"],
    ["TplBlank", "Blank template", "Blank", "Empty states"],
    ["TplBlankHelp", "Blank template help", "Start with a single Name field", "Empty states"],
    ["NoRecords", "No records", "No records yet", "Empty states"],
    ["NoMatches", "No matches", "No records match these filters", "Empty states"],
    ["Hint1", "Hint 1", "Add a field with the + Add field header: pick a type and see a live preview.", "Hints"],
    ["Hint2", "Hint 2", "Filter, sort, group and colour your records from the view bar.", "Hints"],
    ["Hint3", "Hint 3", "Save the layout as a view tab to come back to it in one click.", "Hints"],
    ["GotIt", "Got it", "Got it", "Hints"],
    ["NextHint", "Next hint", "Next", "Hints"],
    ["FreezeHere", "Freeze up to here", "Freeze up to here", "Column menu"],
    ["Unfreeze", "Unfreeze", "Unfreeze columns", "Column menu"],
    ["FilterByField", "Filter by this field", "Filter by this field", "Column menu"],
    ["CreateOption", "Create option", "Create option [name]", "Columns"],
    ["Preview", "Preview", "Preview", "Columns"],
    ["CatBasic", "Basic types", "Basic", "Columns"],
    ["CatChoice", "Choice types", "Choice", "Columns"],
    ["CatNumber", "Number types", "Number", "Columns"],
    ["CatDate", "Date types", "Date and time", "Columns"],
    ["CatContact", "Contact types", "Contact", "Columns"],
    ["CatAdvanced", "Advanced types", "Advanced", "Columns"],
    ["CatSystem", "System types", "System", "Columns"],
    ["FormulaResult", "Formula result", "Result for the first row", "Columns"],
    // 1.2 views
    ["ViewGrid", "Grid view", "Grid", "View types"],
    ["ViewBoard", "Board view", "Board", "View types"],
    ["ViewCalendar", "Calendar view", "Calendar", "View types"],
    ["ViewGallery", "Gallery view", "Gallery", "View types"],
    ["Customize", "Customize view", "Customize", "View types"],
    ["BoardBy", "Board lanes", "Lanes by", "View types"],
    ["CardFields", "Card fields", "Fields on cards", "View types"],
    ["LaneSummary", "Lane summary", "Lane summary", "View types"],
    ["NoStatus", "No value lane", "No value", "View types"],
    ["NeedSelectField", "Board needs select", "Add a single select field to use the board.", "View types"],
    ["NeedDateField", "Calendar needs date", "Add a date field to use the calendar.", "View types"],
    ["DateField", "Date field", "Date field", "View types"],
    ["EndField", "End date field", "End date (optional)", "View types"],
    ["Month", "Month", "Month", "View types"],
    ["Week", "Week", "Week", "View types"],
    ["CoverField", "Cover field", "Cover image", "View types"],
    ["NoCover", "No cover", "No cover", "View types"],
    ["MoreItems", "More items", "+[count] more", "View types"],
    // 1.2 colour
    ["ColorRules", "Colour rules", "Colour rules", "Color"],
    ["AddColorRule", "Add colour rule", "Add colour", "Color"],
    ["ColorScaleHint", "Colour scale hint", "Number fields can also get a colour scale from their field menu (Conditional formatting).", "Color"],
    // 1.2 bulk edit, find and replace, palette
    ["EditRows", "Edit rows", "Edit [count] rows", "Bulk edit"],
    ["SetField", "Set field", "Set field", "Bulk edit"],
    ["ToValue", "To value", "to", "Bulk edit"],
    ["ApplyToRows", "Apply to rows", "Apply to [count] rows", "Bulk edit"],
    ["Edited", "Rows edited", "[count] rows edited", "Bulk edit"],
    ["FindReplace", "Find and replace", "Find and replace", "Find and replace"],
    ["Find", "Find", "Find", "Find and replace"],
    ["ReplaceWith", "Replace with", "Replace with", "Find and replace"],
    ["MatchCase", "Match case", "Match case", "Find and replace"],
    ["InField", "In field", "In field", "Find and replace"],
    ["AllFields", "All fields", "All text fields", "Find and replace"],
    ["Matches", "Matches", "[count] matches in [rows] rows", "Find and replace"],
    ["ReplaceAll", "Replace all", "Replace all", "Find and replace"],
    ["Replaced", "Replaced", "Replaced [count] values", "Find and replace"],
    ["CommandPalette", "Command palette", "Type a command", "Command palette"],
    ["UndoHistory", "Undo history", "Undo history", "Command palette"],
    ["NothingToUndo", "Nothing to undo", "Nothing to undo yet", "Command palette"],
    ["PrintView", "Print view", "Print this view", "Command palette"],
    ["FiltersSummary", "Filters summary", "Filters: [filters]", "Command palette"],
    // 1.2 collaboration, comments, history, links
    ["Comments", "Comments", "Comments", "Comments"],
    ["AddComment", "Add comment", "Add a comment… use @ to mention", "Comments"],
    ["Send", "Send", "Comment", "Comments"],
    ["Resolve", "Resolve", "Resolve", "Comments"],
    ["Reopen", "Reopen", "Reopen", "Comments"],
    ["Resolved", "Resolved", "Resolved", "Comments"],
    ["NoComments", "No comments", "No comments yet", "Comments"],
    ["History", "History", "History", "Comments"],
    ["NoHistory", "No history", "No changes recorded yet", "Comments"],
    ["UpdatedBy", "Updated by", "Updated by [name]", "Collaboration"],
    ["Viewing", "Viewing", "Viewing now", "Collaboration"],
    ["RecordChanged", "Record changed", "This record was changed by someone else.", "Collaboration"],
    ["ReloadRecord", "Reload", "Reload", "Collaboration"],
    ["KeepMine", "Keep mine", "Keep mine", "Collaboration"],
    ["Locked", "Locked row", "Locked", "Collaboration"],
    ["PickRecords", "Pick records", "Link records", "Linked records"],
    ["SearchRecords", "Search records", "Search records", "Linked records"],
    ["LinkTarget", "Link target", "Linked grid", "Linked records"],
    ["LookupField", "Lookup field", "Field to show", "Linked records"],
    ["RollupFn", "Rollup function", "Summary", "Linked records"],
    ["LinkField", "Link field", "Through link field", "Linked records"]
];

// Type labels and descriptions, translatable too.
export const TYPE_TEXTS = [
    ["text", "Text", "A single line of text"],
    ["longText", "Long text", "Multiple lines of text"],
    ["number", "Number", "A whole number"],
    ["decimal", "Decimal", "A number with decimals"],
    ["currency", "Currency", "An amount of money"],
    ["percent", "Percent", "A percentage"],
    ["date", "Date", "A calendar date"],
    ["dateTime", "Date and time", "A date with a time"],
    ["boolean", "Checkbox", "Yes or no"],
    ["select", "Single select", "One option from a list"],
    ["multiSelect", "Multiple select", "Several options from a list"],
    ["rating", "Rating", "Stars from 1 to the maximum"],
    ["progress", "Progress", "A percentage shown as a bar"],
    ["link", "URL", "A web address"],
    ["email", "Email", "An email address"],
    ["phone", "Phone", "A phone number"],
    ["user", "User", "A person's name"],
    ["formula", "Formula", "Calculated from other fields"],
    ["autoNumber", "Auto number", "A number assigned to each new row"],
    ["createdAt", "Created at", "When the row was created"],
    ["changedAt", "Changed at", "When the row was last changed"],
    ["createdBy", "Created by", "Who created the row"],
    ["changedBy", "Changed by", "Who last changed the row"],
    ["linkedRecord", "Link to records", "Links to rows of another grid"],
    ["lookup", "Lookup", "Shows a field of the linked rows"],
    ["rollup", "Rollup", "Sums or counts over the linked rows"]
];

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const all = [
    ...TEXTS.map(([key, caption, def, group]) => ({ key: `text${key}`, caption, def, group })),
    ...TYPE_TEXTS.flatMap(([type, label, desc]) => [
        { key: `type${cap(type)}`, caption: `${label} type`, def: label, group: "Field types" },
        { key: `type${cap(type)}Help`, caption: `${label} type description`, def: desc, group: "Field types" }
    ])
];
for (const t of all) {
    if (t.def.includes("{") || t.def.includes("}")) {
        throw new Error(`Braces are not allowed in ${t.key}`);
    }
}
const xmlEscape = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const groups = [...new Set(all.map(t => t.group))];
    const indent = "            ";
    const xml = groups
        .map(
            group =>
                `${indent}<propertyGroup caption="${group}">\n` +
                all
                    .filter(t => t.group === group)
                    .map(
                        t =>
                            `${indent}    <property key="${t.key}" type="textTemplate" required="false">\n` +
                            `${indent}        <caption>${xmlEscape(t.caption)}</caption>\n` +
                            `${indent}        <description>Translatable text. Default: ${xmlEscape(t.def)}</description>\n` +
                            `${indent}        <translations>\n` +
                            `${indent}            <translation lang="en_US">${xmlEscape(t.def)}</translation>\n` +
                            `${indent}        </translations>\n` +
                            `${indent}    </property>\n`
                    )
                    .join("") +
                `${indent}</propertyGroup>\n`
        )
        .join("");
    const xmlPath = join(root, "src", "MxDynamicGrid.xml");
    const source = readFileSync(xmlPath, "utf8");
    const begin = "<!-- TEXTS:BEGIN -->";
    const end = "<!-- TEXTS:END -->";
    const a = source.indexOf(begin);
    const b = source.indexOf(end);
    if (a < 0 || b < 0) {
        throw new Error("TEXTS markers missing in the XML");
    }
    writeFileSync(xmlPath, source.slice(0, a + begin.length) + "\n" + xml + indent + source.slice(b));
    const ts =
        "// Generated by scripts/texts.mjs - do not edit by hand.\n" +
        "export const TEXT_DEFAULTS = {\n" +
        all.map(t => `    ${t.key}: ${JSON.stringify(t.def)}`).join(",\n") +
        "\n} as const;\n\nexport type TextKey = keyof typeof TEXT_DEFAULTS;\n";
    writeFileSync(join(root, "src", "utils", "textDefaults.ts"), ts);
    console.log(`wrote ${all.length} texts`);
}
