### Specifying sparse fieldsets

[Sparse fieldsets](https://jsonapi.org/format/1.0/#fetching-sparse-fieldsets) enable a client to request only certain fields (attributes or relationships) to reduce data transfer from server to client.
When constructing a document, you can optionally provide a mapping from resource type to a list of fields that you are interested in for this type:

```typescript
const sparseFields = {
  articles: ['author'],
  people: ['first-name', 'last-name']
};

const articleDoc = await JsonApi.Document.fromURL(new URL('http://example.com/articles/1'), context, sparseFields);
const article = articleDoc.resource;
const author = await article.relatedResource['author'];
```

If the server also implements sparse fieldsets, the `article` resource will contain only the _author_ relationship (and no attributes) and the _author_ resource will contain only the _first-name_ and _last-name_ attributes (and no relationships).
