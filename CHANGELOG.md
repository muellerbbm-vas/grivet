# Changelog

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- `QueryParams` builds query parameters (`include`, `fields`, `sort`, `filter`, `page` and custom ones). `Document.fromURL`
  takes them as optional fourth argument.
- `Document.links` and paging: `nextPage()`, `prevPage()`, `firstPage()`, `lastPage()`, `allPages()` and `allResources()`.
- `Relationship.relatedDocument()`, `resources()` and `resourcesFromRelatedLink()` take options for sparse fields, sorting
  (`sort`) and paging (`page`, `replacePage`, `allowPaging`, `followPaging`). `PagingNotAllowedError` is thrown for a
  paged response with `allowPaging: false`.

### Changed

- `Relationship.resources()`, `resourcesFromRelatedLink()` and the `relatedResources` accessor follow the `next` links of a
  paged related document and return the resources of all pages. Before, only the first page was returned. Use
  `resources({ followPaging: false })` for the first page only.
- Resource linkage of a relationship that has pagination links is not used, since it may be incomplete; the `related`
  link is used instead.
- `Document.fromURL` no longer adds the sparse fields to the given `URL` object but to a copy, which becomes `Document.url`.
- A relationship's `related` link no longer gets duplicate `fields[...]` parameters if it already contains them.

### Fixed

- `null` links (e.g. `"next": null` on the last page) no longer throw when reading the links of a relationship.

## [v0.1.0](https://github.com/muellerbbm-vas/grivet/compare/v0.0.9...v0.1.0) - 2026-10-22

### Added

- `Document.findResourceObjects(id, type)` returns the primary and included resource objects with the given id and type.

### Changed

- `RelatedResource`s are looked up through a per-document type/id index instead of scanning all primary and included
  resources for every lookup. Resolving the related resources of large compound documents (tens of thousands of
  included resources) now takes milliseconds instead of many seconds. Like the memoized accessors, the index is built
  once, so changes made to `Document.rawData` after the first lookup are not seen.

### Fixed

- Resolving related or included resources of a document whose `data` is `null` no longer throws a `TypeError`.

## [v0.0.9](https://github.com/muellerbbm-vas/grivet/compare/v0.0.8...v0.0.9) - 2023-03-08

### Fixed

- Removed dependency on `tslib`

## [v0.0.8](https://github.com/muellerbbm-vas/grivet/compare/v0.0.7...v0.0.8) - 2022-08-12

### Changed

- Marked the ClientDocument class as "experimental" and added some basic documentation

## [v0.0.7](https://github.com/muellerbbm-vas/grivet/compare/v0.0.6...v0.0.7) - 2022-01-27

### Fixed

- Unknown members in documents are no longer considered errors and are now ignored as per the standard

## [v0.0.6](https://github.com/muellerbbm-vas/grivet/compare/v0.0.5...v0.0.6) - 2019-10-23

### Fixed

- Correct return type of `related*` accessors

## [v0.0.5](https://github.com/muellerbbm-vas/grivet/compare/v0.0.4...v0.0.5) - 2019-08-27

### Fixed

- "data":null is a valid relationship object

## [v0.0.4](https://github.com/muellerbbm-vas/grivet/compare/v0.0.3...v0.0.4) - 2019-04-15

### Added

- New methods to prefer fetching of related resources via `related` links instead of resource linkage when both a `data` and `links` member are present in a relationship

## [v0.0.3](https://github.com/muellerbbm-vas/grivet/compare/v0.0.2...v0.0.3) - 2019-02-12

### Fixed

- Handle "data":null in relationships correctly. Fixes [#24](https://github.com/muellerbbm-vas/grivet/issues/24)

## [v0.0.2](https://github.com/muellerbbm-vas/grivet/compare/v0.0.1...v0.0.2) - 2019-02-11

### Fixed

- Add correct prototype for custom Error classes
- Links consisting only of a path name were not prefixed with the base URL when they appeared in the `links` or `meta.links` member of resources
- SchemaChecker did not complain when it encountered non-objects

## v0.0.1 - 2019-01-21

### Initial commit

- Initial commit [`0007fff`](https://github.com/muellerbbm-vas/grivet/commit/0007fff0150f51842ed88d15346865df03fddf27)
