import { JsonApi, Spec } from '../src/index';
import { SchemaError } from '../src/schemaChecker';

type TestApi = { [path: string]: Spec.JsonApiDocument };

/* tslint:disable:no-unused-expression,await-promise,no-unsafe-any,completed-docs */

class TestContext implements JsonApi.Context {
  constructor(private readonly testApi: TestApi) {}
  async getDocument(url: URL): Promise<Spec.JsonApiDocument> {
    if (!(url.pathname in this.testApi)) {
      return Promise.reject(`The path "${url.pathname}" was not found in testApi`);
    }
    return Promise.resolve(this.testApi[url.pathname]);
  }
}

async function makeDocument(path: string, testApi: TestApi): Promise<JsonApi.Document> {
  return JsonApi.Document.fromURL(new URL(`http://example.com${path}`), new TestContext(testApi));
}

describe('A Custom Error', () => {
  it('has the correct prototype', () => {
    expect(() => {
      throw new JsonApi.CardinalityError();
    }).toThrowError(JsonApi.CardinalityError);
    expect(() => {
      throw new JsonApi.IdMismatchError();
    }).toThrowError(JsonApi.IdMismatchError);
  });
});

describe('The JSON:API top level structure', () => {
  const testApi: TestApi = {
    '/article/null': { data: null },

    '/article/one': {
      data: {
        type: 'articles',
        id: '1',
        attributes: { a: 'x' }
      }
    },

    '/article/many': {
      data: [
        {
          type: 'articles',
          id: '1',
          attributes: { a: 'x' }
        },
        {
          type: 'articles',
          id: '2',
          attributes: { f: 'h' }
        }
      ]
    },

    '/article/resourceIdOnly': {
      data: {
        type: 'articles',
        id: '1'
      }
    },

    '/article/manyResourceIds': {
      data: [
        {
          type: 'articles',
          id: '1'
        },
        {
          type: 'articles',
          id: '2'
        }
      ]
    },

    '/noData': {
      errors: [{ id: '1' }]
    }
  };

  it('may contain "null" data', async () => {
    const documentPath = '/article/null';
    const document = await makeDocument(documentPath, testApi);
    expect(document.hasManyResources).toBeFalsy();
    expect(document.includedResources).toEqual({});
    expect(document.resource).toBeNull();
    expect(() => {
      document.resources;
    }).toThrow(/Document does not contain an array of resources/);
  });

  function testResource(r: JsonApi.Resource, e: Spec.ResourceObject) {
    expect(r.id).toBe(e.id);
    expect(r.type).toBe(e.type);
    expect(r.attributes).toEqual(e.attributes);
    expect(r.links).toEqual({});
    expect(r.metaLinks).toEqual({});
    expect(r.meta).toBeUndefined();
    expect(r.selfLink).toBeUndefined();
    expect(r.relatedDocuments).toEqual({});
    expect(r.relatedResource).toEqual({});
    expect(r.relatedResources).toEqual({});
  }

  it('may contain a singular main resource', async () => {
    const documentPath = '/article/one';
    const document = await makeDocument(documentPath, testApi);
    expect(document.hasManyResources).toBeFalsy();
    expect(document.includedResources).toEqual({});
    expect(document.resource).toBeTruthy();
    testResource(document.resource, testApi[documentPath].data as Spec.ResourceObject);
    expect(() => {
      document.resources;
    }).toThrow(/Document does not contain an array of resources/);
  });

  it('may contain many main resources', async () => {
    const documentPath = '/article/many';
    const document = await makeDocument(documentPath, testApi);
    expect(document.hasManyResources).toBeTruthy();
    expect(document.includedResources).toEqual({});
    expect(document.resources.length).toBe(2);
    for (const i in document.resources) {
      testResource(document.resources[i], testApi[documentPath].data[i]);
    }
    expect(() => {
      document.resource;
    }).toThrow(/Document contains an array of resources/);
  });

  function testResourceIdentifier(r: JsonApi.Resource, e: Spec.ResourceIdentifierObject) {
    expect(r.id).toBe(e.id);
    expect(r.type).toBe(e.type);
    expect(r.attributes).toBeUndefined();
    expect(r.links).toEqual({});
    expect(r.metaLinks).toEqual({});
    expect(r.meta).toBeUndefined();
    expect(r.selfLink).toBeUndefined();
    expect(r.relatedDocuments).toEqual({});
    expect(r.relatedResource).toEqual({});
    expect(r.relatedResources).toEqual({});
  }

  it('may contain a singular main resource identifier', async () => {
    const documentPath = '/article/resourceIdOnly';
    const document = await makeDocument(documentPath, testApi);
    expect(document.resource).toBeTruthy();
    testResourceIdentifier(document.resource, testApi[documentPath].data as Spec.ResourceObject);
  });

  it('may contain many main resource identifiers', async () => {
    const documentPath = '/article/manyResourceIds';
    const document = await makeDocument(documentPath, testApi);
    expect(document.hasManyResources).toBeTruthy();
    expect(document.resources.length).toBe(2);
    for (const i in document.resources) {
      testResourceIdentifier(document.resources[i], testApi[documentPath].data[i]);
    }
    expect(() => {
      document.resource;
    }).toThrow(/Document contains an array of resources/);
  });

  it('does not have to contain a data member', async () => {
    const document = await makeDocument('/noData', testApi);
    expect(document.resource).toBeUndefined();
  });
});

