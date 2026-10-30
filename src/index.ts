import { Spec } from './jsonapiSpec';
import { SchemaError } from './schemaChecker';
import { memoized } from './memoized.decorator';

export { Spec };

/**
 * This is the main module of Grivet.
 *
 * It contains the {@link Document}, {@link Resource} and {@link Relationship} classes that
 * perform most of the work interpreting a JSON:API structure.
 *
 * Normally you would start by creating a {@link Document} from existing JSON:API data or using the {@link Document.fromURL}
 * method to fetch data from a server. Then you can examine the resources in that document ({@link Document.resource}
 * or {@link Document.resources}) and traverse to other related resources ({@link Resource.relatedResource} or
 * {@link Resource.relatedResources}).
 *
 * You have to provide an implementation of the {@link Context} interface to specify how documents should be fetched from
 * URLs. The documentation of the {@link Context} interface shows several possible implementations (e.g. using the Angular http client
 * or Axios).
 *
 * Based on version 1.0 of JSON:API.
 */
export namespace JsonApi {
  /** Thrown when there is mismatch between the expected resource count (one or many) and the actual resource count */
  export class CardinalityError extends Error {
    constructor(message?: string) {
      super(message);
      //tslint:disable:no-unsafe-any
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }
  /** Thrown when an explicitly provided id does not match the id received from the server */
  export class IdMismatchError extends Error {
    constructor(message?: string) {
      super(message);
      //tslint:disable:no-unsafe-any
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  /**
   * Implement this interface to define how a {@link Spec.JsonApiDocument} (the JSON:API raw data) is fetched from a given URL.
   *
   * [[include:guides/context.md]]
   */
  export interface Context {
    /**
     * Should return a `Promise` resolving to the JSON:API document for the given `url`
     */
    getDocument(url: URL): Promise<Spec.JsonApiDocument>;
    /**
     * Optional: like {@link getDocument}, but also returns the URL the document was received from, e.g. after redirects
     * (`Response.url` of `fetch`). If implemented, it is used instead of `getDocument`, and relative links are resolved
     * against that URL (see {@link Document.effectiveURL}).
     */
    getDocumentWithURL?(url: URL): Promise<DocumentWithURL>;
  }

  /** A JSON:API document and the URL it was received from, see {@link Context.getDocumentWithURL} */
  export interface DocumentWithURL {
    /** The JSON:API document */
    rawData: Spec.JsonApiDocument;
    /** The absolute URL the document was received from, e.g. after redirects. `undefined` if unknown. */
    url?: URL;
  }

  /** @hidden */
  async function fetchDocument(context: Context, url: URL): Promise<DocumentWithURL> {
    if (context.getDocumentWithURL) {
      return context.getDocumentWithURL(url);
    }
    return { rawData: await context.getDocument(url) };
  }

  /** List of fields that should be fetched from the server */
  export type FieldNames = string[];
  /** Mapping from resource type to sparse fields */
  export type SparseFields = { [resourceType: string]: FieldNames };

  /** Value of a query parameter, booleans are sent as `true`/`false` */
  export type QueryParamValue = string | number | boolean;

  /** Members of the [`page` query parameter family](https://jsonapi.org/format/1.0/#fetching-pagination), e.g. `{ size: 50 }` for `page[size]=50` */
  export type PageParams = { [member: string]: QueryParamValue };

  /** Thrown when a collection is paged although `allowPaging: false` was requested */
  export class PagingNotAllowedError extends Error {
    constructor(message?: string) {
      super(message);
      //tslint:disable:no-unsafe-any
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  /**
   * Builder for JSON:API query parameters.
   *
   * Standard JSON:API members (`include`, `fields[type]`, `sort`, `filter[...]`, `page[...]`) are first-class, other
   * parameters can be added with {@link custom}. The builder methods change this instance and return it for chaining,
   * {@link merge} and {@link copy} return a new instance.
   *
   * [[include:guides/queryParams.md]]
   */
  export class QueryParams {
    private pairs: [string, string][];

    /** @param pairs Initial parameters as `[key, value]` pairs */
    constructor(pairs: ReadonlyArray<[string, QueryParamValue]> = []) {
      this.pairs = pairs.map(([key, value]) => <[string, string]>[key, String(value)]);
    }

    /**
     * Adds paths to `include=path1,path2` (without duplicates, in order).
     * @param replace Replace the include list instead of merging. `include([''], true)` requests `include=` explicitly.
     */
    include(paths: string[], replace = false): this {
      return this.mergeList('include', paths, replace);
    }

    /**
     * Adds field names to the [sparse fieldset](https://jsonapi.org/format/1.0/#fetching-sparse-fieldsets) `fields[type]=a,b`.
     * @param replace Replace the field list of this type instead of merging. `fields(type, [''], true)` requests `fields[type]=` explicitly.
     */
    fields(resourceType: string, fieldNames: FieldNames, replace = false): this {
      return this.mergeList(`fields[${resourceType}]`, fieldNames, replace);
    }

    /**
     * Adds [sort fields](https://jsonapi.org/format/1.0/#fetching-sorting) to `sort=-created,title`, a `-` prefix sorts descending.
     * @param replace Replace the sort list instead of merging
     */
    sort(fields: string[], replace = false): this {
      return this.mergeList('sort', fields, replace);
    }

    /**
     * Adds `filter[key]=value`. The filter syntax depends on the server.
     * @param key A string, which may contain brackets itself (`'simple][primary][id__in'`), or a path of segments:
     * `filter(['simple', 'primary', 'id__in'], '1,2')` adds `filter[simple][primary][id__in]=1,2`.
     * @throws TypeError if a path is empty or a segment is not a non-empty string without brackets
     */
    filter(key: string | ReadonlyArray<string>, value: QueryParamValue): this {
      this.pairs.push([filterKey(key), String(value)]);
      return this;
    }

    /** Adds `page[key]=value`. The page members depend on the server. */
    page(key: string, value: QueryParamValue): this {
      this.pairs.push([`page[${key}]`, String(value)]);
      return this;
    }

    /** Adds `key=value` as given */
    custom(key: string, value: QueryParamValue): this {
      this.pairs.push([key, String(value)]);
      return this;
    }

    /** A new instance with the parameters of this one followed by those of `other` */
    merge(other: QueryParams): QueryParams {
      return new QueryParams([...this.pairs, ...other.pairs]);
    }

    /** An independent copy */
    copy(): QueryParams {
      return new QueryParams(this.pairs);
    }

    /** `true` if there are no parameters */
    get isEmpty(): boolean {
      return this.pairs.length === 0;
    }

    /** The parameters as `[key, value]` pairs */
    entries(): [string, string][] {
      return this.pairs.map(([key, value]) => <[string, string]>[key, value]);
    }

    /** A copy of `url` with these parameters appended to its query, existing parameters are kept */
    applyTo(url: URL): URL {
      const result = new URL(url.href);
      for (const [key, value] of this.pairs) {
        result.searchParams.append(key, value);
      }
      return result;
    }

    /** @hidden */
    private mergeList(key: string, values: string[], replace: boolean): this {
      const explicitlyEmpty = replace && values.length > 0 && values.every((value) => value === '');
      const newValues = values.filter((value) => value !== '');
      if (replace) {
        this.pairs = this.pairs.filter(([existingKey]) => existingKey !== key);
        if (explicitlyEmpty) {
          this.pairs.push([key, '']);
        } else if (newValues.length > 0) {
          this.pairs.push([key, unique(newValues).join(',')]);
        }
        return this;
      }
      if (newValues.length === 0) {
        return this;
      }
      const index = this.pairs.findIndex(([existingKey]) => existingKey === key);
      if (index >= 0) {
        const existing = this.pairs[index][1];
        this.pairs[index] = [key, unique([...(existing !== '' ? existing.split(',') : []), ...newValues]).join(',')];
      } else {
        this.pairs.push([key, unique(newValues).join(',')]);
      }
      return this;
    }
  }

  /** @hidden */
  function unique(values: string[]): string[] {
    return values.filter((value, index) => values.indexOf(value) === index);
  }

  /** @hidden */
  function filterKey(key: string | ReadonlyArray<string>): string {
    if (typeof key === 'string') {
      return `filter[${key}]`;
    }
    if (!Array.isArray(key) || key.length === 0) {
      throw new TypeError('A filter path needs at least one segment');
    }
    for (const segment of key) {
      if (typeof segment !== 'string' || segment === '' || segment.includes('[') || segment.includes(']')) {
        throw new TypeError(
          `Filter path segments must be non-empty strings without brackets: ${JSON.stringify(segment)}`,
        );
      }
    }
    return `filter[${key.join('][')}]`;
  }

  /**
   * Options for fetching the `related` link of a {@link Relationship}
   *
   * [[include:guides/paging.md]]
   */
  export interface RelatedDocumentOptions {
    /** Sparse fields per type, replacing those of the referring document for these types */
    sparseFields?: SparseFields;
    /** [Sort fields](https://jsonapi.org/format/1.0/#fetching-sorting), a `-` prefix sorts descending */
    sort?: string[];
    /** Members of the `page` query parameter family for the first request, e.g. `{ size: 50 }` */
    page?: PageParams;
    /**
     * A non-empty `page` replaces all `page` parameters of the link (default). With `false`, it only overrides
     * matching members and keeps others, e.g. a cursor or starting page.
     */
    replacePage?: boolean;
  }

  /**
   * Options for resolving the resources of a to-many {@link Relationship}
   *
   * [[include:guides/paging.md]]
   */
  export interface RelatedResourcesOptions extends RelatedDocumentOptions {
    /** With `false`, a paged response (one with a `next` link) throws a {@link PagingNotAllowedError}. Default `true`. */
    allowPaging?: boolean;
    /** Follow the `next` links and return the resources of all pages. Defaults to `allowPaging`. */
    followPaging?: boolean;
  }

  /** @hidden */
  function hasRequestOptions(options: RelatedDocumentOptions): boolean {
    return (
      (options.sparseFields !== undefined && Object.keys(options.sparseFields).length > 0) ||
      (options.sort !== undefined && options.sort.length > 0) ||
      (options.page !== undefined && Object.keys(options.page).length > 0)
    );
  }

  /** @hidden */
  function validateRelatedOptions(options: RelatedDocumentOptions) {
    if (options.sort !== undefined) {
      if (!Array.isArray(options.sort) || options.sort.some((field) => field === '')) {
        throw new TypeError('`sort` must be an array of non-empty strings');
      }
    }
    if (options.page !== undefined) {
      for (const member in options.page) {
        const value = options.page[member];
        // JavaScript callers can pass null or undefined despite the type
        // tslint:disable-next-line:strict-type-predicates
        if (value === null || value === undefined) {
          throw new TypeError(`page member "${member}" must have a value`);
        }
      }
    }
  }

  /**
   * Resolves the default of `followPaging`, which is `allowPaging`
   * @throws TypeError if `allowPaging: false` is combined with `followPaging: true`
   * @hidden
   */
  function resolveFollowPaging(options: RelatedResourcesOptions): boolean {
    const allowPaging = options.allowPaging !== false;
    if (!allowPaging && options.followPaging === true) {
      throw new TypeError('`allowPaging: false` cannot be combined with `followPaging: true`');
    }
    return options.followPaging === undefined ? allowPaging : options.followPaging;
  }

  /** @hidden */
  function hasNextLink(document: Document): boolean {
    const links = document.rawData.links;
    return links !== undefined && links.next !== null && links.next !== undefined;
  }

  /** @hidden */
  function isPagingLink(linkName: string): boolean {
    return linkName === 'first' || linkName === 'last' || linkName === 'prev' || linkName === 'next';
  }

  /**
   * This class represents a [JSON:API resource object](https://jsonapi.org/format/1.0/#document-resource-objects)
   * and is used as base class for {@link PrimaryResource}s and {@link RelatedResource}s.
   *
   * The abstract {@link getData} method is implemented in the derived classes to specify how
   * the raw JSON:API data is obtained.
   *
   * Methods and accessors marked as `memoized` are only executed once per instance (the first time they are called)
   * and return a cached result on subsequent calls.
   *
   * @see https://jsonapi.org/format/1.0/#document-resource-objects
   */
  export abstract class Resource {
    /**
     * @param document The parent document that contains this resource
     * @param id The id of this resource
     * @param type The resource type
     * @param context The context to use to fetch related documents
     */
    constructor(
      protected readonly document: Document,
      public readonly id: string,
      public readonly type: string,
      private readonly context: Context
    ) {}

    protected abstract getData(): Spec.ResourceObject;

    /**
     * The raw JSON:API data of this resource
     * @memoized
     */
    @memoized()
    get rawData(): Spec.ResourceObject {
      return this.getData();
    }

    /**
     * Object containing all [attributes](https://jsonapi.org/format/1.0/#document-resource-object-attributes) of this resource
     */
    get attributes(): Spec.AttributesObject | undefined {
      return this.rawData.attributes;
    }

    /**
     * Object containing all {@link Relationship}s defined by this resource
     * @see https://jsonapi.org/format/1.0/#document-resource-object-relationships
     * @memoized
     */
    @memoized()
    get relationships(): Relationships {
      if (!this.rawData.relationships) {
        return {};
      }
      const result: Relationships = {};
      for (const relationshipName in this.rawData.relationships) {
        result[relationshipName] = new Relationship(
          this.document,
          this.rawData.relationships[relationshipName],
          this.context
        );
      }
      return result;
    }

    /**
     * Object containing all {@link Link}s defined by this resource
     * @see https://jsonapi.org/format/1.0/#document-links
     * @memoized
     */
    @memoized()
    get links(): Links {
      if (!this.rawData.links) {
        return {};
      }
      const result: Links = {};
      for (const linkName in this.rawData.links) {
        result[linkName] = new Link(this.rawData.links[linkName], this.document.effectiveURL);
      }
      return result;
    }

    /**
     * Object containing all entries inside `links` of `meta` interpreted as
     * JSON:API Link (either string or link object)
     * @memoized
     */
    @memoized()
    get metaLinks(): Links {
      if (!this.rawData.meta) {
        return {};
      }
      if (!this.rawData.meta.links) {
        return {};
      }
      const result: Links = {};
      for (const linkName in this.rawData.meta.links) {
        result[linkName] = new Link(this.rawData.meta.links[linkName], this.document.effectiveURL);
      }
      return result;
    }

    /**
     * Object containing all [meta data](https://jsonapi.org/format/1.0/#document-meta) of this resource
     * @memoized
     */
    @memoized()
    get meta(): Spec.MetaObject | undefined {
      return this.rawData.meta;
    }

    /**
     * Self-link defined in the `links` member
     */
    get selfLink(): Link | undefined {
      return this.links['self'];
    }

    /**
     * Proxy providing all multiple {@link Resource}s reachable via relationships from this resource.
     *
     * @example
     * For this JSON:API document
     *
     * ```json
     * {
     *   "data": {
     *     "type": "articles",
     *     "id": "1",
     *     "relationships": {
     *       "comments": {
     *         "data": [{"type":"comments", "id":"1"}, {"type":"comments", "id":"2"}]
     *       },
     *       "ratings": {
     *         "data": [{"type":"ratings", "id":"1"}, {"type":"ratings", "id":"2"}]
     *       }
     *     }
     *   },
     *   "included": [...]
     * }
     * ```
     *
     * calling `relatedResources` on the primary _articles_ resource will give you access to the following data:
     *
     * ```typescript
     * {
     *   comments: [
     *     RelatedResource(...),
     *     RelatedResource(...)
     *   ],
     *   ratings: [
     *     RelatedResource(...),
     *     RelatedResource(...)
     *   ]
     * }
     * ```
     *
     * This accessor is a shortcut so that you do not have to go through `relationships` manually every time.
     * Writing
     *
     * ```typescript
     * const comments = await article.relatedResources['comments'];
     * ```
     *
     * is equivalent to
     *
     * ```typescript
     * const comments = await article.relationships['comments'].resources();
     * ```
     *
     * @remarks
     * As this shortcut uses the {@link Relationship.resources} method, it prefers resource linkage (i.e. id/type pairs in `data`)
     * to `related` links should both be present in the relationship. You can use the {@link Relationship.resourcesFromRelatedLink}
     * method if you need to fetch related resources via link instead of resource linkage.
     *
     * As this is only a proxy object, calling `relatedResources` will not yet construct any {@link RelatedResource}
     * instances. Only when accessing a specific related resource (e.g. calling `article.relatedResources['comments']`)
     * are the new resources actually constructed.
     */
    get relatedResources() {
      return new Proxy(<RelationshipToResources>{}, new RelatedResourcesAccessor(this));
    }

    /**
     * Proxy providing all singular {@link Resource}s reachable via relationships from this resource.
     *
     * @example
     * For this JSON:API document
     *
     * ```json
     * {
     *   "data": {
     *     "type": "articles",
     *     "id": "1",
     *     "relationships": {
     *       "author": {
     *         "data": {"type":"people", "id":"1"}
     *       },
     *       "reviewer": {
     *         "data": {"type":"people", "id":"12"}
     *       }
     *     }
     *   },
     *   "included": [...]
     * }
     * ```
     *
     * calling `relatedResource` on the primary _articles_ resource will give you access to the following data:
     *
     * ```typescript
     * {
     *   author: RelatedResource(...),
     *   reviewer: RelatedResource(...)
     * }
     * ```
     *
     * This accessor is a shortcut so that you do not have to go through `relationships` manually every time.
     * Writing
     *
     * ```typescript
     * const author = await article.relatedResource['author'];
     * ```
     *
     * is equivalent to
     *
     * ```typescript
     * const author = await article.relationships['author'].resource();
     * ```
     *
     * @remarks
     * As this shortcut uses the {@link Relationship.resource} method, it prefers resource linkage (i.e. id/type pairs in `data`)
     * to `related` links should both be present in the relationship. You can use the {@link Relationship.resourceFromRelatedLink}
     * method if you need to fetch a related resource via link instead of resource linkage.
     *
     * As this is only a proxy object, calling `relatedResource` will not yet construct any {@link RelatedResource}
     * instances. Only when accessing a specific related resource (e.g. calling `article.relatedResource['author']`)
     * is the new resource actually constructed.
     */
    get relatedResource() {
      return new Proxy(<RelationshipToResource>{}, new RelatedResourceAccessor(this));
    }

    /**
     * Proxy providing all {@link Document}s reachable via `related` links in relationships.
     *
     * @example
     * For this JSON:API document
     *
     * ```json
     * {
     *   "data": {
     *     "type": "articles",
     *     "id": "1",
     *     "relationships": {
     *       "author": {
     *         "links": {"related": "http://example.com/people/1"}
     *       },
     *       "reviewer": {
     *         "links": {"related": "http://example.com/people/12"}
     *       }
     *     }
     *   }
     * }
     * ```
     *
     * calling `relatedDocuments` on the primary _articles_ resource will give you access to the following data:
     *
     * ```typescript
     * {
     *   author: Document(...),
     *   reviewer: Document(...)
     * }
     * ```
     *
     * @remarks
     * As this is only a proxy object, calling `relatedDocuments` does not yet fetch any related documents.
     * Only when accessing a specific related document (e.g. calling `article.relatedDocuments['author']`) is the
     * new document actually requested from the server.
     */
    get relatedDocuments() {
      return new Proxy(<RelationshipToDocument>{}, new RelatedDocumentAccessor(this));
    }
  }

  /**
   * A resource contained in the top level `data` member of a {@link Document}.
   *
   * Always constructed non-lazily from raw JSON:API data. Normally this is
   * done automatically when accessing the {@link Document.resource} or {@link Document.resources}
   * accessors.
   *
   * @example
   *
   * ```typescript
   * // a document containing one _article_ resource
   * const doc = await JsonApi.Document.fromURL(new URL('http://example.com/article'), context);
   * const article = doc.resource;  // the primary resource
   * ```
   *
   * @remarks
   * Methods and accessors marked as `memoized` are only executed once per instance (the first time they are called)
   * and return a cached result on subsequent calls.
   */
  export class PrimaryResource extends Resource {
    private readonly pRawData: Spec.ResourceObject;

    /**
     * Directly construct a primary resource. Normally a primary resource is obtained via the {@link Document.resource}
     * or {@link Document.resources} accessors while traversing a document structure.
     * @param rawData The JSON:API resource object from which to construct this primary resource
     * @param document The parent document that contains this primary resource
     * @param resourceType The type of this resource
     * @param context The context to use to fetch related documents
     * @param id The id of this resource
     * @throws {@link IdMismatchError} when the optional `id` argument does not match the id present in `rawData`
     * @throws SchemaError when `rawData` does not look like a [JSON:API resource object](https://jsonapi.org/format/1.0/#document-resource-objects)
     */
    constructor(rawData: Spec.ResourceObject, document: Document, resourceType: string, context: Context, id?: string) {
      Spec.checkResourceObjectSchema(rawData);
      const passedId = id;
      id = rawData.id;
      if (passedId !== undefined && id !== passedId) {
        throw new IdMismatchError(`ID in rawData does not match given ID: ${id} != ${passedId}`);
      }
      super(document, id, resourceType, context);
      this.pRawData = rawData;
    }

    protected getData(): Spec.ResourceObject {
      return this.pRawData;
    }
  }

  /** Resource objects of a document by type and id @hidden */
  type ResourceIndex = Map<string, Map<string, ReadonlyArray<Spec.ResourceObject>>>;

  /** Result of a lookup that finds no resource object @hidden */
  const noResourceObjects: ReadonlyArray<Spec.ResourceObject> = Object.freeze([]);

  /**
   * Holds an `application/vnd.api+json` [document](https://jsonapi.org/format/1.0/#document-top-level) and
   * provides methods to access the resources in that document.
   *
   * This is the main class that acts as an entry point to traverse to other resources.
   * Use the static {@link fromURL} method to fetch and construct a {@link Document} from a given URL.
   *
   * @remarks
   * Methods and accessors marked as `memoized` are only executed once per instance (the first time they are called)
   * and return a cached result on subsequent calls.
   *
   * @see https://jsonapi.org/format/1.0/#document-top-level
   */
  export class Document {
    /**
     * Fetch JSON:API data from the given URL and construct a {@link Document} from it.
     *
     * @example
     * ### Simplest example
     *
     * Fetching a document from a server:
     * ```typescript
     * const articleDoc = await JsonApi.Document.fromURL(new URL('http://example.com/article/1'), context);
     * const article = articleDoc.resource;
     * ```
     * [[include:guides/sparseFieldsets.md]]
     *
     * [[include:guides/queryParams.md]]
     *
     * @param url The URL to fetch. It is not changed; the document gets a copy with the added query parameters.
     * @param context Context that will provide the JSON:API data, normally by fetching it from a server
     * @param sparseFields Only these fields (per type) are requested from the server. They also apply to related documents.
     * @param params Further query parameters for this request only, e.g. sorting, filtering or paging
     */
    static async fromURL(
      url: URL,
      context: Context,
      sparseFields?: SparseFields,
      params?: QueryParams,
    ): Promise<Document> {
      let requestURL = new URL(url.href);
      for (const resourceType in sparseFields) {
        requestURL.searchParams.append(`fields[${resourceType}]`, sparseFields[resourceType].join(','));
      }
      if (params) {
        requestURL = params.applyTo(requestURL);
      }
      const fetched = await fetchDocument(context, requestURL);
      return new Document(fetched.rawData, context, requestURL, sparseFields, fetched.url);
    }

    /**
     * Directly construct a {@link Document}. Does not fetch any data from a server.
     * @param rawData The raw JSON:API data describing the document
     * @param context The context to use to fetch related documents (not used during the initial construction)
     * @param url An optional URL can be provided to indicate where the raw data came from
     * @param sparseFields An object listing [sparse fieldsets](https://jsonapi.org/format/1.0/#fetching-sparse-fieldsets) for subsequent fetch operations
     * @param responseURL The URL the raw data was received from if it differs from `url`, e.g. after redirects
     * @throws SchemaError when the given rawData does not look like a JSON:API document
     */
    constructor(
      readonly rawData: Spec.JsonApiDocument,
      private readonly context: Context,
      public readonly url?: URL,
      public readonly sparseFields?: SparseFields,
      private readonly responseURL?: URL,
    ) {
      Spec.checkDocumentSchema(rawData);
    }

    /**
     * The URL this document was received from, e.g. after redirects, if the context tells it
     * ({@link Context.getDocumentWithURL}); otherwise {@link url}, the requested URL. Relative links of the document are
     * resolved against it.
     */
    get effectiveURL(): URL | undefined {
      return this.responseURL || this.url;
    }

    /**
     * All resource objects in this document with the given id and type, i.e. matching primary resources (those in
     * the `data` member) and matching included resources (those in the `included` member). A compliant document
     * contains at most one; an empty array is returned when there is none.
     *
     * The lookup is served from an index that is built on first use, so resolving many related resources of a large
     * compound document does not scan the whole document for each of them. Like the memoized accessors, the index
     * does not reflect changes made to `rawData` after it was built.
     * @param id The id of the resource objects to look for
     * @param resourceType The type of the resource objects to look for
     */
    findResourceObjects(id: string, resourceType: string): ReadonlyArray<Spec.ResourceObject> {
      const byId = this.resourceIndex.get(resourceType);
      return (byId && byId.get(id)) || noResourceObjects;
    }

    /**
     * Index of all primary and included resource objects in this document by type and id
     * @memoized
     * @hidden
     */
    @memoized()
    private get resourceIndex(): ResourceIndex {
      const index: ResourceIndex = new Map();
      const data = this.rawData.data;
      const primary = Array.isArray(data)
        ? <Spec.ResourceObject[]>data
        : data === null || data === undefined
        ? []
        : [<Spec.ResourceObject>data];
      for (const resourceObjects of [primary, this.rawData.included || []]) {
        for (const resourceObject of resourceObjects) {
          let byId = index.get(resourceObject.type);
          if (byId === undefined) {
            byId = new Map();
            index.set(resourceObject.type, byId);
          }
          // only a non-compliant document has more than one match, so copying the matches is rare
          const matches = byId.get(resourceObject.id) || noResourceObjects;
          byId.set(resourceObject.id, Object.freeze([...matches, resourceObject]));
        }
      }
      return index;
    }

    /**
     * `true` if this document's primary data is an array of resources and not just a single resource
     * @memoized
     */
    @memoized()
    get hasManyResources(): boolean {
      return Array.isArray(this.rawData.data);
    }

    /**
     * Array of the primary {@link Resource}s in this document.
     *
     * @example
     * The JSON:API document
     *
     * ```json
     * {
     *   "data": [{
     *     "type": "articles",
     *     "id": "1"
     *   }]
     * }
     * ```
     *
     * would have a primary resource array of length 1 with one element with type "articles" and id "1".
     *
     * @returns Empty array when no primary resources are contained in the document
     * @throws {@link CardinalityError} if the document instead only contains a singular resource.
     * @memoized
     */
    @memoized()
    get resources(): PrimaryResource[] {
      if (!this.hasManyResources) {
        throw new CardinalityError(
          'Document does not contain an array of resources. Use the `resource` property instead'
        );
      }
      if (!('data' in this.rawData)) {
        return [];
      }
      return (<Spec.ResourceObject[]>this.rawData.data).map(
        (primaryData) => new PrimaryResource(primaryData, this, primaryData.type, this.context)
      );
    }

    /**
     * The primary {@link Resource} in this document.
     *
     * @example
     * The JSON:API document
     * ```json
     * {
     *   "data": {
     *     "type": "articles",
     *     "id": "1"
     *   }
     * }
     * ```
     *
     * would have a primary resource with type "articles" and id "1".
     *
     * @returns Null if the primary data consists of the value `null`
     * @throws {@link CardinalityError} if the document instead contains an array of resources.
     * @memoized
     */
    @memoized()
    get resource(): PrimaryResource | null | undefined {
      if (this.hasManyResources) {
        throw new CardinalityError('Document contains an array of resources. Use the `resources` property instead');
      }
      if (this.rawData.data === null) {
        return null;
      }
      if (!('data' in this.rawData)) {
        return undefined;
      }
      const primaryData = <Spec.ResourceObject>this.rawData.data;
      return new PrimaryResource(primaryData, this, primaryData.type, this.context);
    }

    /**
     * Map from type and id to {@link RelatedResource} for all resources under the top level `included` member.
     *
     * @example
     * For the JSON:API document
     * ```json
     * {
     *   "data": null,
     *   "included": [
     *      {"type": "articles", "id": "1"},
     *      {"type": "articles", "id": "2"},
     *      {"type": "people", "id": "5"}
     *    ]
     * }
     * ```
     * calling `includedResources` would produce
     * ```typescript
     * {
     *   articles: {
     *     '1': RelatedResource(...),
     *     '2': RelatedResource(...),
     *   },
     *   people: {
     *     '5': RelatedResource(...)
     *   }
     * }
     * ```
     * @memoized
     */
    @memoized()
    get includedResources(): IncludedResourcesMap {
      const res: IncludedResourcesMap = {};
      for (const includedResource of this.rawData.included || []) {
        if (!(includedResource.type in res)) {
          res[includedResource.type] = {};
        }
        res[includedResource.type][includedResource.id] = new RelatedResource(
          this,
          includedResource.id,
          includedResource.type,
          this.context
        );
      }
      return res;
    }

    /**
     * Map of link names to {@link Link}s in the top level `links` member, e.g. the
     * [pagination links](https://jsonapi.org/format/1.0/#fetching-pagination) `first`, `last`, `prev` and `next`.
     * Links with the value `null` are left out.
     * @memoized
     */
    @memoized()
    get links(): Links {
      const result: Links = {};
      const rawLinks: { [linkName: string]: Spec.Link | null | undefined } = this.rawData.links || {};
      for (const linkName in rawLinks) {
        const rawLink = rawLinks[linkName];
        if (rawLink !== null && rawLink !== undefined) {
          result[linkName] = new Link(rawLink, this.effectiveURL);
        }
      }
      return result;
    }

    /**
     * The next page of this paged collection, `undefined` if there is no `next` link.
     * The sparse fields of this document also apply to related documents of the page.
     *
     * [[include:guides/paging.md]]
     * @memoized
     */
    @memoized()
    async nextPage(): Promise<Document | undefined> {
      return this.page('next');
    }

    /**
     * The previous page of this paged collection, `undefined` if there is no `prev` link
     * @memoized
     */
    @memoized()
    async prevPage(): Promise<Document | undefined> {
      return this.page('prev');
    }

    /**
     * The first page of this paged collection, `undefined` if there is no `first` link
     * @memoized
     */
    @memoized()
    async firstPage(): Promise<Document | undefined> {
      return this.page('first');
    }

    /**
     * The last page of this paged collection, `undefined` if there is no `last` link
     * @memoized
     */
    @memoized()
    async lastPage(): Promise<Document | undefined> {
      return this.page('last');
    }

    /**
     * This document followed by all pages reached through `next` links
     *
     * [[include:guides/paging.md]]
     */
    async allPages(): Promise<Document[]> {
      const pages: Document[] = [this];
      let page = await this.nextPage();
      while (page) {
        pages.push(page);
        page = await page.nextPage();
      }
      return pages;
    }

    /**
     * The primary resources of this document and of all pages reached through `next` links, see {@link allPages}
     * @throws {@link CardinalityError} if a page only contains a singular resource.
     */
    async allResources(): Promise<PrimaryResource[]> {
      const resources: PrimaryResource[] = [];
      for (const page of await this.allPages()) {
        for (const resource of page.resources) {
          resources.push(resource);
        }
      }
      return resources;
    }

    /** @hidden */
    private async page(linkName: string): Promise<Document | undefined> {
      if (!(linkName in this.links)) {
        return undefined;
      }
      // The link already contains the query parameters of the page, including the sparse fields
      const url = new URL(this.links[linkName].url.href);
      const fetched = await fetchDocument(this.context, url);
      return new Document(fetched.rawData, this.context, url, this.sparseFields, fetched.url);
    }
  }

  /** Collection of {@link RelatedResource}s included in a compound document, organized by type and id */
  export type IncludedResourcesMap = { [type: string]: { [id: string]: RelatedResource } };
  /** Mapping from relationship name to {@link Relationship} */
  export type Relationships = { [relationshipName: string]: Relationship };
  /** Mapping from link name to {@link Link} */
  export type Links = { [linkName: string]: Link };

  /** @internal */
  type RelationshipToResource = { [relationshipName: string]: Promise<Resource> };
  /** @internal */
  type RelationshipToResources = { [relationshipName: string]: Promise<Resource[]> };
  /** @internal */
  type RelationshipToDocument = { [relationshipName: string]: Promise<Document> };

  /** @internal */
  class RelatedResourceAccessor<T extends RelationshipToResource> implements ProxyHandler<T> {
    constructor(private readonly parent: Resource) {}
    /**
     * Provide access to parent related resource
     * @internal
     */
    async get(target: T, relationshipName: string, receiver: any): Promise<Resource | null | undefined> {
      if (relationshipName in this.parent.relationships) {
        return this.parent.relationships[relationshipName].resource();
      }
    }
  }

  /** @internal */
  class RelatedResourcesAccessor<T extends RelationshipToResources> implements ProxyHandler<T> {
    constructor(private readonly parent: Resource) {}
    /**
     * Provide access to parent related resources
     * @internal
     */
    async get(target: T, relationshipName: string, receiver: any): Promise<Resource[]> {
      if (relationshipName in this.parent.relationships) {
        return this.parent.relationships[relationshipName].resources();
      }
      return [];
    }
  }

  /** @internal */
  class RelatedDocumentAccessor<T extends RelationshipToDocument> implements ProxyHandler<T> {
    constructor(private readonly parent: Resource) {}
    /**
     * Provide access to parent related document
     * @internal
     */
    async get(target: T, relationshipName: string, receiver: any): Promise<Document | undefined> {
      if (relationshipName in this.parent.relationships) {
        return this.parent.relationships[relationshipName].relatedDocument();
      }
    }
  }

  /**
   * A resource contained in the top level `included` member of a {@link Document} or linked via href.
   *
   * This resource is initialized lazily on demand when its {@link getData} method is first called.
   * The resource then looks for its id and type (given at construction) in the parent document
   * `data` and `included` members to find its raw data.
   *
   * Normally a related resource is obtained via the {@link Resource.relatedResource} and {@link Resource.relatedResources}
   * accessors or the {@link Relationship.resource} and {@link Relationship.resources} methods.
   *
   * @example
   *
   * ```typescript
   * // a document containing one _article_ resource with a related _author_ resource
   * const doc = await JsonApi.Document.fromURL(new URL('http://example.com/article'), context);
   * const article = doc.resource;  // the primary resource
   * const author = await article.relatedResource['author'];  // the related resource
   * ```
   *
   * @remarks
   * Methods and accessors marked as `memoized` are only executed once per instance (the first time they are called)
   * and return a cached result on subsequent calls.
   */
  export class RelatedResource extends Resource {
    /**
     * Directly construct a related document. It will be lazily initialized from `document` on first use,
     * so we need to provide an id and a type here so that the resource can find itself in `document`.
     * @param document The parent document that contains this related resource
     * @param id The id of this resource
     * @param resourceType The type of this resource
     * @param context The context to use to fetch related documents
     * @throws {@link IdMismatchError} when `id` was not found in the given `document`
     */
    constructor(document: Document, id: string, resourceType: string, context: Context) {
      super(document, id, resourceType, context);
    }

    /**
     * Looks up the matching resource in the parent {@link Document}. All primary resources (those in the `data` member)
     * and all included resources (those in the `included` member) are searched, see {@link Document.findResourceObjects}.
     * @throws {@link IdMismatchError} if the resource is not found or found multiple times
     * @throws SchemaError when `rawData` does not look like a [JSON:API resource object](https://jsonapi.org/format/1.0/#document-resource-objects)
     */
    protected getData(): Spec.ResourceObject {
      const filtered = this.document.findResourceObjects(this.id, this.type);
      if (filtered.length === 0) {
        throw new IdMismatchError(`Resource with id "${this.id}" and type "${this.type}" not found in document`);
      }
      if (filtered.length > 1) {
        throw new IdMismatchError(
          `Resource with id "${this.id}" and type "${this.type}" found more than once in document`
        );
      }
      Spec.checkResourceObjectSchema(filtered[0]);
      return filtered[0];
    }
  }

  /**
   * Represents a link with URL and optional meta data
   * @see https://jsonapi.org/format/1.0/#document-links
   */
  export class Link {
    /** The complete url for this link */
    readonly url: URL;
    /** Any additional meta data */
    readonly meta?: object;

    /**
     * @param rawData Can be a string containing an href or a {@link Spec.LinkObject}
     * @param referringDocumentURL A relative href (e.g. `/articles/1`, `comments` or `?page[number]=2`) is resolved
     * against this URL as described in [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986.html#section-5), normally
     * the {@link Document.effectiveURL} of the document that contains the link
     */
    constructor(rawData: Spec.Link, referringDocumentURL?: URL) {
      const href = typeof rawData === 'string' ? rawData : rawData.href;
      this.url = referringDocumentURL ? new URL(href, referringDocumentURL.href) : new URL(href);
      if (typeof rawData !== 'string') {
        this.meta = rawData.meta;
      }
    }
  }

  /**
   * Defines relations from one {@link Resource} to another (included in the document or external) and can resolve them.
   *
   * This class is normally not used directly. It is used internally in the {@link Resource.relatedResource}, {@link Resource.relatedResources}
   * and {@link Resource.relatedDocuments} accessors and you should use those if you just want to gain access to other resources.
   *
   * If you need to work with relationships directly (e.g. to obtain meta data about the relationship itself), you can
   * use the {@link Resource.relationships} accessor.
   *
   * @remarks
   * Methods and accessors marked as `memoized` are only executed once per instance (the first time they are called)
   * and return a cached result on subsequent calls.
   *
   * @see https://jsonapi.org/format/1.0/#document-resource-object-relationships
   */
  export class Relationship {
    /**
     * Directly construct a relationship
     * @param referringDocument The document that contains the relationship
     * @param rawData The JSON:API relationship object from which to construct the relationship
     * @param context The context to use to fetch related documents
     * @throws SchemaError when `rawData` does not look like a [JSON:API relationship object](https://jsonapi.org/format/1.0/#document-resource-object-relationships)
     */
    constructor(
      private readonly referringDocument: Document,
      private readonly rawData: Spec.RelationshipObject,
      private readonly context: Context
    ) {
      Spec.checkRelationshipObjectSchema(rawData);
    }

    /**
     * `true` if the relationship only contains a `meta` member and no `data` or `links`
     * @memoized
     */
    @memoized()
    get empty(): boolean {
      return this.links === undefined && this.data === undefined;
    }

    /**
     * Map of link names to {@link Link}s defined under the `links` member of this relationship
     * @memoized
     */
    @memoized()
    get links(): Links | undefined {
      if (!this.rawData.links) {
        return undefined;
      }
      const result: Links = {};
      const rawLinks: { [linkName: string]: Spec.Link | null | undefined } = this.rawData.links;
      for (const linkName in rawLinks) {
        const rawLink = rawLinks[linkName];
        if (rawLink !== null && rawLink !== undefined) {
          result[linkName] = new Link(rawLink, this.referringDocument.effectiveURL);
        }
      }
      return result;
    }

    /**
     * One or many {@link Spec.ResourceIdentifierObject}s defined in the `data` member of this relationship
     * @memoized
     */
    @memoized()
    get data(): Spec.ResourceIdentifierObject | Spec.ResourceIdentifierObject[] | undefined | null {
      return this.rawData.data;
    }

    /** @hidden */
    private cachedRelatedDocument?: Promise<Document | undefined>;
    /** @hidden */
    private cachedResources?: Promise<Resource[]>;
    /** @hidden */
    private cachedResourcesFromRelatedLink?: Promise<Resource[]>;

    /**
     * The {@link Document} referred to by the `related` link in the `links` member of the relationship.
     * Fetches the related document from the server using the context given at construction and respecting any
     * sparseFields of the referring document.
     *
     * `options` can request sparse fields, sorting and a page for this request. Only the requested page is fetched;
     * use {@link Document.nextPage} or {@link resources} for the following pages. Query parameters of the link are kept
     * unless overridden. Which sort fields and page members a server supports depends on the server.
     *
     * [[include:guides/paging.md]]
     *
     * @returns `undefined` if there is no `related` link
     * @throws TypeError if `sort` is not an array of non-empty strings or a `page` member has no value
     * @remarks The result is memoized if no `sparseFields`, `sort` or `page` options are given.
     */
    async relatedDocument(options: RelatedDocumentOptions = {}): Promise<Document | undefined> {
      validateRelatedOptions(options);
      if (hasRequestOptions(options)) {
        return this.fetchRelatedDocument(options);
      }
      if (this.cachedRelatedDocument === undefined) {
        this.cachedRelatedDocument = this.fetchRelatedDocument(options);
      }
      return this.cachedRelatedDocument;
    }

    /** @hidden */
    private async fetchRelatedDocument(options: RelatedDocumentOptions): Promise<Document | undefined> {
      if (!this.links || !('related' in this.links)) {
        return undefined;
      }
      const inherited = this.referringDocument.sparseFields;
      const sparseFields = options.sparseFields ? { ...inherited, ...options.sparseFields } : inherited;
      const params = new QueryParams();
      if (options.sort && options.sort.length > 0) {
        params.sort(options.sort);
      }
      const page = options.page || {};
      for (const member in page) {
        params.page(member, page[member]);
      }
      // The request keeps the query of the link (e.g. filters set by the server) except for the parameters it sets
      const overridden = new Set(params.entries().map(([key]) => key));
      for (const resourceType in sparseFields) {
        overridden.add(`fields[${resourceType}]`);
      }
      const replacePage = options.replacePage !== false && Object.keys(page).length > 0;
      const url = new URL(this.links['related'].url.href);
      const linkKeys: string[] = [];
      url.searchParams.forEach((value, key) => linkKeys.push(key));
      for (const key of linkKeys) {
        if (overridden.has(key) || (replacePage && (key === 'page' || key.startsWith('page[')))) {
          url.searchParams.delete(key);
        }
      }
      return Document.fromURL(url, this.context, sparseFields, params);
    }

    /**
     * List of {@link Resource}s referenced by this relationship (if there are many resources).
     * Resource linkage (resource identifiers found in the `data` member of this relationship) has priority.
     * If there is no resource linkage, the primary resources found in {@link relatedDocument} are used,
     * including those of all following pages.
     *
     * Linkage keeps the server's order and has no pages, so `sort` or `page` options always use the `related` link.
     * Linkage with pagination links in the relationship is not used either, since it may be incomplete.
     * With a `sparseFields` option, linkage is only used if the included resources contain all requested fields of
     * their type (an empty list only needs the identifier); documents fetched from these resources then use the
     * requested fields. Otherwise the `related` link is used.
     *
     * By default, the `next` links of the related document are followed until the last page. With
     * `followPaging: false`, only the requested page is returned. With `allowPaging: false`, a paged response
     * throws a {@link PagingNotAllowedError}.
     *
     * [[include:guides/paging.md]]
     *
     * @throws {@link CardinalityError} if there is only a singular resource.
     * @throws {@link PagingNotAllowedError} if the response is paged and `allowPaging` is `false`.
     * @throws SchemaError if neither a `links` nor a `data` member is present, or if `sort` or `page` is given without a `related` link
     * @throws TypeError if `allowPaging: false` is combined with `followPaging: true`, `sort` is not an array of
     * non-empty strings or a `page` member has no value
     * @remarks The result is memoized if no options are given.
     */
    async resources(options: RelatedResourcesOptions = {}): Promise<Resource[]> {
      validateRelatedOptions(options);
      resolveFollowPaging(options);
      if (Object.keys(options).length > 0) {
        return this.resolveResources(options);
      }
      if (this.cachedResources === undefined) {
        this.cachedResources = this.resolveResources(options);
      }
      return this.cachedResources;
    }

    /** @hidden */
    private get linkageIsPaged(): boolean {
      const links = this.rawData.links || {};
      return Object.keys(links).some(
        (name) => isPagingLink(name) && links[name] !== null && links[name] !== undefined,
      );
    }

    /** @hidden */
    private async resourcesOfRelatedDocument(options: RelatedResourcesOptions): Promise<Resource[] | undefined> {
      const allowPaging = options.allowPaging !== false;
      const followPaging = resolveFollowPaging(options);
      let page = await this.relatedDocument({
        sparseFields: options.sparseFields,
        sort: options.sort,
        page: options.page,
        replacePage: options.replacePage,
      });
      if (!page) {
        return undefined;
      }
      if (hasNextLink(page) && !allowPaging) {
        throw new PagingNotAllowedError('The related document is paged, but `allowPaging` is `false`');
      }
      if (!followPaging || !hasNextLink(page)) {
        return page.resources;
      }
      const resources: Resource[] = [];
      while (page) {
        for (const resource of page.resources) {
          resources.push(resource);
        }
        page = hasNextLink(page) ? await page.nextPage() : undefined;
      }
      return resources;
    }

    /**
     * `true` if the referring document contains every linked resource with all fields requested for its type.
     * An empty field list only needs the resource identifier, like in grivetpy.
     * @hidden
     */
    private linkageProvidesFields(
      resourceIdentifiers: Spec.ResourceIdentifierObject[],
      sparseFields: SparseFields,
    ): boolean {
      return resourceIdentifiers.every((rid) => {
        if (!(rid.type in sparseFields) || sparseFields[rid.type].length === 0) {
          return true;
        }
        const fieldNames = sparseFields[rid.type];
        const resourceObjects = this.referringDocument.findResourceObjects(rid.id, rid.type);
        if (resourceObjects.length !== 1) {
          return false;
        }
        const { attributes = {}, relationships = {} } = resourceObjects[0];
        return fieldNames.every((name) => name in attributes || name in relationships);
      });
    }

    /** @hidden */
    private async resolveResources(options: RelatedResourcesOptions): Promise<Resource[]> {
      const sortOrPage =
        (options.sort !== undefined && options.sort.length > 0) ||
        (options.page !== undefined && Object.keys(options.page).length > 0);
      if (sortOrPage) {
        const sorted = await this.resourcesOfRelatedDocument(options);
        if (sorted) {
          return sorted;
        }
        throw new SchemaError('`sort` and `page` require a `links.related` member in the relationship');
      }
      if ('data' in this.rawData && !this.linkageIsPaged) {
        const resourceIdentifiers = this.data;
        if (resourceIdentifiers !== null && resourceIdentifiers !== undefined) {
          if (!Array.isArray(resourceIdentifiers)) {
            throw new CardinalityError(
              'Relationship does not contain an array of resources. Use the `resource` method instead.'
            );
          }
          const sparseFields = options.sparseFields;
          if (sparseFields === undefined || Object.keys(sparseFields).length === 0) {
            return Promise.resolve(
              resourceIdentifiers.map(
                (rid) => new RelatedResource(this.referringDocument, rid.id, rid.type, this.context)
              )
            );
          }
          if (this.linkageProvidesFields(resourceIdentifiers, sparseFields)) {
            // The resources come from the referring document, but documents fetched from them use the requested fields
            const view = new Document(
              this.referringDocument.rawData,
              this.context,
              this.referringDocument.url,
              { ...this.referringDocument.sparseFields, ...sparseFields },
              this.referringDocument.effectiveURL,
            );
            return resourceIdentifiers.map((rid) => new RelatedResource(view, rid.id, rid.type, this.context));
          }
          const fetched = await this.resourcesOfRelatedDocument(options);
          if (fetched) {
            return fetched;
          }
          throw new SchemaError(
            'The included resources lack requested sparse fields and the relationship has no `links.related` member'
          );
        }
      }
      const related = await this.resourcesOfRelatedDocument(options);
      if (related) {
        return related;
      }
      throw new SchemaError(
        'A relationship object relating to a resource must contain a `links.related` or `data` member'
      );
    }

    /**
     * The one {@link Resource} referenced by this relationship.
     * Resource linkage (the resource identifier found in the `data` member of this relationship) has priority.
     * If there is no resource linkage, the primary resource found in {@link relatedDocument} is used.
     * @throws {@link CardinalityError} if there are many resources.
     * @throws SchemaError if neither a `links` nor a `data` member is present
     * @memoized
     */
    @memoized()
    async resource(): Promise<Resource | null | undefined> {
      if ('data' in this.rawData) {
        const resourceIdentifier = this.data;
        if (resourceIdentifier !== null && resourceIdentifier !== undefined) {
          if (Array.isArray(resourceIdentifier)) {
            throw new CardinalityError(
              'Relationship contains more than one resource. Use the `resources` method instead.'
            );
          }
          return Promise.resolve(
            new RelatedResource(this.referringDocument, resourceIdentifier.id, resourceIdentifier.type, this.context)
          );
        }
      }
      const relatedDoc = await this.relatedDocument();
      if (relatedDoc) {
        return relatedDoc.resource;
      }
      if ('data' in this.rawData) {
        const resourceIdentifier = this.data;
        if (resourceIdentifier === null) {
          return null;
        }
        if (resourceIdentifier === undefined) {
          return undefined;
        }
      }
      throw new SchemaError(
        'A relationship object relating to a resource must contain a `links.related` or `data` member'
      );
    }

    /**
     * Works like the {@link resources} method, but prefers the `related` link instead of resource linkage.
     * If no `related` link is present or if the link does not work, it falls back to the {@link resources} method.
     * The options and the paging behavior are the same as for {@link resources}.
     * @throws {@link CardinalityError} if there is only a singular resource.
     * @throws {@link PagingNotAllowedError} if the response is paged and `allowPaging` is `false` (without falling back).
     * @throws SchemaError if neither a `links` nor a `data` member is present
     * @remarks The result is memoized if no options are given.
     */
    async resourcesFromRelatedLink(options: RelatedResourcesOptions = {}): Promise<Resource[]> {
      validateRelatedOptions(options);
      resolveFollowPaging(options);
      if (Object.keys(options).length > 0) {
        return this.resolveResourcesFromRelatedLink(options);
      }
      if (this.cachedResourcesFromRelatedLink === undefined) {
        this.cachedResourcesFromRelatedLink = this.resolveResourcesFromRelatedLink(options);
      }
      return this.cachedResourcesFromRelatedLink;
    }

    /** @hidden */
    private async resolveResourcesFromRelatedLink(options: RelatedResourcesOptions): Promise<Resource[]> {
      try {
        const related = await this.resourcesOfRelatedDocument(options);
        if (related) {
          return related;
        }
      } catch (err) {
        if (err instanceof PagingNotAllowedError) {
          throw err;
        }
      }
      return this.resources(options);
    }

    /**
     * Works like the {@link resource} method, but prefers the `related` link instead of resource linkage.
     * If no `related` link is present or if the link does not work, it falls back to the {@link resource} method.
     * @throws {@link CardinalityError} if there are many resources.
     * @throws SchemaError if neither a `links` nor a `data` member is present
     * @memoized
     */
    @memoized()
    async resourceFromRelatedLink(): Promise<Resource | null | undefined> {
      try {
        const relatedDoc = await this.relatedDocument();
        if (relatedDoc) {
          return relatedDoc.resource;
        }
      } catch (err) {}
      return this.resource();
    }
  }

  /**
   * Some helpers for constructing a document to POST to a server
   *
   * @experimental
   */
  export class ClientDocument {
    private readonly rawData: Spec.ClientJsonApiDocument;

    constructor(resourceType: string, id?: string) {
      this.rawData = { data: { type: resourceType } };
      if (id !== undefined) {
        this.rawData.data.id = id;
      }
    }

    /** Sets a primary resource attribute @experimental */
    setAttribute(name: string, value: string) {
      if (!this.rawData.data.attributes) {
        this.rawData.data.attributes = {};
      }
      this.rawData.data.attributes[name] = value;
    }

    /** Adds a named relationship to a resource @experimental */
    setRelationship(name: string, resourceIdentifier: Spec.ResourceIdentifierObject | Spec.ResourceIdentifierObject[]) {
      if (!this.rawData.data.relationships) {
        this.rawData.data.relationships = {};
      }
      this.rawData.data.relationships[name] = { data: resourceIdentifier };
    }

    /** Adds the resource to `included` @experimental */
    includeResource(resource: Spec.ResourceObject) {
      if (!this.rawData.included) {
        this.rawData.included = [];
      }
      this.rawData.included.push(resource);
    }

    /** Adds the resources to `included` @experimental */
    includeResources(resources: Spec.ResourceObject[]) {
      if (!this.rawData.included) {
        this.rawData.included = [];
      }
      this.rawData.included.push(...resources);
    }

    /** The raw JSON:API data @experimental */
    get data(): Spec.ClientJsonApiDocument {
      return this.rawData;
    }
  }
}
