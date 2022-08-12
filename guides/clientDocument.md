## Experimental support for constructing a client side document

Grivet has some basic experimental helpers to construct a client side document that can then be POSTed to a server.

For example, you can create a simple document with an included resource like so:

```typescript
let clientDoc = new JsonApi.ClientDocument('article', '1');
clientDoc.setAttribute('title', 'test');
const author: Spec.ResourceIdentifierObject = {
  id: '1',
  type: 'people',
};
clientDoc.setRelationship('author', author);
const resource: Spec.ResourceObject = {
  id: '1',
  type: 'people',
  attributes: {
    name: 'test',
  },
};
clientDoc.includeResource(resource);
```

`clientDoc.data` then contains the raw JSON that can be POSTed to the server using the POST method of your preferred HTTP client library.

See also:

- https://muellerbbm-vas.github.io/grivet/docs/classes/JsonApi.ClientDocument.html
- https://github.com/muellerbbm-vas/grivet/issues/107#issue-543010544