describe('A JSON:API resource object', () => {
  const testApi: TestApi = {
    '/articles/1': {
      data: {
        id: '1',
        type: 'articles',
        attributes: {
          title: 'dummy',
          nested: { level2: [11, 22, 33], x: 'y' }
        },
        relationships: {
          author: {
            links: {
              self: 'http://example.com/articles/1/relationships/author',
              related: 'http://example.com/articles/1/author'
            },
            data: { type: 'people', id: '9' }
          },
          coauthor: { meta: null }
        },
        links: {
          self: 'http://example.com/articles/1',
          related: 'http://example.com/authors/1',
          test: { href: 'http://example.com/test', meta: { a: 4 } }
        },
        meta: {
          xyz: { abc: 123 },
          links: {
            a: 'http://example.com/a',
            b: 'http://example.com/b'
          }
        }
      }
    },
    '/articles/2': {
      data: {
        id: '2',
        type: 'articles',
        meta: {
          xyz: { abc: 123 }
        }
      }
    }
  };

  const documentPath = '/articles/1';

  it('may contain attributes', async () => {
    const document = await makeDocument(documentPath, testApi);
    const resource = document.resource;
    expect(resource.attributes).toBeDefined();
    expect(resource.attributes).toEqual(testApi[documentPath].data['attributes']);
  });

  it('may contain links', async () => {
    const document = await makeDocument(documentPath, testApi);
    const resource = document.resource;
    expect(resource.links).toBeDefined();
    expect(Object.keys(resource.links).length).toBe(3);
    expect(resource.links['related'].url.href).toEqual(testApi[documentPath].data['links']['related']);
    expect(resource.links['test'].url.href).toEqual(testApi[documentPath].data['links']['test']['href']);
    expect(resource.links['test'].meta).toEqual(testApi[documentPath].data['links']['test']['meta']);
  });

  it('may contain meta links', async () => {
    const document = await makeDocument(documentPath, testApi);
    const resource = document.resource;
    expect(resource.metaLinks).toBeDefined();
    expect(Object.keys(resource.metaLinks).length).toBe(2);
    expect(resource.metaLinks['a'].url.href).toEqual(testApi[documentPath].data['meta']['links']['a']);
    expect(resource.metaLinks['b'].url.href).toEqual(testApi[documentPath].data['meta']['links']['b']);
  });

  it('may contain meta data', async () => {
    const document = await makeDocument(documentPath, testApi);
    const resource = document.resource;
    expect(resource.meta).toBeDefined();
    expect(resource.meta).toEqual(testApi[documentPath].data['meta']);
  });

  it('may contain relationships', async () => {
    const document = await makeDocument(documentPath, testApi);
    const resource = document.resource;
    expect(resource.relationships).toBeDefined();
    expect(Object.keys(resource.relationships).length).toBe(2);
    expect(resource.relationships['author'].empty).toBeFalsy();
    expect(resource.relationships['coauthor'].empty).toBeTruthy();
  });

  it('may contain a self link', async () => {
    const document = await makeDocument(documentPath, testApi);
    const resource = document.resource;
    expect(resource.selfLink).toBeDefined();
    expect(resource.selfLink.url.href).toEqual(testApi[documentPath].data['links']['self']);
  });

  it('may contain meta data without links', async () => {
    const document = await makeDocument('/articles/2', testApi);
    const resource = document.resource;
    expect(resource.metaLinks).toBeDefined();
    expect(resource.metaLinks).toEqual({});
  });
});

