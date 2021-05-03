## Implementing the `Context` interface

A method to fetch resources that are not included in a document has to be provided by the user of Grivet by implementing the `Context` interface. This makes the library more easily adaptable to various frameworks and different HTTP client libraries. The `Context` interface looks like this:

```typescript
export interface Context {
  getDocument(url: URL): Promise<Spec.JsonApiDocument>;
}
```

Basically, a `Context` implementation just has to provide a `getDocument` method that returns a `Promise` of a `JsonApiDocument` when given a `URL`. Just one thing to keep in mind: As per the [specification](https://jsonapi.org/format/1.0/#content-negotiation-clients), a request to a JSON:API server has to include the `Accept` header with the value `application/vnd.api+json`.

### Example Angular http context

An implementation based on the Angular http client could look like this:

```typescript
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { JsonApi, Spec } from '@muellerbbm-vas/grivet';

export class AngularHttpContext implements JsonApi.Context {
  constructor(private readonly http: HttpClient, public readonly headers: HttpHeaders) {
    this.headers = headers.set('Accept', 'application/vnd.api+json');
  }

  async getDocument(url: URL): Promise<Spec.JsonApiDocument> {
    return this.http.get<Spec.JsonApiDocument>(url.href, { headers: this.headers }).toPromise();
  }
}
```

In the above example, an Angular http client is used with its `Observable` converted to a `Promise`. The `Accept` header is set in the constructor so that all subsequent requests use this value.

### Example Node http context using axios

```typescript
import { JsonApi, Spec } from '@muellerbbm-vas/grivet';
import axios, { AxiosRequestConfig, AxiosInstance } from 'Axios';

export class NodeHttpContext implements JsonApi.Context {
  headers: { [index: string]: string } = {
    accept: 'application/vnd.api+json'
  };
  axios: AxiosInstance;

  constructor() {
    this.axios = axios.create();
  }

  async getDocument(url: URL): Promise<Spec.JsonApiDocument> {
    const reqConfig: AxiosRequestConfig = {
      url: url.href,
      headers: this.headers
    };

    const res = await this.axios.request(reqConfig);
    return res.data;
  }
}
```

### Example context for testing

A `Context` implementation does not have to perform any HTTP requests. It can also just return responses from any other source, such as pre-defined responses for testing purposes. The following `Context` takes a `TestApi` object and just returns a resolved `Promise` filled with data taken from the `TestApi` object keyed by `pathname`:

```typescript
import { JsonApi, Spec } from '@muellerbbm-vas/grivet';

type TestApi = { [path: string]: Spec.JsonApiDocument };

class TestContext implements JsonApi.Context {
  constructor(private readonly testApi: TestApi) {}
  getDocument(url: URL): Promise<Spec.JsonApiDocument> {
    if (!(url.pathname in this.testApi)) {
      return Promise.reject(`The path "${url.pathname}" was not found in testApi`);
    }
    return Promise.resolve(this.testApi[url.pathname]);
  }
}
```

You can then define a test API and use it in your unit tests:

```typescript
describe('A JSON:API related document', () => {
  const testApi: TestApi = {
    '/articles/1': {
      data: {
        type: 'articles',
        id: '1',
        relationships: {
          author: {
            links: {
              related: 'http://example.com/people/9'
            }
          }
        }
      }
    },
    '/people/9': {
      data: {
        type: 'people',
        id: '9',
        attributes: {
          'first-name': 'test',
          'last-name': 'test'
        }
      }
    }
  };

  const context = new TestContext(testApi);

  it('is fetched when the relationship is accessed', async () => {
    const articleDoc = await JsonApi.Document.fromURL(new URL('http://example.com/articles/1'), context);
    const authorDoc = await JsonApi.Document.fromURL(new URL('http://example.com/people/9'), context);
    const article = articleDoc.resource;
    const author = authorDoc.resource;
    const relatedAuthor = await article.relatedResource['author'];
    expect(relatedAuthor).toEqual(author);
  });
});
```
