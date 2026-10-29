### Paging

A server may split a collection into [pages](https://jsonapi.org/format/1.0/#fetching-pagination) and link them with the
top level links `first`, `last`, `prev` and `next`. A `Document` gives access to these pages:

```typescript
const firstPage = await JsonApi.Document.fromURL(new URL('http://example.com/articles'), context);
const secondPage = await firstPage.nextPage(); // undefined on the last page
const all = await firstPage.allResources(); // the resources of this and all following pages
```

`prevPage()`, `firstPage()` and `lastPage()` work like `nextPage()`, and `allPages()` returns the documents of all pages.
The sparse fields of a document also apply to the related documents of its pages.

#### Related collections

`Relationship.resources()` and the `relatedResources` accessor follow the `next` links of a paged related document and return
the resources of all pages. The options of `resources()` change this:

```typescript
const comments = article.relationships['comments'];
const firstPageOnly = await comments.resources({ followPaging: false });
const sorted = await comments.resources({ sort: ['-created'], page: { size: 50 } });
const unpaged = await comments.resources({ allowPaging: false }); // throws a PagingNotAllowedError if paged
```

`sort` and `page` request [sorting](https://jsonapi.org/format/1.0/#fetching-sorting) and a page for the first request. They
always use the `related` link, since resource linkage keeps the server's order and has no pages. A non-empty `page` replaces
the paging parameters of the link (e.g. a cursor), with `replacePage: false` it only overrides the given members. Other
query parameters of the link are kept. `sparseFields` replaces the sparse fields of the referring document for the given
types. Which sort fields and page members are supported depends on the server.

`Relationship.relatedDocument()` takes the same `sparseFields`, `sort`, `page` and `replacePage` options, but only fetches the
requested page.
