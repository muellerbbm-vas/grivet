import { JsonApi, Spec } from '../src/index';
import { SchemaError } from '../src/schemaChecker';

/* tslint:disable:no-unused-expression,await-promise,no-unsafe-any,completed-docs */

type Responder = (url: URL) => Spec.JsonApiDocument;

/** Answers by pathname and records the requested URLs */
class RecordingContext implements JsonApi.Context {
  readonly requested: URL[] = [];
  constructor(private readonly responders: { [path: string]: Responder }) {}
  async getDocument(url: URL): Promise<Spec.JsonApiDocument> {
    this.requested.push(new URL(url.href));
    const responder = this.responders[url.pathname];
    if (!responder) {
      return Promise.reject(`The path "${url.pathname}" was not found`);
    }
    return Promise.resolve(responder(url));
  }
}

const base = 'http://example.com';

function comment(id: string): Spec.ResourceObject {
  return { type: 'comments', id, attributes: { text: `comment ${id}` } };
}

/** A collection of comments 1..6 in pages of two, the page number is `page[number]` */
function pagedComments(url: URL): Spec.JsonApiDocument {
  const number = Number(url.searchParams.get('page[number]') || '1');
  const ids = [1, 2].map((offset) => String((number - 1) * 2 + offset));
  const pageLink = (n: number) => `${base}/comments?page[number]=${n}`;
  return {
    data: ids.map(comment),
    links: {
      first: pageLink(1),
      last: pageLink(3),
      prev: number > 1 ? pageLink(number - 1) : null,
      next: number < 3 ? pageLink(number + 1) : null,
    },
  };
}

function article(commentsRelationship: Spec.RelationshipObject): Spec.JsonApiDocument {
  return { data: { type: 'articles', id: '1', relationships: { comments: commentsRelationship } } };
}

async function articleResource(
  commentsRelationship: Spec.RelationshipObject,
  comments: Responder = pagedComments,
  sparseFields?: JsonApi.SparseFields,
) {
  const context = new RecordingContext({ '/articles/1': () => article(commentsRelationship), '/comments': comments });
  const doc = await JsonApi.Document.fromURL(new URL(`${base}/articles/1`), context, sparseFields);
  return { context, resource: doc.resource!, relationship: doc.resource!.relationships['comments'] };
}

const ids = (resources: JsonApi.Resource[]) => resources.map((r) => r.id);

describe('QueryParams', () => {
  it('builds the standard JSON:API members', () => {
    const params = new JsonApi.QueryParams()
      .include(['author'])
      .fields('articles', ['title', 'body'])
      .sort(['-created', 'title'])
      .filter('author.name', 'Dan')
      .page('size', 10)
      .custom('debug', true);
    expect(params.entries()).toEqual([
      ['include', 'author'],
      ['fields[articles]', 'title,body'],
      ['sort', '-created,title'],
      ['filter[author.name]', 'Dan'],
      ['page[size]', '10'],
      ['debug', 'true'],
    ]);
  });

  it('merges lists without duplicates or replaces them', () => {
    const params = new JsonApi.QueryParams().sort(['a', 'b']).sort(['b', 'c']).include(['x']);
    expect(params.entries()).toEqual([
      ['sort', 'a,b,c'],
      ['include', 'x'],
    ]);
    params.sort(['d'], true).include([''], true).fields('t', [], true);
    expect(params.entries()).toEqual([
      ['sort', 'd'],
      ['include', ''],
    ]);
  });

  it('copies and merges without changing the original', () => {
    const params = new JsonApi.QueryParams([['a', 1]]);
    const merged = params.merge(new JsonApi.QueryParams().filter('b', 'x'));
    const copy = params.copy().page('size', 2);
    expect(params.entries()).toEqual([['a', '1']]);
    expect(merged.entries()).toEqual([
      ['a', '1'],
      ['filter[b]', 'x'],
    ]);
    expect(copy.entries()).toEqual([
      ['a', '1'],
      ['page[size]', '2'],
    ]);
    expect(new JsonApi.QueryParams().isEmpty).toBe(true);
  });

  it('appends to a copy of a URL', () => {
    const url = new URL(`${base}/articles?x=1`);
    const result = new JsonApi.QueryParams().sort(['title']).applyTo(url);
    expect(url.href).toBe(`${base}/articles?x=1`);
    expect(result.searchParams.get('x')).toBe('1');
    expect(result.searchParams.get('sort')).toBe('title');
  });
});

