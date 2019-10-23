import { Spec } from './jsonapiSpec';
import { SchemaError } from './schemaChecker';
import { memoized } from './memoized.decorator';

export { Spec };

/**
 * This is the main module of Grivet.
 *
 * It contains the [[Document]], [[Resource]] and [[Relationship]] classes that
 * perform most of the work interpreting a JSON:API structure.
 *
 * Normally you would start by creating a [[Document]] from existing JSON:API data or using the [[Document.fromURL]]
 * method to fetch data from a server. Then you can examine the resources in that document ([[Document.resource]]
 * or [[Document.resources]]) and traverse to other related resources ([[Resource.relatedResource]] or
 * [[Resource.relatedResources]]).
 *
 * You have to provide an implementation of the [[Context]] interface to specify how documents should be fetched from
 * URLs. The documentation of the [[Context]] interface shows several possible implementations (e.g. using the Angular http client
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
   * Implement this interface to define how a [[JsonApiDocument]] (the JSON:API raw data) is fetched from a given URL.
   *
   * [[include:guides/context.md]]
   */
  export interface Context {
    /**
     * Should return a `Promise` resolving to the JSON:API document for the given `url`
     */
    getDocument(url: URL): Promise<Spec.JsonApiDocument>;
  }

  /** List of fields that should be fetched from the server */
  export type FieldNames = string[];
  /** Mapping from resource type to sparse fields */
  export type SparseFields = { [resourceType: string]: FieldNames };

  /**
   * Holds an `application/vnd.api+json` [document](https://jsonapi.org/format/1.0/#document-top-level) and
   * provides methods to access the resources in that document.
   *
   * This is the main class that acts as an entry point to traverse to other resources.
   * Use the static [[fromURL]] method to fetch and construct a [[Document]] from a given URL.
   *
   * Methods and accessors marked as `memoized` are only executed once per instance (the first time they are called)
   * and return a cached result on subsequent calls.
   *
   * @see https://jsonapi.org/format/1.0/#document-top-level
   */
  export class Document {
    /**
     * Fetch JSON:API data from the given URL and construct a [[Document]] from it.
     *
     * ### Simplest example
     *
     * Fetching a document from a server:
     * ```typescript
     * const articleDoc = await JsonApi.Document.fromURL(new URL('http://example.com/article/1'), context);
     * const article = articleDoc.resource;
     * ```
     * [[include:guides/sparseFieldsets.md]]
     *
     * @param context Context that will provide the JSON:API data, normally by fetching it from a server
     * @param sparseFields Only these fields (per type) are requested from the server
     */
    static async fromURL(url: URL, context: Context, sparseFields?: SparseFields): Promise<Document> {
      for (const resourceType in sparseFields) {
        url.searchParams.append(`fields[${resourceType}]`, sparseFields[resourceType].join(','));
      }
      const rawData = await context.getDocument(url);
      return new Document(rawData, context, url, sparseFields);
    }

    /**
     * Directly construct a [[Document]]. Does not fetch any data from a server.
     * @param rawData The raw JSON:API data describing the document
     * @param context The context to use to fetch related documents (not used during the initial construction)
     * @param url An optional URL can be provided to indicate where the raw data came from
     * @param sparseFields An object listing [sparse fieldsets](https://jsonapi.org/format/1.0/#fetching-sparse-fieldsets) for subsequent fetch operations
     * @throws [[SchemaError]] when the given rawData does not look like a JSON:API document
     */
    constructor(
      readonly rawData: Spec.JsonApiDocument,
      private readonly context: Context,
      public readonly url?: URL,
      public readonly sparseFields?: SparseFields
    ) {
      Spec.checkDocumentSchema(rawData);
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
     * Array of the primary [[Resource]]s in this document. For example the JSON:API document
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
     * @throws [[CardinalityError]] if the document instead only contains a singular resource.
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
        primaryData => new PrimaryResource(primaryData, this, primaryData.type, this.context)
      );
    }

    /**
     * The primary [[Resource]] in this document. For example the JSON:API document
     *
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
     * @throws [[CardinalityError]] if the document instead contains an array of resources.
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
     * Map from type and id to [[RelatedResource]] for all resources under the top level `included` member.
     * For example for the JSON:API document
     *
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
  }

  /** Collection of [[RelatedResource]]s included in a compound document, organized by type and id */
  export type IncludedResourcesMap = { [type: string]: { [id: string]: RelatedResource } };
  /** Mapping from relationship name to [[Relationship]] */
  export type Relationships = { [relationshipName: string]: Relationship };
  /** Mapping from link name to [[Link]] */
  export type Links = { [linkName: string]: Link };

  /** @hidden */
  type RelationshipToResource = { [relationshipName: string]: Promise<Resource> };
  /** @hidden */
  type RelationshipToResources = { [relationshipName: string]: Promise<Resource[]> };
  /** @hidden */
  type RelationshipToDocument = { [relationshipName: string]: Promise<Document> };

  /** @hidden */
  class RelatedResourceAccessor<T extends RelationshipToResource> implements ProxyHandler<T> {
    constructor(private readonly parent: Resource) {}
    /**
     * Provide access to parent related resource
     * @hidden
     */
    async get(target: T, relationshipName: string, receiver: any): Promise<Resource | null | undefined> {
      if (relationshipName in this.parent.relationships) {
        return this.parent.relationships[relationshipName].resource();
      }
    }
  }

  /** @hidden */
  class RelatedResourcesAccessor<T extends RelationshipToResources> implements ProxyHandler<T> {
    constructor(private readonly parent: Resource) {}
    /**
     * Provide access to parent related resources
     * @hidden
     */
    async get(target: T, relationshipName: string, receiver: any): Promise<Resource[]> {
      if (relationshipName in this.parent.relationships) {
        return this.parent.relationships[relationshipName].resources();
      }
      return [];
    }
  }

  /** @hidden */
  class RelatedDocumentAccessor<T extends RelationshipToDocument> implements ProxyHandler<T> {
    constructor(private readonly parent: Resource) {}
    /**
     * Provide access to parent related document
     * @hidden
     */
    async get(target: T, relationshipName: string, receiver: any): Promise<Document | undefined> {
      if (relationshipName in this.parent.relationships) {
        return this.parent.relationships[relationshipName].relatedDocument();
      }
    }
  }

  /**
   * This class represents a [JSON:API resource object](https://jsonapi.org/format/1.0/#document-resource-objects)
   * and is used as base class for [[PrimaryResource]]s and [[RelatedResource]]s.
   *
   * The abstract [[getData]] method is implemented in the derived classes to specify how
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
     * Object containing all [[Relationship]]s defined by this resource
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
     * Object containing all [[Link]]s defined by this resource
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
        result[linkName] = new Link(this.rawData.links[linkName], this.document.url);
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
        result[linkName] = new Link(this.rawData.meta.links[linkName], this.document.url);
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
     * Proxy providing all multiple [[Resource]]s reachable via relationships from this resource.
     * For example, for this JSON:API document
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
     * As this shortcut uses the [[Relationship.resources]] method, it prefers resource linkage (i.e. id/type pairs in `data`)
     * to `related` links should both be present in the relationship. You can use the [[Relationship.resourcesFromRelatedLink]]
     * method if you need to fetch related resources via link instead of resource linkage.
     *
     * As this is only a proxy object, calling `relatedResources` will not yet construct any [[RelatedResource]]
     * instances. Only when accessing a specific related resource (e.g. calling `article.relatedResources['comments']`)
     * are the new resources actually constructed.
     */
    get relatedResources() {
      return new Proxy(<RelationshipToResources>{}, new RelatedResourcesAccessor(this));
    }

    /**
     * Proxy providing all singular [[Resource]]s reachable via relationships from this resource.
     * For example, for this JSON:API document
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
     * As this shortcut uses the [[Relationship.resource]] method, it prefers resource linkage (i.e. id/type pairs in `data`)
     * to `related` links should both be present in the relationship. You can use the [[Relationship.resourceFromRelatedLink]]
     * method if you need to fetch a related resource via link instead of resource linkage.
     *
     * As this is only a proxy object, calling `relatedResource` will not yet construct any [[RelatedResource]]
     * instances. Only when accessing a specific related resource (e.g. calling `article.relatedResource['author']`)
     * is the new resource actually constructed.
     */
    get relatedResource() {
      return new Proxy(<RelationshipToResource>{}, new RelatedResourceAccessor(this));
    }

    /**
     * Proxy providing all [[Document]]s reachable via `related` links in relationships.
     * For example, for this JSON:API document
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
     * As this is only a proxy object, calling `relatedDocuments` does not yet fetch any related documents.
     * Only when accessing a specific related document (e.g. calling `article.relatedDocuments['author']`) is the
     * new document actually requested from the server.
     */
    get relatedDocuments() {
      return new Proxy(<RelationshipToDocument>{}, new RelatedDocumentAccessor(this));
    }
  }

  /**
   * A resource contained in the top level `data` member of a [[Document]].
   *
   * Always constructed non-lazily from raw JSON:API data. Normally this is
   * done automatically when accessing the [[Document.resource]] or [[Document.resources]]
   * accessors, for example:
   *
   * ```typescript
   * // a document containing one _article_ resource
   * const doc = await JsonApi.Document.fromURL(new URL('http://example.com/article'), context);
   * const article = doc.resource;  // the primary resource
   * ```
   *
   * Methods and accessors marked as `memoized` are only executed once per instance (the first time they are called)
   * and return a cached result on subsequent calls.
   */
  export class PrimaryResource extends Resource {
    private readonly pRawData: Spec.ResourceObject;

    /**
     * Directly construct a primary resource. Normally a primary resource is obtained via the [[Document.resource]]
     * or [[Document.resources]] accessors while traversing a document structure.
     * @param rawData The JSON:API resource object from which to construct this primary resource
     * @param document The parent document that contains this primary resource
     * @param resourceType The type of this resource
     * @param context The context to use to fetch related documents
     * @param id The id of this resource
     * @throws [[IdMismatchError]] when the optional `id` argument does not match the id present in `rawData`
     * @throws [[SchemaError]] when `rawData` does not look like a [JSON:API resource object](https://jsonapi.org/format/1.0/#document-resource-objects)
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

  /**
   * A resource contained in the top level `included` member of a [[Document]] or linked via href.
   *
   * This resource is initialized lazily on demand when its [[getData]] method is first called.
   * The resource then looks for its id and type (given at construction) in the parent document
   * `data` and `included` members to find its raw data.
   *
   * Normally a related resource is obtained via the [[Resource.relatedResource]] and [[Resource.relatedResources]]
   * accessors or the [[Relationship.resource]] and [[Relationship.resources]] methods, for example:
   *
   * ```typescript
   * // a document containing one _article_ resource with a related _author_ resource
   * const doc = await JsonApi.Document.fromURL(new URL('http://example.com/article'), context);
   * const article = doc.resource;  // the primary resource
   * const author = await article.relatedResource['author'];  // the related resource
   * ```
   *
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
     * @throws [[IdMismatchError]] when `id` was not found in the given `document`
     */
    constructor(document: Document, id: string, resourceType: string, context: Context) {
      super(document, id, resourceType, context);
    }

    /**
     * Looks up the matching resource in the parent [[Document]]. All primary resources (those in the `data` member)
     * and all included resources (those in the `included` member) are searched.
     * @throws [[IdMismatchError]] if the resource is not found or found multiple times
     * @throws [[SchemaError]] when `rawData` does not look like a [JSON:API resource object](https://jsonapi.org/format/1.0/#document-resource-objects)
     */
    protected getData(): Spec.ResourceObject {
      const primaryDataArray = this.document.hasManyResources
        ? <Spec.ResourceObject[]>this.document.rawData.data
        : [<Spec.ResourceObject>this.document.rawData.data];
      const candidates = primaryDataArray.concat(this.document.rawData.included || []);
      const filtered = candidates.filter(
        resourceObject => resourceObject.type === this.type && resourceObject.id === this.id
      );
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
     * @param rawData Can be a string containing an href or a [[LinkObject]]
     * @param referringDocumentURL The _origin_ part of this URL will be used as prefix if `rawData` only refers to a
     * pathname and not a full URL
     */
    constructor(rawData: Spec.Link, referringDocumentURL?: URL) {
      const origin = referringDocumentURL ? referringDocumentURL.origin : '';
      if (typeof rawData === 'string') {
        try {
          this.url = new URL(rawData);
        } catch (e) {
          this.url = new URL(origin + rawData);
        }
      } else {
        try {
          this.url = new URL(rawData.href);
        } catch (e) {
          this.url = new URL(origin + rawData.href);
        }
        this.meta = rawData.meta;
      }
    }
  }

  /**
   * Defines relations from one [[Resource]] to another (included in the document or external) and can resolve them.
   *
   * This class is normally not used directly. It is used internally in the [[relatedResource]], [[relatedResources]]
   * and [[relatedDocuments]] accessors and you should use those if you just want to gain access to other resources.
   *
   * If you need to work with relationships directly (e.g. to obtain meta data about the relationship itself), you can
   * use the [[Resource.relationships]] accessor.
   *
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
     * @throws [[SchemaError]] when `rawData` does not look like a [JSON:API relationship object](https://jsonapi.org/format/1.0/#document-resource-object-relationships)
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
     * Map of link names to [[Link]]s defined under the `links` member of this relationship
     * @memoized
     */
    @memoized()
    get links(): Links | undefined {
      if (!this.rawData.links) {
        return undefined;
      }
      const result: Links = {};
      for (const linkName in this.rawData.links) {
        result[linkName] = new Link(this.rawData.links[linkName], this.referringDocument.url);
      }
      return result;
    }

    /**
     * One or many [[ResourceIdentifierObject]]s defined in the `data` member of this relationship
     * @memoized
     */
    @memoized()
    get data(): Spec.ResourceIdentifierObject | Spec.ResourceIdentifierObject[] | undefined | null {
      return this.rawData.data;
    }

    /**
     * The [[Document]] referred to by the `related` link in the `links` member of the relationship.
     * Fetches the related document from the server using the context given at construction and respecting any
     * sparseFields of the referring document.
     * @memoized
     */
    @memoized()
    async relatedDocument(): Promise<Document | undefined> {
      if (this.links && 'related' in this.links) {
        return Document.fromURL(this.links['related'].url, this.context, this.referringDocument.sparseFields);
      }
    }

    /**
     * List of [[Resource]]s referenced by this relationship (if there are many resources).
     * Resource linkage (resource identifiers found in the `data` member of this relationship) has priority.
     * If there is no resource linkage, the primary resources found in [[relatedDocument]] are used.
     * @throws [[CardinalityError]] if there is only a singular resource.
     * @throws [[SchemaError]] if neither a `links` nor a `data` member is present
     * @memoized
     */
    @memoized()
    async resources(): Promise<Resource[]> {
      if ('data' in this.rawData) {
        const resourceIdentifiers = this.data;
        if (resourceIdentifiers !== null && resourceIdentifiers !== undefined) {
          if (!Array.isArray(resourceIdentifiers)) {
            throw new CardinalityError(
              'Relationship does not contain an array of resources. Use the `resource` method instead.'
            );
          }
          return Promise.resolve(
            resourceIdentifiers.map(rid => new RelatedResource(this.referringDocument, rid.id, rid.type, this.context))
          );
        }
      }
      const relatedDoc = await this.relatedDocument();
      if (relatedDoc) {
        return relatedDoc.resources;
      }
      throw new SchemaError(
        'A relationship object relating to a resource must contain a `links.related` or `data` member'
      );
    }

    /**
     * The one [[Resource]] referenced by this relationship.
     * Resource linkage (the resource identifier found in the `data` member of this relationship) has priority.
     * If there is no resource linkage, the primary resource found in [[relatedDocument]] is used.
     * @throws [[CardinalityError]] if there are many resources.
     * @throws [[SchemaError]] if neither a `links` nor a `data` member is present
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
     * Works like the [[resources]] method, but prefers the `related` link instead of resource linkage.
     * If no `related` link is present or if the link does not work, it falls back to the [[resources]] method.
     * @throws [[CardinalityError]] if there is only a singular resource.
     * @throws [[SchemaError]] if neither a `links` nor a `data` member is present
     * @memoized
     */
    @memoized()
    async resourcesFromRelatedLink(): Promise<Resource[]> {
      try {
        const relatedDoc = await this.relatedDocument();
        if (relatedDoc) {
          return relatedDoc.resources;
        }
      } catch (err) {}
      return this.resources();
    }

    /**
     * Works like the [[resource]] method, but prefers the `related` link instead of resource linkage.
     * If no `related` link is present or if the link does not work, it falls back to the [[resource]] method.
     * @throws [[CardinalityError]] if there are many resources.
     * @throws [[SchemaError]] if neither a `links` nor a `data` member is present
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
   * @hidden
   */
  export class ClientDocument {
    private readonly rawData: Spec.ClientJsonApiDocument;

    constructor(resourceType: string, id?: string) {
      this.rawData = { data: { type: resourceType } };
      if (id !== undefined) {
        this.rawData.data.id = id;
      }
    }

    /** Sets a primary resource attribute @hidden */
    setAttribute(name: string, value: string) {
      if (!this.rawData.data.attributes) {
        this.rawData.data.attributes = {};
      }
      this.rawData.data.attributes[name] = value;
    }

    /** Adds a named relationship to a resource @hidden */
    setRelationship(
      name: string,
      ressourceIdentifier: Spec.ResourceIdentifierObject | Spec.ResourceIdentifierObject[]
    ) {
      if (!this.rawData.data.relationships) {
        this.rawData.data.relationships = {};
      }
      this.rawData.data.relationships[name] = { data: ressourceIdentifier };
    }

    /** Adds the resource to `included` @hidden */
    includeResource(resource: Spec.ResourceObject) {
      if (!this.rawData.included) {
        this.rawData.included = [];
      }
      this.rawData.included.push(resource);
    }

    /** Adds the resources to `included` @hidden */
    includeResources(resources: Spec.ResourceObject[]) {
      if (!this.rawData.included) {
        this.rawData.included = [];
      }
      this.rawData.included.push(...resources);
    }

    /** The raw JSON:API data @hidden */
    get data(): Spec.ClientJsonApiDocument {
      return this.rawData;
    }
  }
}
