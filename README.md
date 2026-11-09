# Grivet

[![Node.js CI](https://github.com/muellerbbm-vas/grivet/actions/workflows/node.js.yml/badge.svg)](https://github.com/muellerbbm-vas/grivet/actions/workflows/node.js.yml) [![NPM](https://img.shields.io/npm/v/@muellerbbm-vas/grivet.svg)](https://www.npmjs.com/package/@muellerbbm-vas/grivet)

A [JSON:API](https://jsonapi.org) client library written in TypeScript. Follow links between resources with `async`/`await`,
as described by [HATEOAS](https://en.wikipedia.org/wiki/HATEOAS).

## Features

- Transparent access to included resources (in compound documents) as well as linked resources (fetched from a server)
- `Promise`-based access to resources allowing `async`/`await` style programming
- Adaptable to various HTTP client implementations
- Focus on traversing JSON:API resources without knowing specific URLs, as recommended by REST/HATEOAS
- Support for sparse fieldsets
- Support for sorting, filtering and paging, including the pages of related collections
- Uses memoization to avoid repeated network requests and repeated traversals of the document structure
- No runtime dependencies; Jest and the other tools are development dependencies only
- Implemented against the JSON:API 1.0 specification.

## Non-Features

Grivet does not aim to be an ORM. It does not provide methods to manage resources on a server (e.g. deleting or updating resources).

## Installation

```bash
npm i @muellerbbm-vas/grivet
```

## Version 0.2.0

- Build sorting, filtering, paging, and include parameters with `JsonApi.QueryParams`.
- Follow document pages with `nextPage()`, `prevPage()`, `firstPage()`, and `lastPage()`. Use `allPages()` or
  `allResources()` to collect the current page and all following pages.
- Resolve relative links against the full document URL. A context can provide the URL after a redirect through
  the optional `getDocumentWithURL()` method.
- Update development dependencies to address the 23 Dependabot alerts. Two additional advisories remain;
  see the [changelog](./CHANGELOG.md) for details.

**When you upgrade from 0.1.0:** `Relationship.resources()`, `resourcesFromRelatedLink()`, and `relatedResources` now
follow the `next` links of related collections by default. This can cause additional requests. Use
`relationship.resources({ followPaging: false })` to return only the requested page. Use `allowPaging: false` to
reject a paged response with `PagingNotAllowedError`.

See the [query parameter guide](./guides/queryParams.md), [paging guide](./guides/paging.md), and
[changelog](./CHANGELOG.md) for the full changes.

## Basic Usage

To give an idea of what using Grivet looks like, the code snippet below shows how to traverse from an API entry point to the author of a specific article:

```typescript
import { JsonApi } from '@muellerbbm-vas/grivet';

const apiEntryPointDoc = await JsonApi.Document.fromURL(new URL('http://example.com/api/'), context);
const apiEntryPoint = apiEntryPointDoc.resource;
if (!apiEntryPoint) {
  throw new Error('The entry point has no resource.');
}
const articles = await apiEntryPoint.relatedResources['articles'];
if (articles.length === 0) {
  throw new Error('The collection has no articles.');
}
const author = await articles[0].relatedResource['author'];
const name = author.attributes?.['name'];
```

`Document.fromURL` constructs a JSON:API document from a URL and a `Context` object
([see the documentation on contexts](./guides/context.md) for more details). The `Promise` returned by the `fromURL` function is awaited to obtain the `Document` (corresponding to the [JSON:API top level document](https://jsonapi.org/format/1.0/#document-structure)). The raw JSON:API document fetched from the server might look something like this:

```http
GET http://example.com/api HTTP/1.1
Accept: application/vnd.api+json

HTTP/1.1 200 OK
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "entrypoints",
    "id": "1",
    "relationships": {
      "articles": {
        "links": {
          "related": "http://example.com/articles"
        }
      },
      "people": {
        "links": {
          "related": "http://example.com/people"
        }
      }
    }
  }
}
```

The entry point document contains a primary resource with a relationship named "articles" pointing to the _articles_ resources.
The example gets this primary resource and awaits its `relatedResources['articles']` property to fetch the
_articles_ resources as an array of `Resource` objects (corresponding to [JSON:API resource objects](https://jsonapi.org/format/1.0/#document-resource-objects)).
As recommended by HATEOAS principles, we do not need to know the URL of the _articles_ resource in advance, we just follow the provided relationship.

Let's assume the server responds with the following [compound JSON:API document](https://jsonapi.org/format/1.0/#document-compound-documents):

```http
GET http://example.com/articles HTTP/1.1
Accept: application/vnd.api+json

HTTP/1.1 200 OK
Content-Type: application/vnd.api+json

{
  "data": [
    {
      "type": "articles",
      "id": "1",
      "relationships": {
        "author": {
          "data": { "type": "people", "id": "9" }
        }
      }
    }
  ],
  "included": [
    {
      "type": "people",
      "id": "9",
      "attributes": {
        "name": "example name"
      }
    }
  ]
}
```

The _article_ resource contains a relationship to its author, which in this case is included in the document.
The example uses the `relatedResource` property to obtain the _author_ resource linked in the first _article_.
We do not have to know whether the relationship links to an included resource or whether it needs to be fetched from a server.
We just `await` the `relatedResource` property.

The attributes of the _author_ resource can then simply be obtained using its `attributes` property.

## Guides

- [Implementing the `Context` interface](./guides/context.md)
- [Using Sparse Fieldsets](./guides/sparseFieldsets.md)
- [Sorting, filtering and other query parameters](./guides/queryParams.md)
- [Paging](./guides/paging.md)
- [Experimental: constructing a document for POSTing to a server](./guides/clientDocument.md)

## Examples

### Fetch sorted and filtered pages

Use the same `context` as in the basic example. The server defines the supported sort fields, filters, and page parameters.

```typescript
const params = new JsonApi.QueryParams()
  .sort(['-created', 'title'])
  .filter('author', '9')
  .page('size', 50)
  .include(['author']);
const firstPage = await JsonApi.Document.fromURL(new URL('http://example.com/articles'), context, undefined, params);
const articles = await firstPage.allResources();
```

This fetches the first page with the query parameters, then follows its `next` links. The URL passed to `fromURL` is
not changed. For nested filters, pass a path such as `.filter(['author', 'id'], '9')`.

### Listing all relationships of a resource

The `relationships` property of a `Resource` contains all relationships as a map from relationship name to `Relationship` object. This map can be iterated to find all relationships:

```typescript
for (const relationshipName in articleResource.relationships) {
  const relationship = articleResource.relationships[relationshipName];
  // … do something with relationship
}
```

### More examples

See [test/tests.spec.ts](./test/tests.spec.ts) for more examples of how to use this library.

## Reference documentation

Have a look at the [library reference](https://muellerbbm-vas.github.io/grivet/docs/index.html) for more details.

## TODO

- [`self` links in relationships](https://jsonapi.org/format/1.0/#fetching-relationships) ([#20](https://github.com/muellerbbm-vas/grivet/issues/20))

## Development

Use Node.js 22 or 24 for development. CI checks both versions.

```bash
npm ci
npm run build
npm run lint
npm test
npm run docs
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.

## License

Copyright © 2019-2026 Müller-BBM VibroAkustik Systeme GmbH

Licensed under the [MIT](https://github.com/muellerbbm-vas/grivet/blob/master/LICENSE) license
