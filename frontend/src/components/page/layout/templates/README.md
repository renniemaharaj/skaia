# Page Layout Templates

Use `DirectoryLayout` for searchable grid/list directory screens such as forums,
pages, uploads, datasource listings, and order-style directories.

List mode should normally use `tableColumns` and `tableRowKey`. `TableView`
owns the premium table shell, sticky header, spacing, and row polish; the
directory template should pass the contract and data instead of restyling table
internals. Use `customListContent` only for feeds or nested tools that cannot be
represented as columns.

Avoid wrapping `customListContent` in `directory-layout__list`; the template adds
that wrapper.