describe('Document.fromURL', () => {
  it('sends sparse fields and query parameters without changing the given URL', async () => {
    const context = new RecordingContext({ '/comments': pagedComments });
    const url = new URL(`${base}/comments`);
    const params = new JsonApi.QueryParams().sort(['-created']).filter('author', '5').page('number', 2);
    const doc = await JsonApi.Document.fromURL(url, context, { comments: ['text'] }, params);
    expect(url.href).toBe(`${base}/comments`);
    const requested = context.requested[0];
    expect(requested.searchParams.get('fields[comments]')).toBe('text');
    expect(requested.searchParams.get('sort')).toBe('-created');
    expect(requested.searchParams.get('filter[author]')).toBe('5');
    expect(requested.searchParams.get('page[number]')).toBe('2');
    expect(doc.url!.href).toBe(requested.href);
    expect(ids(doc.resources)).toEqual(['3', '4']);
  });
});

describe('A paged document', () => {
  it('provides its links without null values', async () => {
    const context = new RecordingContext({ '/comments': pagedComments });
    const doc = await JsonApi.Document.fromURL(new URL(`${base}/comments`), context);
    expect(Object.keys(doc.links).sort()).toEqual(['first', 'last', 'next']);
    expect(await doc.prevPage()).toBeUndefined();
  });

  it('resolves relative links against the document URL', async () => {
    const context = new RecordingContext({
      '/comments': (url) =>
        url.searchParams.get('page[number]') === '2'
          ? { data: [comment('2')] }
          : { data: [comment('1')], links: { next: '/comments?page[number]=2' } },
    });
    const doc = await JsonApi.Document.fromURL(new URL(`${base}/comments`), context);
    const next = await doc.nextPage();
    expect(next!.url!.href).toBe(`${base}/comments?page[number]=2`);
    expect(ids(next!.resources)).toEqual(['2']);
  });

  it('navigates between pages', async () => {
    const context = new RecordingContext({ '/comments': pagedComments });
    const doc = await JsonApi.Document.fromURL(new URL(`${base}/comments`), context, { comments: ['text'] });
    const second = await doc.nextPage();
    expect(ids(second!.resources)).toEqual(['3', '4']);
    expect(second!.sparseFields).toEqual({ comments: ['text'] });
    expect(ids((await second!.prevPage())!.resources)).toEqual(['1', '2']);
    expect(ids((await second!.lastPage())!.resources)).toEqual(['5', '6']);
    expect(ids((await second!.firstPage())!.resources)).toEqual(['1', '2']);
    expect(await doc.nextPage()).toBe(second);
  });

  it('collects all pages and resources', async () => {
    const context = new RecordingContext({ '/comments': pagedComments });
    const doc = await JsonApi.Document.fromURL(new URL(`${base}/comments`), context);
    expect((await doc.allPages()).length).toBe(3);
    expect(ids(await doc.allResources())).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(context.requested.length).toBe(3);
  });
});