describe('A JSON:API compound document', () => {
  const testApi: TestApi = {
    '/articles/1': {
      data: {
        type: 'articles',
        id: '1',
        attributes: {
          title: 'JSON:API'
        },
        links: {
          self: 'http://example.com/articles/1'
        },
        relationships: {
          author: {
            links: {
              self: 'http://example.com/articles/1/relationships/author',
              related: 'http://example.com/articles/1/author'
            },
            data: { type: 'people', id: '9' }
          },
          comments: {
            links: {
              self: 'http://example.com/articles/1/relationships/comments',
              related: 'http://example.com/articles/1/comments'
            },
            data: [{ type: 'comments', id: '5' }, { type: 'comments', id: '12' }]
          },
          test: {
            data: { id: '11', type: 'tests' }
          },
          tests: {
            data: [{ id: '11', type: 'tests' }, { id: '12', type: 'tests' }]
          },
          nothingList: {
            data: []
          },
          nothingDetail: {
            data: null
          }
        }
      },
      included: [
        {
          type: 'people',
          id: '9',
          attributes: {
            'first-name': 'test',
            'last-name': 'test'
          },
          relationships: {
            likes: { data: [{ type: 'comments', id: '5' }, { type: 'comments', id: '12' }] },
            doc: {
              data: { type: 'articles', id: '1' }
            }
          },
          links: {
            self: 'http://example.com/people/9'
          }
        },
        {
          type: 'comments',
          id: '5',
          attributes: {
            body: 'xyz'
          },
          relationships: {
            author: {
              data: { type: 'people', id: '2' }
            }
          },
          links: {
            self: 'http://example.com/comments/5'
          }
        },
        {
          type: 'comments',
          id: '12',
          attributes: {
            body: 'dummy'
          },
          relationships: {
            author: {
              data: { type: 'people', id: '9' }
            }
          },
          links: {
            self: 'http://example.com/comments/12'
          }
        }
      ]
    },
    '/articles/broken': {
      data: {
        type: 'articles',
        id: '2',
        relationships: {
          author: {
            meta: { x: 'a' }
          }
        }
      }
    }
  };

  const documentPath = '/articles/1';

  it('contains included resources as map with "type" and "id" keys', async () => {
    const document = await makeDocument(documentPath, testApi);
    const article = document.resource;
    expect(document.includedResources).toBeDefined();
    expect(Object.keys(document.includedResources).length).toBe(2); // number of included resource types
    expect(Object.keys(document.includedResources['comments']).length).toBe(2); // number of included comment IDs
    expect(Object.keys(document.includedResources['people']).length).toBe(1); // number of included people IDs
    expect(document.includedResources['people']['9'].attributes).toBeTruthy();
  });

  it('resolves to-one relationships using the included resources', async () => {
    const document = await makeDocument(documentPath, testApi);
    const article = document.resource;
    const author = await article.relatedResource['author'];
    expect(article.relatedResource).toBeDefined();
    expect(author).toBeDefined();
    expect(author).toBeInstanceOf(JsonApi.Resource);
    expect(author.type).toBe('people');
    expect(author.id).toBe('9');
    expect(author.attributes).toBeTruthy();
  });

  it('resolves to-many relationships using the included resources', async () => {
    const document = await makeDocument(documentPath, testApi);
    const article = document.resource;
    const comments = await article.relatedResources['comments'];
    expect(article.relatedResources).toBeDefined();
    expect(comments).toBeDefined();
    expect(comments.length).toBe(2);
    expect(comments[0]).toBeInstanceOf(JsonApi.Resource);
    expect(comments[0].type).toBe('comments');
    expect(comments[0].id).toBe('5');
    expect(comments[0].attributes).toBeTruthy();
  });

  it('complains when accessing related resources with the wrong cardinality', async () => {
    const document = await makeDocument(documentPath, testApi);
    const article = document.resource;
    await expect(article.relatedResource['comments']).rejects.toThrowError(JsonApi.CardinalityError);
    await expect(article.relatedResources['author']).rejects.toThrowError(JsonApi.CardinalityError);
  });

  it('complains about relationships with neither "data" nor "links" members', async () => {
    const brokenArticle = (await makeDocument('/articles/broken', testApi)).resource;
    await expect(brokenArticle.relatedResource['author']).rejects.toThrowError(SchemaError);
    await expect(brokenArticle.relatedResources['author']).rejects.toThrowError(SchemaError);
  });

  it('can link from one included resource to another', async () => {
    const document = await makeDocument(documentPath, testApi);
    const article = document.resource;
    const commentAuthor = await (await article.relatedResources['comments'])[1].relatedResource['author'];
    expect(commentAuthor).toBeDefined();
    expect(commentAuthor.id).toBe('9');
    expect(commentAuthor.attributes['first-name']).toBe('test');
  });

  it('can link from one included resource to a collection of others', async () => {
    const document = await makeDocument(documentPath, testApi);
    const article = document.resource;
    const commentAuthor = await (await article.relatedResources['comments'])[1].relatedResource['author'];
    const likes = await commentAuthor.relatedResources['likes'];
    expect(likes).toBeDefined();
    expect(likes.length).toBe(2);
    expect(likes[0].attributes['body']).toBeTruthy();
  });

  it('can link from an included resource to the main resource', async () => {
    const document = await makeDocument(documentPath, testApi);
    const article = document.resource;
    const commentAuthor = await (await article.relatedResources['comments'])[1].relatedResource['author'];
    expect((await commentAuthor.relatedResource['doc']).attributes['title']).toContain('JSON:API');
  });

  it('complains about non-existent type/id pairs', async () => {
    const document = await makeDocument(documentPath, testApi);
    const article = document.resource;
    const firstCommentAuthorRelationship = await (await article.relatedResources['comments'])[0].relationships[
      'author'
    ];
    expect(firstCommentAuthorRelationship.data['id']).toBe('2');
    expect(await firstCommentAuthorRelationship.relatedDocument()).toBeUndefined();
    const firstCommentAuthor = await firstCommentAuthorRelationship.resource();
    expect(firstCommentAuthor.id).toBe('2');
    expect(() => {
      firstCommentAuthor.attributes['first-name'];
    }).toThrow(/not found/);
    await expect(firstCommentAuthorRelationship.resources()).rejects.toThrowError(JsonApi.CardinalityError);
  });

  it('complains about cardinality when using the wrong methods', async () => {
    const document = await makeDocument(documentPath, testApi);
    await expect(document.resource.relationships['test'].resourcesFromRelatedLink()).rejects.toThrowError(
      JsonApi.CardinalityError
    );
    await expect(document.resource.relationships['tests'].resourceFromRelatedLink()).rejects.toThrowError(
      JsonApi.CardinalityError
    );
  });

  it('may contain empty or null resource linkage', async () => {
    const document = await makeDocument(documentPath, testApi);
    const article = document.resource;
    const nothingList = await article.relatedResources['nothingList'];
    expect(nothingList).toEqual([]);
    const nothingDetail = await article.relatedResource['nothingDetail'];
    expect(nothingDetail).toEqual(null);
  });
});

