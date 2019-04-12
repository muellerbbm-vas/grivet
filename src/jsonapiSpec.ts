/** @hidden */
import { XOR } from './typeHelpers';
import { SchemaChecker } from './schemaChecker';

/**
 * Types modelling the [JSON:API v1.0](https://jsonapi.org/format/1.0/#document-structure) specification.
 *
 * The type names are chosen to correspond to the language used in the official JSON:API specification.
 */
export namespace Spec {
  /* tslint:disable:completed-docs */

  /**
   * Runtime checks for basic [[JsonApiDocument]] schema
   *
   * @throws [[SchemaError]]
   */
  export function checkDocumentSchema(doc: JsonApiDocument) {
    SchemaChecker.fromData(doc, 'Document')
      .singleObject()
      .atLeastOneOf(['data', 'errors', 'meta'])
      .allowedMembers(['data', 'errors', 'meta', 'jsonapi', 'links', 'included']);
    if ('data' in doc) {
      if (Array.isArray(doc['data'])) {
        for (const r of doc['data'] as object[]) {
          checkResourceObjectSchema(r);
        }
      } else if (doc['data'] !== undefined) {
        checkResourceObjectSchema(doc['data']);
      }
    }
  }

  /**
   * Runtime checks for basic [[ResourceObject]] schema
   * @throws [[SchemaError]]
   */
  export function checkResourceObjectSchema(res: object | null) {
    if (res === null) {
      return;
    }
    SchemaChecker.fromData(res, 'Resource object')
      .singleObject()
      .has(['id', 'type'])
      .allowedMembers(['id', 'type', 'attributes', 'relationships', 'links', 'meta']);
  }

  /**
   * Runtime checks for basic [[RelationshipObject]] schema
   * @throws [[SchemaError]]
   */
  export function checkRelationshipObjectSchema(rel: object) {
    SchemaChecker.fromData(rel, 'Relationship object')
      .singleObject()
      .atLeastOneOf(['links', 'data', 'meta']);
  }

  /**
   * @see https://jsonapi.org/format/1.0/#document-meta
   */
  export type MetaObject = {
    links?: LinksObject;
    [propName: string]: any;
  };

  /**
   * @see https://jsonapi.org/format/1.0/#document-resource-object-attributes
   */
  export type AttributesObject = {
    [attrName: string]: any;
  };

  /**
   * @see https://jsonapi.org/format/1.0/#document-links
   */
  export type LinkObject = {
    href: string;
    meta?: MetaObject;
  };

  /**
   * @see https://jsonapi.org/format/1.0/#document-links
   */
  export type Link = string | LinkObject;

  /**
   * @see https://jsonapi.org/format/1.0/#document-links
   */
  export type LinksObject = {
    [linkName: string]: Link;
  };

  /**
   * @see https://jsonapi.org/format/1.0/#document-top-level
   */
  export type TopLevelLinksObject = {
    self?: Link;
    related?: Link;
    first?: Link | null;
    last?: Link | null;
    prev?: Link | null;
    next?: Link | null;
  };

  /**
   * @see https://jsonapi.org/format/1.0/#document-resource-identifier-objects
   */
  export type ResourceIdentifierObject = {
    id: string;
    type: string;
    meta?: MetaObject;
  };

  /**
   * @see https://jsonapi.org/format/1.0/#document-resource-object-relationships
   */
  export type RelationshipObject = {
    links?: LinksObject;
    data?: ResourceIdentifierObject | ResourceIdentifierObject[] | null;
    meta?: MetaObject;
  };

  /**
   * @see https://jsonapi.org/format/1.0/#document-resource-object-relationships
   */
  export type RelationshipsObject = {
    [relationshipName: string]: RelationshipObject;
  };

  /**
   * @see https://jsonapi.org/format/1.0/#document-resource-objects
   */
  export type ResourceObject = {
    id: string;
    type: string;
    attributes?: AttributesObject;
    relationships?: RelationshipsObject;
    links?: LinksObject;
    meta?: MetaObject;
  };

  /**
   * When sent by the client the id is not required
   *
   * @see https://jsonapi.org/format/1.0/#document-resource-objects
   * @hidden
   */
  export type ClientResourceObject = {
    id?: string;
    type: string;
    attributes?: AttributesObject;
    relationships?: RelationshipsObject;
    links?: LinksObject;
    meta?: MetaObject;
  };

  /**
   * @see https://jsonapi.org/format/1.0/#error-objects
   */
  export type ErrorObject = {
    id?: string;
    links?: LinksObject;
    status?: string;
    code?: string;
    title?: string;
    detail?: string;
    source?: {
      pointer?: string;
      parameter?: string;
      [propName: string]: any;
    };
    meta?: MetaObject;
  };

  /**
   * @see https://jsonapi.org/format/1.0/#document-jsonapi-object
   */
  export type JsonApiObject = {
    version?: string;
    meta?: MetaObject;
  };

  /**
   * This type looks a bit more complicated, as we require either the `data` or `errors` property,
   * but not both at the same time.
   *
   * @see https://jsonapi.org/format/1.0/#document-top-level
   */
  export type JsonApiDocument = XOR<
    { data: ResourceObject | ResourceObject[] | ResourceIdentifierObject | ResourceIdentifierObject[] | null },
    { errors: ErrorObject[] }
  > & {
    meta?: MetaObject;
    jsonapi?: JsonApiObject;
    links?: TopLevelLinksObject;
    included?: ResourceObject[];
  };

  /**
   * Some aspects of an JSON API document which are usually sufficient for client requests
   *
   * @see https://jsonapi.org/format/1.0/#document-top-level
   * @hidden
   */
  export type ClientJsonApiDocument = {
    data: ClientResourceObject;
    included?: ResourceObject[];
  };
}
