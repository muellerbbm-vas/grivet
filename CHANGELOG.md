# Changelog

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## Unreleased

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