describe('A JSON:API compound document with multiple main resources', () => {
  const testApi: TestApi = {
    '/articles': {
      data: [
        {
          type: 'articles',
          id: '1',
          attributes: {
            title: 'JSON:API'
          },
          relationships: {
            author: {
              data: { type: 'people', id: '9' }
            }
          }
        },
        {
          type: 'articles',
          id: '2',
          attributes: {
            title: 'dummy'
          },
          relationships: {
            author: {
              data: { type: 'people', id: '9' }
            }
          }
        }
      ],
      included: [
        {
          type: 'people',
          id: '9',
          attributes: {
            'first-name': 'test',
            'last-name': 'test'
          },
          relationships: {
            doc: {
              data: [{ type: 'articles', id: '1' }, { type: 'articles', id: '2' }]
            }
          }
        }
      ]
    }
  };

  const documentPath = '/articles';

  it('can link from an included resource to one main resource', async () => {
    const document = await makeDocument(documentPath, testApi);
    const article1 = document.resources[0];
    const relatedDocs = await (await article1.relatedResource['author']).relatedResources['doc'];
    expect(relatedDocs.length).toBe(2);
    expect(relatedDocs[1].attributes['title']).toContain('dummy');
  });
});

describe('A non-compliant JSON:API compound document with duplicate resources', () => {
  const testApi: TestApi = {
    '/articles': {
      data: [
        {
          type: 'articles',
          id: '1',
          relationships: {
            other: {
              data: { type: 'articles', id: '2' }
            }
          }
        },
        {
          type: 'articles',
          id: '2'
        }
      ],
      included: [
        {
          type: 'articles',
          id: '2'
        }
      ]
    }
  };

  const documentPath = '/articles';

  it('complains when a type/id pair is found more than once', async () => {
    const document = await makeDocument(documentPath, testApi);
    const article1 = document.resources[0];
    const other = await article1.relatedResource['other'];
    expect(() => {
      other.attributes;
    }).toThrow(/found more than once/);
  });
});