describe('A to-many relationship with a paged related document', () => {
  const related = { links: { related: `${base}/comments` } };

  it('follows the next links by default', async () => {
    const { context, relationship } = await articleResource(related);
    expect(ids(await relationship.resources())).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(context.requested.length).toBe(4);
  });

  it('follows the next links through the relatedResources accessor', async () => {
    const { resource } = await articleResource(related);
    expect(ids(await resource.relatedResources['comments'])).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('returns only the requested page with followPaging: false', async () => {
    const { relationship } = await articleResource(related);
    expect(ids(await relationship.resources({ followPaging: false }))).toEqual(['1', '2']);
    expect(ids(await relationship.resources({ followPaging: false, page: { number: 3 } }))).toEqual(['5', '6']);
  });

  it('rejects a paged response with allowPaging: false', async () => {
    const { relationship } = await articleResource(related);
    await expect(relationship.resources({ allowPaging: false })).rejects.toThrowError(JsonApi.PagingNotAllowedError);
    await expect(relationship.resourcesFromRelatedLink({ allowPaging: false })).rejects.toThrowError(
      JsonApi.PagingNotAllowedError,
    );
    await expect(relationship.resources({ allowPaging: false, page: { number: 3 } })).resolves.toHaveLength(2);
  });

  it('rejects contradicting paging options', async () => {
    const { relationship } = await articleResource(related);
    await expect(relationship.resources({ allowPaging: false, followPaging: true })).rejects.toThrowError(TypeError);
  });

  it('memoizes only requests without options', async () => {
    const { context, relationship } = await articleResource(related);
    const first = await relationship.relatedDocument();
    expect(await relationship.relatedDocument()).toBe(first);
    await relationship.relatedDocument({ sort: ['text'] });
    await relationship.relatedDocument({ sort: ['text'] });
    expect(context.requested.length).toBe(4);
    expect(await relationship.resources()).toBe(await relationship.resources());
  });
});

describe('Requesting a related document with options', () => {
  it('sends sort and page, replacing the paging of the link and keeping its other parameters', async () => {
    const { context, relationship } = await articleResource({
      links: { related: `${base}/comments?filter[author]=5&sort=id&page[cursor]=abc&page[size]=2` },
    });
    await relationship.relatedDocument({ sort: ['-created'], page: { number: 2 } });
    const requested = context.requested[1];
    expect(requested.searchParams.get('filter[author]')).toBe('5');
    expect(requested.searchParams.getAll('sort')).toEqual(['-created']);
    expect(requested.searchParams.get('page[number]')).toBe('2');
    expect(requested.searchParams.has('page[cursor]')).toBe(false);
    expect(requested.searchParams.has('page[size]')).toBe(false);
  });

  it('merges the paging of the link with replacePage: false', async () => {
    const { context, relationship } = await articleResource({
      links: { related: `${base}/comments?page[cursor]=abc&page[size]=2` },
    });
    await relationship.relatedDocument({ page: { size: 10 }, replacePage: false });
    const requested = context.requested[1];
    expect(requested.searchParams.get('page[cursor]')).toBe('abc');
    expect(requested.searchParams.getAll('page[size]')).toEqual(['10']);
  });

  it('replaces the sparse fields of the referring document per type', async () => {
    const { context, relationship } = await articleResource(
      { links: { related: `${base}/comments?fields[comments]=id` } },
      pagedComments,
      { comments: ['text'], people: ['name'] },
    );
    const doc = await relationship.relatedDocument({ sparseFields: { comments: ['author'] } });
    const requested = context.requested[1];
    expect(requested.searchParams.getAll('fields[comments]')).toEqual(['author']);
    expect(requested.searchParams.get('fields[people]')).toBe('name');
    expect(doc!.sparseFields).toEqual({ comments: ['author'], people: ['name'] });
  });

  it('validates sort and page', async () => {
    const { relationship } = await articleResource({ links: { related: `${base}/comments` } });
    await expect(relationship.relatedDocument({ sort: [''] })).rejects.toThrowError(TypeError);
    await expect(relationship.relatedDocument({ page: { size: <any>null } })).rejects.toThrowError(TypeError);
  });
});

describe('A to-many relationship with resource linkage', () => {
  const linkage = { data: [{ type: 'comments', id: '9' }], links: { related: `${base}/comments` } };

  it('prefers the linkage without options', async () => {
    const { context, relationship } = await articleResource(linkage);
    expect(ids(await relationship.resources())).toEqual(['9']);
    expect(context.requested.length).toBe(1);
  });

  it('uses the related link for sort and page', async () => {
    const { context, relationship } = await articleResource(linkage);
    expect(ids(await relationship.resources({ sort: ['text'], followPaging: false }))).toEqual(['1', '2']);
    expect(context.requested[1].searchParams.get('sort')).toBe('text');
  });

  it('needs a related link for sort and page', async () => {
    const { relationship } = await articleResource({ data: [{ type: 'comments', id: '9' }] });
    await expect(relationship.resources({ sort: ['text'] })).rejects.toThrowError(SchemaError);
  });

  it('does not use paged linkage', async () => {
    const { relationship } = await articleResource({
      data: [{ type: 'comments', id: '1' }],
      links: { related: `${base}/comments`, next: `${base}/articles/1/relationships/comments?page[number]=2` },
    });
    expect(ids(await relationship.resources())).toEqual(['1', '2', '3', '4', '5', '6']);
  });
});
