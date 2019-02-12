# Grivet

[![Build Status](https://travis-ci.org/muellerbbm-vas/grivet.svg?branch=master)](https://travis-ci.org/muellerbbm-vas/grivet) [![NPM](https://img.shields.io/npm/v/@muellerbbm-vas/grivet.svg)](https://www.npmjs.com/package/@muellerbbm-vas/grivet) ![Dependencies](https://david-dm.org/muellerbbm-vas/grivet.svg)

A [JSON:API](https://jsonapi.org) client library written in Typescript with emphasis on RESTful traversal of resources according to [HATEOAS](https://en.wikipedia.org/wiki/HATEOAS) principles.

## Features

- Transparent access to included resources (in compound documents) as well as linked resources (fetched from a server)
- `Promise`-based access to resources allowing `async`/`await` style programming
- Adaptable to various HTTP client implementations
- Focus on traversing JSON:API resources without knowing specific URLs, as recommended by REST/HATEOAS
- Support for sparse fieldsets
- Uses memoization to avoid repeated network requests and repeated traversals of the document structure
- No dependencies (apart from `jest` for testing)
- Implemented against the JSON:API 1.0 specification.

## Non-Features

Grivet does not aim to be an ORM. It does not provide methods to manage resources on a server (e.g. deleting or updating resources).

## Installation

```bash
npm i @muellerbbm-vas/grivet
```

## Basic Usage

To give an idea of what using Grivet looks like, the code snippet below shows how to traverse from an API entry point to the author of a specific article:

```typescript
import { JsonApi } from '@muellerbbm-vas/grivet';

const apiEntryPointDoc = await JsonApi.Document.fromURL(new URL('http://example.com/api/'), context);
const articles = await apiEntryPoint.resource.relatedResources['articles'];
const author = await articles[0].relatedResource['author'];
const name = author.attributes['name'];
```

In the first line, a JSON:API document is constructed from a given URL and a `Context` object
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
The second line of our short example gets the primary entry point resource and then directly awaits the `relatedResources` property to fetch the
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
The third line of our small example uses the `relatedResource` property to obtain the _author_ resource linked in the first _article_.
We do not have to know whether the relationship links to an included resource or whether it needs to be fetched from a server.
We just `await` the `relatedResource` property.

The attributes of the _author_ resource can then simply be obtained using its `attributes` property.

## Guides

- [Implementing the `Context` interface](./guides/context.md)
- [Using Sparse Fieldsets](./guides/sparseFieldsets.md)

## Examples

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
- [Sorting](https://jsonapi.org/format/1.0/#fetching-sorting)
- [Pagination](https://jsonapi.org/format/1.0/#fetching-pagination)
- [Filtering](https://jsonapi.org/format/1.0/#fetching-filtering)

## License

Copyright © 2019 Müller-BBM VibroAkustik Systeme GmbH

Licensed under the [MIT](https://github.com/muellerbbm-vas/grivet/blob/master/LICENSE) license