describe('A JSON:API document with no included resources', () => {
  const testApi: TestApi = {
    '/articles': {
      data: [
        {
          type: 'articles',
          id: '1',
          relationships: {
            other: {
              data: { type: 'articles', id: '2' }
            },
            test: {
              data: { type: 'tests', id: '11' },
              links: { related: 'http://example.com/tests/11' }
            },
            tests: {
              data: [{ type: 'tests', id: '11' }, { type: 'tests', id: '12' }],
              links: { related: 'http://example.com/tests' }
            }
          }
        }
      ]
    }
  };

  const documentPath = '/articles';

  it('complains when trying to access a related resource', async () => {
    const document = await makeDocument(documentPath, testApi);
    const article1 = document.resources[0];
    const other = await article1.relatedResource['other'];
    expect(() => {
      other.attributes;
    }).toThrow(/not found in document/);
    const test = await article1.relationships['test'].resourceFromRelatedLink();
    expect(() => {
      test.attributes;
    }).toThrow(/not found in document/);
    const tests = await article1.relationships['tests'].resourcesFromRelatedLink();
    expect(() => {
      tests[0].attributes;
    }).toThrow(/not found in document/);
  });
});

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
          },
          comments: {
            data: null,
            links: {
              related: 'http://example.com/comments'
            }
          },
          review: {
            data: null,
            links: {
              related: 'http://example.com/review/7'
            }
          },
          test: {
            data: { type: 'tests', id: '11' },
            links: { related: 'http://example.com/tests/11' }
          },
          tests: {
            data: [{ type: 'tests', id: '11' }, { type: 'tests', id: '12' }],
            links: { related: 'http://example.com/tests' }
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
    },
    '/comments': {
      data: [
        {
          type: 'comments',
          id: '1'
        }
      ]
    },
    '/review/7': {
      data: {
        type: 'reviews',
        id: '7'
      }
    },
    '/tests/11': {
      data: {
        type: 'tests',
        id: '11',
        attributes: {
          a: 1
        }
      }
    },
    '/tests': {
      data: [
        {
          type: 'tests',
          id: '11',
          attributes: {
            a: 1
          }
        },
        {
          type: 'tests',
          id: '12',
          attributes: {
            a: 2
          }
        }
      ]
    }
  };

  const context = new TestContext(testApi);

  it('is fetched when the relationship is accessed (single)', async () => {
    const articleDoc = await JsonApi.Document.fromURL(new URL('http://example.com/articles/1'), context);
    const authorDoc = await JsonApi.Document.fromURL(new URL('http://example.com/people/9'), context);
    const article = articleDoc.resource;
    const author = authorDoc.resource;
    const relatedAuthor = await article.relatedResource['author'];
    expect(relatedAuthor).toEqual(author);
  });

  it('is fetched when the relationship is accessed (multiple)', async () => {
    const articleDoc = await JsonApi.Document.fromURL(new URL('http://example.com/articles/1'), context);
    const commentsDoc = await JsonApi.Document.fromURL(new URL('http://example.com/comments'), context);
    const article = articleDoc.resource;
    const comments = commentsDoc.resources;
    const relatedComments = await article.relatedResources['comments'];
    expect(relatedComments).toEqual(comments);
  });

  it('ignores null data in relationships', async () => {
    const articleDoc = await JsonApi.Document.fromURL(new URL('http://example.com/articles/1'), context);
    const review = await articleDoc.resource.relatedResource['review'];
    expect(review.id).toEqual('7');
  });

  it('can be loaded from a related link instead of linkage', async () => {
    const articleDoc = await JsonApi.Document.fromURL(new URL('http://example.com/articles/1'), context);
    const testResource = await articleDoc.resource.relationships['test'].resourceFromRelatedLink();
    expect(testResource.id).toEqual('11');
    expect(testResource.attributes).toEqual({ a: 1 });
    const testResources = await articleDoc.resource.relationships['tests'].resourcesFromRelatedLink();
    expect(testResources[1].id).toEqual('12');
    expect(testResources[1].attributes).toEqual({ a: 2 });
  });
});

