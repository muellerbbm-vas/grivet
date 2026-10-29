### Query parameters

Further query parameters such as [sorting](https://jsonapi.org/format/1.0/#fetching-sorting),
[filtering](https://jsonapi.org/format/1.0/#fetching-filtering) or [paging](https://jsonapi.org/format/1.0/#fetching-pagination)
can be passed to `Document.fromURL` with the `QueryParams` builder:

```typescript
const params = new JsonApi.QueryParams()
  .sort(['-created', 'title'])
  .filter('author', '5')
  .page('size', 50)
  .include(['author']);
const articles = await JsonApi.Document.fromURL(new URL('http://example.com/articles'), context, undefined, params);
```

This requests `http://example.com/articles?sort=-created,title&filter[author]=5&page[size]=50&include=author` (URL-encoded).
The given URL is not changed. Unlike sparse fields, the parameters only apply to this request and not to related documents.
The filter syntax as well as the supported sort fields and page members depend on the server.