class DummyContext implements JsonApi.Context {
  async getDocument(url: URL): Promise<Spec.JsonApiDocument> {
    throw new Error('Method not implemented.');
  }
}

describe('Construction of resources from existing JSON objects', () => {
  const rawDoc: Spec.JsonApiDocument = {
    data: {
      id: '1',
      type: 'articles',
      attributes: { title: 'dummy' }
    }
  };
  const doc = new JsonApi.Document(rawDoc, new DummyContext());

  const rawResource: Spec.ResourceObject = {
    id: '11',
    type: 'people',
    attributes: { name: 'xxx' }
  };

  it('is possible for documents', () => {
    expect(doc.resource.attributes['title']).toContain('dummy');
  });

  it('is possible for main resources', () => {
    const res = new JsonApi.PrimaryResource(rawResource, doc, 'articles', new DummyContext());
    expect(res.attributes['name']).toContain('xxx');
  });

  it('fails when there is an id mismatch', () => {
    expect(() => {
      const res = new JsonApi.PrimaryResource(rawResource, doc, 'articles', new DummyContext(), '123');
    }).toThrow(/ID in rawData does not match given ID/);
  });
});

describe('A link containing path name only ', () => {
  const testApi: TestApi = {
    '/articles/1': {
      data: {
        type: 'articles',
        id: '1',
        relationships: {
          author: {
            links: {
              related: '/people/9'
            }
          },
          author2: {
            links: {
              related: {
                href: '/people/9'
              }
            }
          }
        },
        links: {
          self: '/articles/1'
        },
        meta: {
          links: {
            dummy: '/dummy/1'
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

  it('works when fetching related resources', async () => {
    const article = (await makeDocument('/articles/1', testApi)).resource;
    const author = (await makeDocument('/people/9', testApi)).resource;
    const relatedAuthor = await article.relatedResource['author'];
    expect(relatedAuthor).toEqual(author);
    const relatedAuthor2 = await article.relatedResource['author2'];
    expect(relatedAuthor2).toEqual(author);
  });

  it('works inside the `links` member', async () => {
    const article = (await makeDocument('/articles/1', testApi)).resource;
    expect(article.links['self'].url.href).toEqual('http://example.com/articles/1');
  });

  it('works inside the `meta.links` member', async () => {
    const article = (await makeDocument('/articles/1', testApi)).resource;
    expect(article.metaLinks['dummy'].url.href).toEqual('http://example.com/dummy/1');
  });
});

describe('Runtime SchemaErrors', () => {
  const malformedDocument = {
    dat: {
      id: '1',
      type: 't'
    }
  };
  const malformedMainResource = {
    data: {
      data: { id: '1', type: 't' }
    }
  };

  it('are thrown for malformed documents', () => {
    expect(() => {
      const doc = new JsonApi.Document((malformedDocument as unknown) as Spec.JsonApiDocument, new TestContext({}));
    }).toThrow(/must contain at least one of/);
  });
  it('are thrown for malformed main resources', () => {
    expect(() => {
      const doc = new JsonApi.Document(malformedMainResource as Spec.JsonApiDocument, new TestContext({}));
    }).toThrow(/must contain at least the following/);
  });
});

describe('Sparse fieldsets', () => {
  it('can be specified when constructing a document', async () => {
    const context = {
      getDocument: jest.fn(url => Promise.resolve({ data: null }))
    };
    const sparseFields = {
      type1: ['f11', 'f12', 'f13'],
      type2: ['f21', 'f22', 'f23'],
      type3: ['f31', 'f32', 'f33']
    };
    const doc = await JsonApi.Document.fromURL(new URL('http://example.com'), context, sparseFields);
    expect(context.getDocument.mock.calls.length).toBe(1);
    expect(context.getDocument.mock.calls[0].length).toBe(1);
    const calledURL = context.getDocument.mock.calls[0][0] as URL;
    expect(calledURL.hostname).toBe('example.com');
    expect(calledURL.searchParams.get('fields[type1]')).toBe('f11,f12,f13');
    expect(calledURL.searchParams.get('fields[type2]')).toBe('f21,f22,f23');
    expect(calledURL.searchParams.get('fields[type3]')).toBe('f31,f32,f33');
  });

  it('are used when fetching a related document', async () => {
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
    const context = {
      getDocument: jest.fn((url: URL) => Promise.resolve(testApi[url.pathname]))
    };
    const sparseFields = {
      type1: ['f11', 'f12', 'f13'],
      type2: ['f21', 'f22', 'f23'],
      type3: ['f31', 'f32', 'f33']
    };
    const doc = await JsonApi.Document.fromURL(new URL('http://example.com/articles/1'), context, sparseFields);
    const author = doc.resource.relatedDocuments['author'];
    expect(context.getDocument.mock.calls.length).toBe(2);
    const calledURL = context.getDocument.mock.calls[1][0] as URL;
    expect(calledURL.hostname).toBe('example.com');
    expect(calledURL.searchParams.get('fields[type1]')).toBe('f11,f12,f13');
    expect(calledURL.searchParams.get('fields[type2]')).toBe('f21,f22,f23');
    expect(calledURL.searchParams.get('fields[type3]')).toBe('f31,f32,f33');
  });
});
