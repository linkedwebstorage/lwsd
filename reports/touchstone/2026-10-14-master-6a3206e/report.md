# Touchstone conformance report

**CONFORMANT**: only MUST tests decide conformance (definitions/EXECUTION.md section 9), and 0 failed or ended cantTell. SHOULD and MAY failures are advisory: 0. Inapplicable MUST tests are coverage this run did not have: 7.

| | |
|---|---|
| target | sut |
| base URL | `http://127.0.0.1:39239/lws/harness/` |
| run | `85ddb3ad` |
| started | 2026-10-14T21:33:08.755947415Z |

## Results

| passed | failed | cantTell | inapplicable |
|---:|---:|---:|---:|
| 197 | 0 | 0 | 8 |

## Requirement coverage by level

| level | in catalog | covered | failing |
|---|---:|---:|---:|
| MUST | 189 | 184 | 0 |
| SHOULD | 26 | 22 | 0 |
| MAY | 33 | 19 | 0 |

48 catalog requirements bind only clients, receivers, identity providers or other specifications, which a server run cannot break, so coverage leaves them out.

## Tests

| test | level | outcome | duration |
|---|---|---|---:|
| `core/discovery#discovery-get-links-storageDescription` | MUST | passed | 36 ms |
| `core/discovery#discovery-link-storage-on-data-resource` | MUST | passed | 44 ms |
| `core/discovery#discovery-storage-description` | MUST | passed | 36 ms |
| `core/discovery#discovery-storage-description-default-media-type` | MUST | passed | 36 ms |
| `core/discovery#discovery-unauthorized-response-headers` | SHOULD | passed | 35 ms |
| `core/discovery#discovery-storage-root-is-container` | MUST | passed | 44 ms |
| `core/discovery#discovery-storage-description-ids-are-uris` | MUST | passed | 36 ms |
| `core/containers#getContainer` | MUST | passed | 33 ms |
| `core/containers#createContainer` | MUST | passed | 44 ms |
| `core/containers#createContainer-type-link` | SHOULD | passed | 31 ms |
| `core/containers#getContainer-containmentIntegrity` | MUST | passed | 48 ms |
| `core/containers#container-total-items-accurate` | SHOULD | passed | 63 ms |
| `core/containers#contained-resource-type-values` | MUST | passed | 59 ms |
| `core/containers#contained-resource-format` | MUST | passed | 39 ms |
| `core/containers#contained-resource-size-modified` | SHOULD | passed | 41 ms |
| `core/containers#container-conneg` | MUST | passed | 50 ms |
| `core/containers#container-conneg-vary` | SHOULD | passed | 2 ms |
| `core/containers#container-conneg-weighted` | MUST | passed | 21 ms |
| `core/containers#container-head-parity` | MUST | passed | 32 ms |
| `core/containers#delete-empty-container` | MUST | passed | 29 ms |
| `core/containers#delete-non-empty-container-409` | MUST | passed | 46 ms |
| `core/containers#delete-container-recursive` | MAY | passed | 48 ms |
| `core/containers#delete-container-recursive-deep` | MAY | passed | 51 ms |
| `core/containers#containment-hierarchy-consistent` | MUST | passed | 7 ms |
| `core/containers#container-ld-json-lws-profile` | SHOULD | passed | 20 ms |
| `core/data_resources#createDataResource` | MUST | passed | 30 ms |
| `core/data_resources#createDataResource-type-link` | SHOULD | passed | 26 ms |
| `core/data_resources#create-post-twice-distinct` | SHOULD | passed | 39 ms |
| `core/data_resources#create-in-missing-container-rejected` | MUST | passed | 23 ms |
| `core/data_resources#create-in-missing-container-404` | SHOULD | passed | 18 ms |
| `core/data_resources#create-server-managed-links-protected` | MUST | passed | 30 ms |
| `core/data_resources#readDataResource` | MUST | passed | 30 ms |
| `core/data_resources#data-resource-head-parity` | MUST | passed | 2 ms |
| `core/data_resources#data-resource-range-request` | MUST | passed | 32 ms |
| `core/data_resources#data-resource-range-unsatisfiable` | SHOULD | passed | 21 ms |
| `core/data_resources#data-resource-accept-ranges` | MAY | passed | 27 ms |
| `core/data_resources#updateDataResource` | MUST | passed | 31 ms |
| `core/data_resources#patch-json-patch-baseline` | MUST | passed | 31 ms |
| `core/data_resources#patch-json-patch-atomic` | MUST | passed | 26 ms |
| `core/data_resources#deleteDataResource` | MUST | passed | 26 ms |
| `core/data_resources#post-to-non-container-405` | SHOULD | passed | 26 ms |
| `core/data_resources#error-problem-details` | SHOULD | passed | 16 ms |
| `core/conditional_requests#conditional-get-304` | SHOULD | passed | 24 ms |
| `core/conditional_requests#conditional-get-container-304` | SHOULD | passed | 15 ms |
| `core/conditional_requests#conditional-get-stale-validator-200` | MUST | passed | 35 ms |
| `core/conditional_requests#conditional-put-stale-if-match-412` | MUST | passed | 33 ms |
| `core/conditional_requests#conditional-delete-stale-if-match-412` | SHOULD | passed | 31 ms |
| `core/conditional_requests#update-changes-strong-etag` | MUST | passed | 31 ms |
| `core/conditional_requests#delete-updates-parent-strong-etag` | MUST | passed | 29 ms |
| `core/conditional_requests#conditional-get-if-modified-since-304` | SHOULD | passed | 29 ms |
| `core/conditional_requests#conditional-get-if-unmodified-since-412` | SHOULD | passed | 29 ms |
| `core/linksets#getLinkset` | MUST | passed | 34 ms |
| `core/linksets#linkset-advertises-patch` | MUST | passed | 26 ms |
| `core/linksets#linkset-conditional-412` | MUST | passed | 28 ms |
| `core/linksets#linkset-put-405-when-unsupported` | MUST | passed | 34 ms |
| `core/linksets#linkset-removed-with-resource` | MUST | passed | 28 ms |
| `core/linksets#linkset-ready-at-create` | MUST | passed | 25 ms |
| `core/linksets#linkset-up-not-redirected` | MUST | passed | 36 ms |
| `core/linksets#linkset-patch-stays-linkset` | MUST | passed | 29 ms |
| `core/linksets#linkset-patch-json-patch` | SHOULD | passed | 37 ms |
| `core/storage_authorization#getContainer-private-unauthorized` | MUST | passed | 14 ms |
| `core/storage_authorization#getContainer-authenticated-owner` | MUST | passed | 13 ms |
| `core/storage_authorization#createDataResource-unauthorized` | MUST | passed | 17 ms |
| `core/storage_authorization#updateDataResource-unauthorized` | MUST | passed | 26 ms |
| `core/storage_authorization#deleteDataResource-unauthorized` | MUST | passed | 25 ms |
| `core/storage_authorization#authz-non-owner-read-rejected` | MUST | passed | 13 ms |
| `core/storage_authorization#authz-non-owner-write-rejected` | MUST | passed | 31 ms |
| `core/storage_authorization#authz-non-owner-delete-rejected` | MUST | passed | 25 ms |
| `core/storage_authorization#authz-expired-token-rejected` | MUST | passed | 14 ms |
| `core/storage_authorization#authz-token-bad-signature-rejected` | MUST | passed | 14 ms |
| `core/storage_authorization#authz-token-alg-none-rejected` | MUST | passed | 39 ms |
| `core/storage_authorization#authz-token-unknown-key-rejected` | MUST | passed | 16 ms |
| `core/storage_authorization#authz-token-wrong-audience-rejected` | MUST | passed | 13 ms |
| `core/storage_authorization#authz-token-wrong-issuer-rejected` | MUST | passed | 13 ms |
| `core/storage_authorization#authz-token-not-yet-valid-rejected` | MUST | passed | 13 ms |
| `core/storage_authorization#authz-token-issued-in-future-rejected` | MUST | passed | 13 ms |
| `core/storage_authorization#authz-token-multiple-audiences-rejected` | MUST | passed | 13 ms |
| `core/authorization_server#authz-server-metadata-well-known` | MUST | passed | 12 ms |
| `core/authorization_server#authz-metadata-subject-token-types` | SHOULD | passed | 12 ms |
| `core/authorization_server#authz-metadata-subject-token-types-are-uris` | MUST | passed | 13 ms |
| `core/authorization_server#authz-metadata-subject-identifier-types` | SHOULD | passed | 13 ms |
| `core/authorization_server#authz-token-exchange-valid` | MUST | passed | 23 ms |
| `core/authorization_server#authz-token-exchange-invalid-resource` | MUST | passed | 14 ms |
| `core/authorization_server#authz-token-exchange-missing-resource` | MUST | passed | 16 ms |
| `core/authorization_server#authz-token-exchange-missing-subject-token` | MUST | passed | 14 ms |
| `core/authorization_server#authz-issued-token-accepted-by-storage` | MUST | passed | 25 ms |
| `core/access_grants#access-grant-endpoint-is-container` | MUST | passed | 13 ms |
| `core/access_grants#access-grant-create` | MUST | passed | 26 ms |
| `core/access_grants#access-grant-revoke` | SHOULD | passed | 37 ms |
| `core/access_grants#getContainer-public-read` | MUST | passed | 41 ms |
| `core/access_grants#readDataResource-public-read` | MUST | passed | 9 ms |
| `core/access_grants#access-grant-authenticated-agent` | MUST | passed | 45 ms |
| `core/access_grants#access-grant-extra-properties-accepted` | MAY | passed | 43 ms |
| `core/access_grants#access-grant-inbox-notified` | SHOULD | passed | 2036 ms |
| `core/access_grants#access-request-create` | MUST | passed | 29 ms |
| `core/access_grants#access-grant-document-shape` | MUST | passed | 23 ms |
| `core/access_grants#access-grant-incomplete-refused` | MUST | passed | 55 ms |
| `core/access_grants#access-grant-constraints-all-satisfied` | MUST | passed | 48 ms |
| `core/access_grants#access-grant-left-operands-accepted` | MUST | passed | 65 ms |
| `core/access_grants#access-grant-constraint-format` | MUST | passed | 50 ms |
| `core/access_grants#access-grant-constraint-type` | MUST | passed | 51 ms |
| `core/access_grants#access-grant-constraint-client` | MUST | passed | 42 ms |
| `core/access_grants#container-listing-filtered-metadata` | MAY | passed | 53 ms |
| `core/notifications#notification-service-advertised` | MUST | passed | 21 ms |
| `core/notifications#subscription-create` | MUST | passed | 22 ms |
| `core/notifications#subscription-missing-type-refused` | MUST | passed | 14 ms |
| `core/notifications#subscription-unadvertised-type-refused` | MUST | passed | 12 ms |
| `core/notifications#subscription-missing-topic-refused` | MUST | passed | 12 ms |
| `core/notifications#subscription-unreadable-topic-refused` | MUST | passed | 34 ms |
| `core/notifications#subscription-after-revocation-refused` | MUST | passed | 37 ms |
| `core/notifications#notification-delivered-create` | MUST | passed | 2096 ms |
| `core/notifications#notification-delivered-update` | MUST | passed | 2021 ms |
| `core/notifications#notification-delivered-delete` | MUST | passed | 2024 ms |
| `core/notifications#notification-not-delivered-for-unreadable-resource` | MUST | inapplicable | 42 ms |
| `core/notifications#notification-stops-after-revocation` | MUST | passed | 4037 ms |
| `core/notifications#notification-actor-omitted` | SHOULD | passed | 2099 ms |
| `core/notifications#notification-delivered-in-subcontainer` | MUST | passed | 2101 ms |
| `core/notifications#notification-scope-data-resource-only` | MUST | passed | 2075 ms |
| `core/pagination#pagination-first-page` | MUST | passed | 40 ms |
| `core/pagination#pagination-next-page` | MUST | passed | 43 ms |
| `core/pagination#pagination-single-page` | MUST | inapplicable | 36 ms |
| `core/pagination#pagination-last-page` | MUST | passed | 33 ms |
| `core/pagination#pagination-totalitems-all-pages` | SHOULD | passed | 33 ms |
| `auth/oidc/manifest#authn-oidc-valid-id-token` | MUST | passed | 136 ms |
| `auth/oidc/manifest#authn-oidc-expired-id-token` | MUST | passed | 5 ms |
| `auth/oidc/manifest#authn-oidc-alg-none` | MUST | passed | 15 ms |
| `auth/oidc/manifest#authn-oidc-bad-signature` | MUST | passed | 129 ms |
| `auth/oidc/manifest#authn-oidc-untrusted-issuer` | MUST | passed | 45 ms |
| `auth/oidc/manifest#authn-oidc-missing-azp` | MUST | passed | 5 ms |
| `auth/cid/manifest#authn-cid-valid-credential` | MUST | passed | 9 ms |
| `auth/cid/manifest#authn-cid-unknown-kid` | MUST | passed | 4 ms |
| `auth/cid/manifest#authn-cid-bad-signature` | MUST | passed | 3 ms |
| `auth/cid/manifest#authn-cid-expired` | MUST | passed | 2 ms |
| `auth/cid/manifest#authn-cid-alg-none` | MUST | passed | 6 ms |
| `auth/cid/manifest#authn-cid-claims-mismatch` | MUST | passed | 5 ms |
| `auth/cid/manifest#authn-cid-document-id-mismatch` | MUST | passed | 49 ms |
| `auth/cid/manifest#authn-cid-key-not-for-authentication` | MUST | passed | 7 ms |
| `auth/cid/manifest#authn-cid-key-revoked` | MUST | passed | 6 ms |
| `auth/cid/manifest#authn-cid-foreign-controller` | MUST | passed | 7 ms |
| `auth/cid/manifest#authn-cid-referenced-method` | MUST | passed | 47 ms |
| `auth/cid/manifest#authn-cid-didkey-valid-credential` | MUST | passed | 5 ms |
| `auth/cid/manifest#authn-cid-didkey-invalid-signature` | MUST | passed | 4 ms |
| `auth/cid/manifest#authn-cid-didkey-alg-none` | MUST | passed | 3 ms |
| `auth/cid/manifest#authn-cid-didkey-expired` | MUST | passed | 3 ms |
| `auth/cid/manifest#authn-cid-didkey-claims-mismatch` | MUST | passed | 3 ms |
| `auth/cid/manifest#authn-cid-didkey-audience-excludes-as` | MUST | passed | 3 ms |
| `auth/cid/manifest#authn-cid-didkey-missing-exp` | MUST | passed | 3 ms |
| `auth/cid/manifest#authn-cid-didkey-missing-iat` | MUST | passed | 6 ms |
| `auth/cid/manifest#authn-cid-didkey-missing-subject` | MUST | passed | 5 ms |
| `auth/cid/manifest#authn-cid-didkey-missing-issuer` | MUST | passed | 5 ms |
| `auth/cid/manifest#authn-cid-didkey-missing-client-id` | MUST | passed | 3 ms |
| `auth/saml/manifest#authn-saml-valid-assertion` | MUST | inapplicable | 0 ms |
| `auth/saml/manifest#authn-saml-invalid-signature` | MUST | inapplicable | 0 ms |
| `auth/saml/manifest#authn-saml-unsigned` | MUST | inapplicable | 0 ms |
| `notifications/webhook/manifest#webhook-subscription-response` | MUST | passed | 3 ms |
| `notifications/webhook/manifest#webhook-subscription-expires-supported` | MUST | passed | 5 ms |
| `notifications/webhook/manifest#webhook-subscription-listed` | MUST | passed | 8 ms |
| `notifications/webhook/manifest#webhook-subscription-get-delete` | MUST | passed | 3 ms |
| `notifications/webhook/manifest#webhook-delivery-lws-json` | MUST | passed | 2047 ms |
| `notifications/webhook/manifest#webhook-delivery-signed` | SHOULD | passed | 2126 ms |
| `notifications/webhook/manifest#webhook-signature-components` | MUST | passed | 2088 ms |
| `notifications/webhook/manifest#webhook-signing-key-published` | MUST | passed | 2127 ms |
| `notifications/webhook/manifest#webhook-signature-verifies` | MUST | passed | 2131 ms |
| `notifications/webhook/manifest#webhook-delivery-retried` | MAY | passed | 3048 ms |
| `notifications/webhook/manifest#webhook-subscription-deactivated` | MAY | passed | 11 ms |
| `index/manifest#index-services-advertised` | MUST | passed | 2 ms |
| `index/manifest#type-index-lists-readable-types` | MUST | passed | 6 ms |
| `index/manifest#type-index-omits-unreadable-type` | MUST | passed | 6 ms |
| `index/manifest#type-index-not-shared` | MUST | passed | 3 ms |
| `index/manifest#type-search-by-type` | MUST | passed | 3 ms |
| `index/manifest#type-search-and-or` | MUST | passed | 7 ms |
| `index/manifest#type-search-native-classes` | MUST | passed | 4 ms |
| `index/manifest#type-search-no-match` | MUST | passed | 2 ms |
| `index/manifest#type-search-duplicate-groups` | MUST | passed | 4 ms |
| `index/manifest#type-search-at-members-ignored` | MUST | passed | 5 ms |
| `index/manifest#type-search-empty-key-absent` | MUST | passed | 3 ms |
| `index/manifest#type-search-empty-group-rejected` | MUST | passed | 2 ms |
| `index/manifest#type-search-type-not-array-rejected` | MUST | passed | 2 ms |
| `index/manifest#type-search-bad-element-rejected` | MUST | passed | 2 ms |
| `index/manifest#type-search-malformed-json-rejected` | MUST | passed | 2 ms |
| `index/manifest#type-search-relative-iri-rejected` | MUST | passed | 2 ms |
| `index/manifest#type-search-missing-content-type-rejected` | MUST | passed | 2 ms |
| `index/manifest#type-search-unsupported-format-rejected` | MUST | passed | 2 ms |
| `index/manifest#type-search-unsupported-format-accept-query` | SHOULD | passed | 3 ms |
| `index/manifest#type-search-accept-query-advertised` | SHOULD | passed | 2 ms |
| `index/manifest#type-search-not-acceptable` | MUST | passed | 2 ms |
| `index/manifest#type-search-unindexed-relation` | MUST | passed | 5 ms |
| `index/manifest#type-search-structural-relation-not-indexed` | MUST | passed | 3 ms |
| `index/manifest#type-search-authorization-filtered` | MUST | passed | 9 ms |
| `index/manifest#type-search-revoked-not-shown` | MUST | passed | 9 ms |
| `index/manifest#type-search-not-shared` | MUST | passed | 2 ms |
| `index/manifest#type-search-type-from-link-header` | SHOULD | passed | 8 ms |
| `index/manifest#type-search-type-from-content` | MAY | passed | 3 ms |
| `index/manifest#type-search-content-types-identical` | MUST | passed | 10 ms |
| `index/manifest#type-search-reflects-update` | SHOULD | inapplicable | 3 ms |
| `index/manifest#type-search-reflects-delete` | SHOULD | passed | 3 ms |
| `index/manifest#type-search-vary-accept` | MUST | passed | 2 ms |
| `index/manifest#type-search-safe` | MAY | passed | 5 ms |
| `index/manifest#type-search-next-page` | MUST | passed | 7 ms |
| `index/manifest#type-search-relation-filter` | MAY | passed | 4 ms |
| `index/manifest#type-search-relation-cnf` | MAY | passed | 8 ms |
| `index/manifest#type-search-relation-from-link-header` | SHOULD | passed | 6 ms |
| `index/manifest#type-search-too-complex` | MUST | passed | 3 ms |
| `index/manifest#type-search-unrecognized-page-link` | MUST | inapplicable | 2 ms |
| `index/manifest#type-search-content-location-protected` | MUST | inapplicable | 3 ms |

### Detail

**`core/notifications#notification-not-delivered-for-unreadable-resource`** — inapplicable

```
core/notifications#notification-not-delivered-for-unreadable-resource - inapplicable [MUST] (42 ms)
  inapplicable: precondition 'bob cannot read it (otherwise access to the container reaches its members, and this test does not apply)' does not hold: status code expected 403 or 404, got 200
  step 'bob cannot read it (otherwise access to the container reaches its members, and this test does not apply)':
    FAILED status code
      expected: 403 or 404
      actual:   200
    exchange: GET http://127.0.0.1:39239/lws/harness/touchstone-run-85ddb3ad/notification-not-delivered-for-unreadable-resource/box/resource-mv8mmera -> 200
    response body: not for bob
```

**`core/pagination#pagination-single-page`** — inapplicable

```
core/pagination#pagination-single-page - inapplicable [MUST] (36 ms)
  inapplicable: precondition 'the listing is paginated and holds all five members on its page (otherwise this test does not apply)' does not hold: json /items/4 selects a value expected a value at /items/4, got nothing
  step 'the listing is paginated and holds all five members on its page (otherwise this test does not apply)':
    FAILED json /items/4 selects a value
      expected: a value at /items/4
      actual:   nothing
    exchange: GET http://127.0.0.1:39239/lws/harness/touchstone-run-85ddb3ad/pagination-single-page/paged/ -> 200
    response body: {"@context":"https://www.w3.org/ns/lws/v1","id":"/lws/harness/touchstone-run-85ddb3ad/pagination-single-page/paged/","type":"Container","totalItems":5,"items":[{"type":"DataResource","id":"/lws/harness/touchstone-run-85ddb3ad/pagination-single-page/paged/resource-mv8mmer6","format":"text/plain","size":8,"modified":"2026-10-14T21:33:09.044Z"},{"type":"DataResource","id":"/lws/harness/touchstone-run-85ddb3ad/pagination-single-page/paged/resource-mv8mmera","format":"text/plain","size":8,"modified":"2026-10-14T21:33:09.047Z"},{"type":"DataResource","id":"/lws/harness/touchstone-run-85ddb3ad/pagination-single-page/paged/resource-mv8mmere","format":"text/plain","size":8,"modified":"2026-10-14T21:33:09.051Z"},{"type":"DataResource","id":"/lws/harness/touchstone-run-85ddb3ad/pagination-single-page/paged/resource-mv8mmerh","format":"text/plain","size":8,"modified":"2026-10-14T21:33:09.054Z"}]}
```

**`auth/saml/manifest#authn-saml-valid-assertion`** — inapplicable

```
auth/saml/manifest#authn-saml-valid-assertion - inapplicable [MUST]
  inapplicable: the target does not declare SamlTrust
```

**`auth/saml/manifest#authn-saml-invalid-signature`** — inapplicable

```
auth/saml/manifest#authn-saml-invalid-signature - inapplicable [MUST]
  inapplicable: the target does not declare SamlTrust
```

**`auth/saml/manifest#authn-saml-unsigned`** — inapplicable

```
auth/saml/manifest#authn-saml-unsigned - inapplicable [MUST]
  inapplicable: the target does not declare SamlTrust
```

**`index/manifest#type-search-reflects-update`** — inapplicable

```
index/manifest#type-search-reflects-update - inapplicable [SHOULD] (3 ms)
  inapplicable: precondition 'replace it with a resource of type Beta, its Link headers replacing its linkset (otherwise the server does no combined updates, and this test does not apply)' does not hold: header Preference-Applied matches expected matches /(?i)(^|[,\s])set-linkset\s*($|[,;=])/, got absent
  step 'replace it with a resource of type Beta, its Link headers replacing its linkset (otherwise the server does no combined updates, and this test does not apply)':
    FAILED header Preference-Applied matches
      expected: matches /(?i)(^|[,\s])set-linkset\s*($|[,;=])/
      actual:   absent
    exchange: PUT http://127.0.0.1:39239/lws/harness/touchstone-run-85ddb3ad/type-search-reflects-update/resource-mv8mmewy -> 204
```

**`index/manifest#type-search-unrecognized-page-link`** — inapplicable

```
index/manifest#type-search-unrecognized-page-link - inapplicable [MUST] (2 ms)
  inapplicable: precondition 'a search names its first page (otherwise this test does not apply)' does not hold: Link rel="first" expected a matching link, got no Link
  step 'a search names its first page (otherwise this test does not apply)':
    FAILED Link rel="first"
      expected: a matching link
      actual:   no Link
    exchange: QUERY http://127.0.0.1:39239/lws/-/types/search -> 200
    response body: {"@context":"https://www.w3.org/ns/lws/v1","type":"ContainerPage","totalItems":0,"items":[]}
```

**`index/manifest#type-search-content-location-protected`** — inapplicable

```
index/manifest#type-search-content-location-protected - inapplicable [MUST] (3 ms)
  inapplicable: precondition 'the search response names a result resource (otherwise this test does not apply)' does not hold: header Content-Location present expected present, got absent
  step 'the search response names a result resource (otherwise this test does not apply)':
    FAILED header Content-Location present
      expected: present
      actual:   absent
    exchange: QUERY http://127.0.0.1:39239/lws/-/types/search -> 200
    response body: {"@context":"https://www.w3.org/ns/lws/v1","type":"ContainerPage","totalItems":1,"items":[{"id":"/lws/harness/touchstone-run-85ddb3ad/type-search-content-location-protected/resource-mv8mmexm","type":["DataResource","http://127.0.0.1:39239/lws/harness/touchstone-run-85ddb3ad/type-search-content-location-protected/#ContentLocationProtectedSecret"]}]}
```

## Requirement matrix

| requirement | level | result | tests |
|---|---|---|---:|
| [`id-token-alg-not-none`](https://www.w3.org/TR/lws10-authn-openid/#serialization) | MUST | PASS | 1 |
| [`id-token-aud-claim`](https://www.w3.org/TR/lws10-authn-openid/#serialization) | MUST | PASS | 1 |
| [`id-token-azp-claim`](https://www.w3.org/TR/lws10-authn-openid/#serialization) | MUST | PASS | 2 |
| [`id-token-iss-claim`](https://www.w3.org/TR/lws10-authn-openid/#serialization) | MUST | PASS | 1 |
| [`id-token-sub-claim`](https://www.w3.org/TR/lws10-authn-openid/#serialization) | MUST | PASS | 1 |
| [`id-token-token-type-uri`](https://www.w3.org/TR/lws10-authn-openid/#token-type) | MUST | PASS | 1 |
| [`validation-dereference-subject-cid`](https://www.w3.org/TR/lws10-authn-openid/#validation) | MUST | PASS | 2 |
| [`validation-locate-issuer-service-and-verify`](https://www.w3.org/TR/lws10-authn-openid/#validation) | MUST | PASS | 4 |
| [`audience-restriction`](https://www.w3.org/TR/lws10-authn-saml/#serialization) | MUST | INAPPLICABLE | 1 |
| [`issuer-assertion`](https://www.w3.org/TR/lws10-authn-saml/#serialization) | MUST | INAPPLICABLE | 1 |
| [`nameid-subject`](https://www.w3.org/TR/lws10-authn-saml/#serialization) | MUST | INAPPLICABLE | 1 |
| [`recipient-client-id`](https://www.w3.org/TR/lws10-authn-saml/#serialization) | MUST | INAPPLICABLE | 1 |
| [`signed-and-required-assertions`](https://www.w3.org/TR/lws10-authn-saml/#serialization) | MUST | INAPPLICABLE | 2 |
| [`token-type-saml2`](https://www.w3.org/TR/lws10-authn-saml/#token-type) | MUST | INAPPLICABLE | 1 |
| [`validation-signature`](https://www.w3.org/TR/lws10-authn-saml/#validation) | MUST | INAPPLICABLE | 2 |
| [`alg-not-none`](https://www.w3.org/TR/lws10-authn-ssi-cid/#serialization) | MUST | PASS | 2 |
| [`aud-includes-as`](https://www.w3.org/TR/lws10-authn-ssi-cid/#serialization) | MUST | PASS | 3 |
| [`client-id-claim`](https://www.w3.org/TR/lws10-authn-ssi-cid/#serialization) | MUST | PASS | 2 |
| [`exp-claim`](https://www.w3.org/TR/lws10-authn-ssi-cid/#serialization) | MUST | PASS | 3 |
| [`iat-claim`](https://www.w3.org/TR/lws10-authn-ssi-cid/#serialization) | MUST | PASS | 3 |
| [`iss-claim`](https://www.w3.org/TR/lws10-authn-ssi-cid/#serialization) | MUST | PASS | 2 |
| [`sub-claim`](https://www.w3.org/TR/lws10-authn-ssi-cid/#serialization) | MUST | PASS | 2 |
| [`sub-iss-client-same-uri`](https://www.w3.org/TR/lws10-authn-ssi-cid/#serialization) | MUST | PASS | 7 |
| [`token-type-jwt`](https://www.w3.org/TR/lws10-authn-ssi-cid/#token-type) | MUST | PASS | 2 |
| [`validation-all-claims`](https://www.w3.org/TR/lws10-authn-ssi-cid/#validation) | MUST | PASS | 8 |
| [`validation-dereference-sub-cid`](https://www.w3.org/TR/lws10-authn-ssi-cid/#validation) | MUST | PASS | 4 |
| [`validation-exp-in-future`](https://www.w3.org/TR/lws10-authn-ssi-cid/#validation) | MUST | PASS | 4 |
| [`validation-kid-verification-method`](https://www.w3.org/TR/lws10-authn-ssi-cid/#validation) | MUST | PASS | 9 |
| [`validation-reject-alg-none`](https://www.w3.org/TR/lws10-authn-ssi-cid/#validation) | MUST | PASS | 1 |
| [`access-access-collection`](https://www.w3.org/TR/lws10-core/#access-property) | MUST | PASS | 2 |
| [`access-access-required`](https://www.w3.org/TR/lws10-core/#access-property) | MUST | PASS | 2 |
| [`access-endpoints-are-lws-containers`](https://www.w3.org/TR/lws10-core/#access-protocol) | MUST | PASS | 1 |
| [`access-endpoints-get-post-delete`](https://www.w3.org/TR/lws10-core/#access-protocol) | SHOULD | PASS | 1 |
| [`access-endpoints-jsonld-payloads`](https://www.w3.org/TR/lws10-core/#access-protocol) | MUST | PASS | 1 |
| [`access-extra-properties-allowed`](https://www.w3.org/TR/lws10-core/#access-data-model) | MAY | PASS | 1 |
| [`access-inbox-notifications`](https://www.w3.org/TR/lws10-core/#access-notifications) | SHOULD | PASS | 1 |
| [`access-inbox-optional`](https://www.w3.org/TR/lws10-core/#access-inbox-property) | MAY | PASS | 1 |
| [`access-inbox-uri`](https://www.w3.org/TR/lws10-core/#access-inbox-property) | MUST | PASS | 1 |
| [`access-jsonld-context-lws-v1`](https://www.w3.org/TR/lws10-core/#json-ld-serialization) | MUST | PASS | 1 |
| [`access-notification-data-model`](https://www.w3.org/TR/lws10-core/#access-notifications) | MUST | PASS | 1 |
| [`access-notification-delivery`](https://www.w3.org/TR/lws10-core/#access-notifications) | MUST | PASS | 1 |
| [`access-notification-events`](https://www.w3.org/TR/lws10-core/#access-notification-events) | SHOULD | PASS | 1 |
| [`access-notify-grant-created`](https://www.w3.org/TR/lws10-core/#access-notification-events) | SHOULD | UNCOVERED | 0 |
| [`access-notify-other-events`](https://www.w3.org/TR/lws10-core/#access-notification-events) | MAY | UNCOVERED | 0 |
| [`access-notify-request-created`](https://www.w3.org/TR/lws10-core/#access-notification-events) | SHOULD | UNCOVERED | 0 |
| [`access-post-location-header`](https://www.w3.org/TR/lws10-core/#access-protocol) | MUST | PASS | 2 |
| [`access-services-advertised`](https://www.w3.org/TR/lws10-core/#access-discovery) | MUST | PASS | 1 |
| [`access-storage-required`](https://www.w3.org/TR/lws10-core/#access-storage-property) | MUST | PASS | 2 |
| [`access-storage-uri`](https://www.w3.org/TR/lws10-core/#access-storage-property) | MUST | PASS | 1 |
| [`access-type-required`](https://www.w3.org/TR/lws10-core/#access-type-property) | MUST | PASS | 2 |
| [`access-type-values`](https://www.w3.org/TR/lws10-core/#access-type-property) | MUST | PASS | 2 |
| [`authn-audience-restriction-recommended`](https://www.w3.org/TR/lws10-core/#authentication-data-model) | SHOULD | PASS | 1 |
| [`authn-client-claim`](https://www.w3.org/TR/lws10-core/#authentication-data-model) | MUST | PASS | 2 |
| [`authn-credential-signed`](https://www.w3.org/TR/lws10-core/#authentication-validation) | MUST | PASS | 8 |
| [`authn-credential-tamper-evident-claims`](https://www.w3.org/TR/lws10-core/#authentication-data-model) | MUST | PASS | 3 |
| [`authn-issuer-claim-uri`](https://www.w3.org/TR/lws10-core/#authentication-data-model) | MUST | PASS | 1 |
| [`authn-issuer-trust-out-of-band`](https://www.w3.org/TR/lws10-core/#authentication-validation) | MAY | UNCOVERED | 0 |
| [`authn-subject-claim-uri`](https://www.w3.org/TR/lws10-core/#authentication-data-model) | MUST | PASS | 1 |
| [`authn-suite-token-type-uri`](https://www.w3.org/TR/lws10-core/#authentication-type-identifier) | MUST | PASS | 1 |
| [`authz-401-www-authenticate-challenge`](https://www.w3.org/TR/lws10-core/#authorization-server-discovery) | MUST | PASS | 4 |
| [`authz-access-token-aud-claim`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-response) | MUST | PASS | 3 |
| [`authz-access-token-client-id-claim`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-response) | MUST | PASS | 1 |
| [`authz-access-token-exp-short-lived`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-response) | MUST | PASS | 1 |
| [`authz-access-token-iat-claim`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-response) | MUST | PASS | 1 |
| [`authz-access-token-iss-claim`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-response) | MUST | PASS | 2 |
| [`authz-access-token-jti-claim`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-response) | MUST | PASS | 1 |
| [`authz-access-token-sub-claim`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-response) | MUST | PASS | 1 |
| [`authz-bearer-presentation-rfc6750`](https://www.w3.org/TR/lws10-core/#authorization-token-validation-presentation) | MUST | PASS | 1 |
| [`authz-challenge-as-uri-param`](https://www.w3.org/TR/lws10-core/#authorization-server-discovery) | MUST | PASS | 1 |
| [`authz-challenge-extra-params`](https://www.w3.org/TR/lws10-core/#authorization-server-discovery) | MAY | UNCOVERED | 0 |
| [`authz-challenge-realm-param`](https://www.w3.org/TR/lws10-core/#authorization-server-discovery) | MUST | PASS | 1 |
| [`authz-invalid-token-401-error-param`](https://www.w3.org/TR/lws10-core/#authorization-token-validation-verification) | MUST | PASS | 2 |
| [`authz-jwt-signature-jwks-rotation`](https://www.w3.org/TR/lws10-core/#authorization-token-validation-verification) | MUST | PASS | 4 |
| [`authz-metadata-subject-identifier-types`](https://www.w3.org/TR/lws10-core/#authorization-server-metadata) | SHOULD | PASS | 1 |
| [`authz-metadata-subject-token-types`](https://www.w3.org/TR/lws10-core/#authorization-server-metadata) | SHOULD | PASS | 2 |
| [`authz-oauth2-baseline`](https://www.w3.org/TR/lws10-core/#authorization) | MAY | UNCOVERED | 0 |
| [`authz-policy-denial-rejected`](https://www.w3.org/TR/lws10-core/#authorization-token-validation-verification) | MUST | PASS | 4 |
| [`authz-server-metadata-well-known`](https://www.w3.org/TR/lws10-core/#authorization-server-metadata) | MUST | PASS | 1 |
| [`authz-token-error-rfc6749`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-response) | MUST | PASS | 3 |
| [`authz-token-exchange-grant`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-request) | MUST | PASS | 2 |
| [`authz-token-exchange-resource-param`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-request) | MUST | PASS | 3 |
| [`authz-token-exchange-subject-token-param`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-request) | MUST | PASS | 2 |
| [`authz-token-response-rfc6749-rfc9068`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-response) | MUST | PASS | 1 |
| [`authz-token-validation-checklist`](https://www.w3.org/TR/lws10-core/#authorization-token-validation-verification) | MUST | PASS | 10 |
| [`authz-validate-before-issuing`](https://www.w3.org/TR/lws10-core/#authorization-token-exchange-request) | MUST | PASS | 1 |
| [`conditional-requests-supported`](https://www.w3.org/TR/lws10-core/#read-resource) | SHOULD | PASS | 4 |
| [`conformance-server-class`](https://www.w3.org/TR/lws10-core/#conformance) | MUST | UNCOVERED | 0 |
| [`conneg-media-type-equivalence`](https://www.w3.org/TR/lws10-core/#media-type-equivalence) | MUST | PASS | 2 |
| [`conneg-vary-accept`](https://www.w3.org/TR/lws10-core/#media-type-equivalence) | SHOULD | PASS | 1 |
| [`contained-description-recommended-members`](https://www.w3.org/TR/lws10-core/#contained-resource-description) | SHOULD | PASS | 1 |
| [`contained-description-required-members`](https://www.w3.org/TR/lws10-core/#contained-resource-description) | MUST | PASS | 1 |
| [`contained-format-for-dataresources`](https://www.w3.org/TR/lws10-core/#contained-resource-description) | MUST | PASS | 2 |
| [`contained-resource-type-values`](https://www.w3.org/TR/lws10-core/#contained-resource-description) | MUST | PASS | 1 |
| [`container-empty-items-array`](https://www.w3.org/TR/lws10-core/#container-properties) | MUST | PASS | 2 |
| [`container-listing-authorization-visibility`](https://www.w3.org/TR/lws10-core/#container-membership-and-authorization) | MUST | PASS | 1 |
| [`container-model-members`](https://www.w3.org/TR/lws10-core/#container-model) | MAY | UNCOVERED | 0 |
| [`container-representation-required-properties`](https://www.w3.org/TR/lws10-core/#container-properties) | MUST | PASS | 1 |
| [`container-totalitems-accuracy`](https://www.w3.org/TR/lws10-core/#container-properties) | SHOULD | PASS | 1 |
| [`containment-create-atomic-items`](https://www.w3.org/TR/lws10-core/#containment-integrity) | MUST | PASS | 1 |
| [`containment-delete-atomic-items`](https://www.w3.org/TR/lws10-core/#containment-integrity) | MUST | PASS | 3 |
| [`containment-integrity`](https://www.w3.org/TR/lws10-core/#containment-integrity) | MUST | PASS | 1 |
| [`containment-no-cycles`](https://www.w3.org/TR/lws10-core/#containment-integrity) | MUST | UNCOVERED | 0 |
| [`containment-no-orphans`](https://www.w3.org/TR/lws10-core/#containment-integrity) | MUST | PASS | 1 |
| [`containment-rel-up-get-head`](https://www.w3.org/TR/lws10-core/#containment) | MUST | PASS | 4 |
| [`create-401-storage-link`](https://www.w3.org/TR/lws10-core/#create-resource) | SHOULD | PASS | 1 |
| [`create-container-type-link`](https://www.w3.org/TR/lws10-core/#create-resource) | MUST | PASS | 1 |
| [`create-linkset-before-success`](https://www.w3.org/TR/lws10-core/#create-resource) | MUST | PASS | 1 |
| [`create-post-201-location-links`](https://www.w3.org/TR/lws10-core/#create-resource) | MUST | PASS | 5 |
| [`create-post-missing-container-404`](https://www.w3.org/TR/lws10-core/#create-resource) | MUST | PASS | 2 |
| [`create-post-not-idempotent`](https://www.w3.org/TR/lws10-core/#create-resource) | SHOULD | PASS | 1 |
| [`create-server-managed-metadata-protected`](https://www.w3.org/TR/lws10-core/#create-resource) | MUST | PASS | 1 |
| [`delete-401-403-404-semantics`](https://www.w3.org/TR/lws10-core/#delete-resource) | MUST | PASS | 2 |
| [`delete-if-match-optional`](https://www.w3.org/TR/lws10-core/#delete-resource) | MAY | PASS | 1 |
| [`delete-non-empty-container-409-depth`](https://www.w3.org/TR/lws10-core/#delete-resource) | MUST | PASS | 3 |
| [`delete-removes-from-parent-listing`](https://www.w3.org/TR/lws10-core/#delete-resource) | MUST | PASS | 2 |
| [`delete-success-204-conditional`](https://www.w3.org/TR/lws10-core/#delete-resource) | MUST | PASS | 3 |
| [`error-rfc9457-problem-details`](https://www.w3.org/TR/lws10-core/#summary-of-http-status-mappings) | SHOULD | PASS | 1 |
| [`get-data-resource-content-range-etag`](https://www.w3.org/TR/lws10-core/#read-resource) | MUST | PASS | 3 |
| [`head-parity-with-get`](https://www.w3.org/TR/lws10-core/#read-resource) | MUST | PASS | 2 |
| [`iana-ld-json-profile-equivalence`](https://www.w3.org/TR/lws10-core/#iana-media-type-registry) | SHOULD | PASS | 1 |
| [`link-storage-on-responses`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 4 |
| [`link-up-on-non-root-resources`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 1 |
| [`linkset-accept-patch-json-patch`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 1 |
| [`linkset-allow-get-patch`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 1 |
| [`linkset-etag-get-head`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 1 |
| [`linkset-lifecycle-tied-to-resource`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 2 |
| [`linkset-media-type-json`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 1 |
| [`linkset-optional-methods-advertised`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 1 |
| [`linkset-patch-json-patch`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 1 |
| [`linkset-precondition-failed-412`](https://www.w3.org/TR/lws10-core/#update-resource) | MUST | PASS | 1 |
| [`linkset-put-405-if-unsupported`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 1 |
| [`linkset-restricted-links`](https://www.w3.org/TR/lws10-core/#metadata) | MAY | PASS | 1 |
| [`linkset-server-managed-atomic`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 2 |
| [`linkset-standalone-rfc9264`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 2 |
| [`lws-cid-media-type-storage-description`](https://www.w3.org/TR/lws10-core/#lws-media-type-0) | MUST | PASS | 1 |
| [`lws-json-media-type-container-representation`](https://www.w3.org/TR/lws10-core/#lws-media-type-0) | MUST | PASS | 1 |
| [`lws-profile-equivalence`](https://www.w3.org/TR/lws10-core/#lws-media-type-0) | SHOULD | PASS | 1 |
| [`metadata-capability-advertising`](https://www.w3.org/TR/lws10-core/#metadata) | MUST | PASS | 1 |
| [`notification-activity-as2-conformance`](https://www.w3.org/TR/lws10-core/#activity-properties) | MUST | PASS | 1 |
| [`notification-activity-id`](https://www.w3.org/TR/lws10-core/#activity-properties) | MUST | PASS | 1 |
| [`notification-activity-object`](https://www.w3.org/TR/lws10-core/#activity-properties) | MUST | PASS | 1 |
| [`notification-activity-object-id`](https://www.w3.org/TR/lws10-core/#activity-properties) | MUST | PASS | 5 |
| [`notification-activity-object-type`](https://www.w3.org/TR/lws10-core/#activity-properties) | MUST | PASS | 1 |
| [`notification-activity-optional-properties`](https://www.w3.org/TR/lws10-core/#activity-properties) | MAY | PASS | 1 |
| [`notification-activity-published`](https://www.w3.org/TR/lws10-core/#activity-properties) | MUST | PASS | 1 |
| [`notification-activity-type`](https://www.w3.org/TR/lws10-core/#activity-properties) | MUST | PASS | 3 |
| [`notification-activity-types-additional`](https://www.w3.org/TR/lws10-core/#activity-types) | MAY | UNCOVERED | 0 |
| [`notification-activity-types-supported`](https://www.w3.org/TR/lws10-core/#activity-types) | MUST | PASS | 5 |
| [`notification-batching`](https://www.w3.org/TR/lws10-core/#batching) | MAY | UNCOVERED | 0 |
| [`notification-envelope-activity`](https://www.w3.org/TR/lws10-core/#envelope-properties) | MUST | PASS | 1 |
| [`notification-envelope-storage`](https://www.w3.org/TR/lws10-core/#envelope-properties) | MUST | PASS | 1 |
| [`notification-envelope-type`](https://www.w3.org/TR/lws10-core/#envelope-properties) | MUST | PASS | 1 |
| [`notification-suite-subscription-type-identifier`](https://www.w3.org/TR/lws10-core/#notification-subscription-type-identifier) | MUST | PASS | 1 |
| [`notifications-advertise-notificationservice`](https://www.w3.org/TR/lws10-core/#notification-discovery) | MUST | PASS | 1 |
| [`notificationservice-additional-properties`](https://www.w3.org/TR/lws10-core/#notification-discovery) | MAY | UNCOVERED | 0 |
| [`notificationservice-endpoint-and-subscription-types`](https://www.w3.org/TR/lws10-core/#notification-discovery) | MUST | PASS | 1 |
| [`operations-core-four-atomic`](https://www.w3.org/TR/lws10-core/#operations) | MUST | UNCOVERED | 0 |
| [`pagination-200-totalitems-all-pages`](https://www.w3.org/TR/lws10-core/#requesting-pages) | MUST | PASS | 3 |
| [`pagination-first-page-flow`](https://www.w3.org/TR/lws10-core/#requesting-pages) | MAY | PASS | 1 |
| [`pagination-link-first`](https://www.w3.org/TR/lws10-core/#pagination-link-relations) | MUST | PASS | 5 |
| [`pagination-link-last`](https://www.w3.org/TR/lws10-core/#pagination-link-relations) | MAY | PASS | 1 |
| [`pagination-link-next`](https://www.w3.org/TR/lws10-core/#pagination-link-relations) | MUST | PASS | 2 |
| [`pagination-link-prev`](https://www.w3.org/TR/lws10-core/#pagination-link-relations) | MUST | PASS | 2 |
| [`pagination-over-threshold`](https://www.w3.org/TR/lws10-core/#pagination) | SHOULD | UNCOVERED | 0 |
| [`patch-json-patch-baseline`](https://www.w3.org/TR/lws10-core/#update-resource) | MUST | PASS | 2 |
| [`policy-action-required`](https://www.w3.org/TR/lws10-core/#odrl-action) | MUST | PASS | 2 |
| [`policy-action-values`](https://www.w3.org/TR/lws10-core/#odrl-action) | MUST | PASS | 1 |
| [`policy-assignee-required`](https://www.w3.org/TR/lws10-core/#odrl-assignee) | MUST | PASS | 2 |
| [`policy-assignee-uri-foaf-agent`](https://www.w3.org/TR/lws10-core/#odrl-assignee) | MUST | PASS | 2 |
| [`policy-constraint-left-operands`](https://www.w3.org/TR/lws10-core/#odrl-constraint) | MUST | PASS | 5 |
| [`policy-constraint-objects`](https://www.w3.org/TR/lws10-core/#odrl-constraint) | MUST | PASS | 2 |
| [`policy-constraint-optional`](https://www.w3.org/TR/lws10-core/#odrl-constraint) | MAY | PASS | 1 |
| [`policy-constraints-all-satisfied`](https://www.w3.org/TR/lws10-core/#odrl-constraint) | MUST | PASS | 1 |
| [`policy-constraints-conjunction-semantics`](https://www.w3.org/TR/lws10-core/#constraint-combining) | MUST | PASS | 1 |
| [`policy-target-extra-types`](https://www.w3.org/TR/lws10-core/#odrl-target) | MAY | UNCOVERED | 0 |
| [`policy-target-object`](https://www.w3.org/TR/lws10-core/#odrl-target) | MUST | PASS | 2 |
| [`policy-target-optional`](https://www.w3.org/TR/lws10-core/#odrl-target) | MAY | UNCOVERED | 0 |
| [`policy-type-access-policy`](https://www.w3.org/TR/lws10-core/#odrl-type) | MUST | PASS | 2 |
| [`policy-type-required`](https://www.w3.org/TR/lws10-core/#odrl-type) | MUST | PASS | 2 |
| [`privacy-notification-actor-omitted`](https://www.w3.org/TR/lws10-core/#privacy-notifications) | SHOULD | PASS | 1 |
| [`privacy-notification-authorized-resources-only`](https://www.w3.org/TR/lws10-core/#privacy-notifications) | SHOULD | INAPPLICABLE | 1 |
| [`put-clients-use-conditional-requests`](https://www.w3.org/TR/lws10-core/#update-resource) | SHOULD | UNCOVERED | 0 |
| [`read-401-www-authenticate-discoverability`](https://www.w3.org/TR/lws10-core/#read-resource) | SHOULD | PASS | 2 |
| [`read-container-etag-type-links`](https://www.w3.org/TR/lws10-core/#read-resource) | MUST | PASS | 1 |
| [`read-container-listing-authz-filtered`](https://www.w3.org/TR/lws10-core/#read-resource) | MAY | PASS | 1 |
| [`read-container-listing-member-metadata`](https://www.w3.org/TR/lws10-core/#read-resource) | MUST | PASS | 1 |
| [`read-type-distinction-metadata-links`](https://www.w3.org/TR/lws10-core/#read-resource) | MUST | PASS | 2 |
| [`security-notification-access-control`](https://www.w3.org/TR/lws10-core/#security-notifications) | MUST | PASS | 4 |
| [`status-204-410-deletions`](https://www.w3.org/TR/lws10-core/#summary-of-http-status-mappings) | MAY | PASS | 1 |
| [`storage-capability-id-optional`](https://www.w3.org/TR/lws10-core/#storage-description-data-model) | MUST | PASS | 1 |
| [`storage-capability-property`](https://www.w3.org/TR/lws10-core/#storage-description-data-model) | MUST | PASS | 1 |
| [`storage-capability-type-required`](https://www.w3.org/TR/lws10-core/#storage-description-data-model) | MUST | PASS | 1 |
| [`storage-description-id-required`](https://www.w3.org/TR/lws10-core/#storage-description-data-model) | MUST | PASS | 1 |
| [`storage-description-link-header`](https://www.w3.org/TR/lws10-core/#storage-description-binding) | MUST | PASS | 2 |
| [`storage-description-lws-cid`](https://www.w3.org/TR/lws10-core/#storage-description-representation) | MUST | PASS | 1 |
| [`storage-description-storageroot-service`](https://www.w3.org/TR/lws10-core/#storage-description-services) | MUST | PASS | 2 |
| [`storage-description-type-storage`](https://www.w3.org/TR/lws10-core/#storage-description-data-model) | MUST | PASS | 1 |
| [`storage-service-endpoint-required`](https://www.w3.org/TR/lws10-core/#storage-description-data-model) | MUST | PASS | 1 |
| [`storage-service-id-optional`](https://www.w3.org/TR/lws10-core/#storage-description-data-model) | MUST | PASS | 1 |
| [`storage-service-property`](https://www.w3.org/TR/lws10-core/#storage-description-data-model) | MUST | PASS | 1 |
| [`storage-service-type-required`](https://www.w3.org/TR/lws10-core/#storage-description-data-model) | MUST | PASS | 1 |
| [`storage-uri-returns-lws-cid-document`](https://www.w3.org/TR/lws10-core/#storage-description-binding) | MUST | PASS | 2 |
| [`subscription-authorization-on-create`](https://www.w3.org/TR/lws10-core/#subscription-authorization) | MUST | PASS | 2 |
| [`subscription-authorization-on-delivery`](https://www.w3.org/TR/lws10-core/#subscription-authorization) | MUST | PASS | 2 |
| [`subscription-authorization-revoked`](https://www.w3.org/TR/lws10-core/#subscription-authorization) | MUST | PASS | 1 |
| [`subscription-create-post-lws-json`](https://www.w3.org/TR/lws10-core/#subscriptions) | MUST | PASS | 1 |
| [`subscription-request-additional-fields`](https://www.w3.org/TR/lws10-core/#subscription-request) | MAY | PASS | 1 |
| [`subscription-request-required-fields`](https://www.w3.org/TR/lws10-core/#subscription-request) | MUST | PASS | 3 |
| [`subscription-request-topic`](https://www.w3.org/TR/lws10-core/#subscription-request) | MUST | PASS | 2 |
| [`subscription-request-type`](https://www.w3.org/TR/lws10-core/#subscription-request) | MUST | PASS | 3 |
| [`subscription-response-lws-json`](https://www.w3.org/TR/lws10-core/#subscription-response) | MUST | PASS | 1 |
| [`subscription-response-subscription-url`](https://www.w3.org/TR/lws10-core/#subscription-response) | MUST | PASS | 1 |
| [`subscription-response-type`](https://www.w3.org/TR/lws10-core/#subscription-response) | MUST | PASS | 1 |
| [`update-content-vs-metadata-prefer-set-linkset`](https://www.w3.org/TR/lws10-core/#update-resource) | MUST | PASS | 1 |
| [`uri-independent-of-hierarchy`](https://www.w3.org/TR/lws10-core/#resource-identification-0) | SHOULD | PASS | 1 |
| [`accept-query-advertised`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | SHOULD | PASS | 1 |
| [`accept-query-no-disclosure`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 1 |
| [`at-members-ignored`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 1 |
| [`authorization-enforced`](https://w3c.github.io/lws-protocol/lws10-index/#security-authorization) | MUST | PASS | 3 |
| [`baseline-format-supported`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 1 |
| [`consistency-not-for-authorization`](https://w3c.github.io/lws-protocol/lws10-index/#type-derivation) | MUST | PASS | 1 |
| [`content-location-protected`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | INAPPLICABLE | 1 |
| [`content-types-identical`](https://w3c.github.io/lws-protocol/lws10-index/#type-derivation) | MUST | PASS | 1 |
| [`counts-filtered`](https://w3c.github.io/lws-protocol/lws10-index/#security-authorization) | MUST | PASS | 1 |
| [`current-authorization`](https://w3c.github.io/lws-protocol/lws10-index/#security-authorization) | MUST | PASS | 1 |
| [`derived-index-filtered`](https://w3c.github.io/lws-protocol/lws10-index/#security-authorization) | MUST | PASS | 2 |
| [`duplicate-groups-ignored`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 1 |
| [`empty-group-rejected`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 1 |
| [`eventually-consistent`](https://w3c.github.io/lws-protocol/lws10-index/#type-derivation) | MAY | UNCOVERED | 0 |
| [`expired-page-404-410`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-errors) | MUST | INAPPLICABLE | 1 |
| [`extensions-uphold-authorization`](https://w3c.github.io/lws-protocol/lws10-index/#security-authorization) | MUST | UNCOVERED | 0 |
| [`grammar-not-extended`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 1 |
| [`invalid-iri-400`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-errors) | MUST | PASS | 1 |
| [`malformed-filter-400`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-errors) | MUST | PASS | 4 |
| [`missing-content-type-400`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-errors) | MUST | PASS | 1 |
| [`no-existence-disclosure`](https://w3c.github.io/lws-protocol/lws10-index/#security-authorization) | MUST | PASS | 2 |
| [`no-match-not-error`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 2 |
| [`no-shared-cache`](https://w3c.github.io/lws-protocol/lws10-index/#security-authorization) | MUST | PASS | 2 |
| [`no-silent-narrowing`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-errors) | MUST | PASS | 1 |
| [`not-acceptable-406`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-errors) | MUST | PASS | 1 |
| [`other-formats`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MAY | UNCOVERED | 0 |
| [`other-response-formats`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MAY | PASS | 1 |
| [`query-content-type-required`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 1 |
| [`query-safe-idempotent`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MAY | PASS | 1 |
| [`reflect-change-bounded`](https://w3c.github.io/lws-protocol/lws10-index/#type-derivation) | SHOULD | PASS | 4 |
| [`relation-sources-identical`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 1 |
| [`relations-may-be-indexed`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MAY | PASS | 4 |
| [`relations-not-enumerated`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | UNCOVERED | 0 |
| [`responses-private`](https://w3c.github.io/lws-protocol/lws10-index/#security-authorization) | MUST | PASS | 2 |
| [`result-item-id-type`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 2 |
| [`result-item-metadata`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MAY | UNCOVERED | 0 |
| [`revoked-not-shown`](https://w3c.github.io/lws-protocol/lws10-index/#security-authorization) | MUST | PASS | 1 |
| [`search-default-containerpage`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 4 |
| [`service-advertised`](https://w3c.github.io/lws-protocol/lws10-index/#discovery) | MUST | PASS | 1 |
| [`service-endpoint`](https://w3c.github.io/lws-protocol/lws10-index/#discovery) | MUST | PASS | 1 |
| [`service-extra-properties`](https://w3c.github.io/lws-protocol/lws10-index/#discovery) | MAY | UNCOVERED | 0 |
| [`services-optional`](https://w3c.github.io/lws-protocol/lws10-index/#discovery) | MAY | PASS | 1 |
| [`structural-relations-not-indexed`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 1 |
| [`too-complex-422`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-errors) | MUST | PASS | 1 |
| [`type-filter`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MAY | PASS | 5 |
| [`type-key-supported`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 3 |
| [`types-from-content`](https://w3c.github.io/lws-protocol/lws10-index/#type-derivation) | MAY | PASS | 1 |
| [`types-from-link-headers`](https://w3c.github.io/lws-protocol/lws10-index/#type-derivation) | SHOULD | PASS | 4 |
| [`unauthorized-omitted`](https://w3c.github.io/lws-protocol/lws10-index/#security-authorization) | MUST | PASS | 2 |
| [`unindexed-relation-indistinguishable`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-query) | MUST | PASS | 2 |
| [`unsupported-format-415`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-errors) | MUST | PASS | 1 |
| [`unsupported-format-accept-query`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-errors) | SHOULD | PASS | 1 |
| [`vary-accept`](https://w3c.github.io/lws-protocol/lws10-index/#type-search-errors) | MUST | PASS | 1 |
| [`delivery-deactivation-optional`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-delivery) | MAY | PASS | 1 |
| [`delivery-lws-json`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-delivery) | MUST | PASS | 1 |
| [`delivery-retry-optional`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-delivery) | MAY | PASS | 1 |
| [`delivery-signed`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-authentication) | SHOULD | PASS | 1 |
| [`inbox-verifies-signature`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-authentication) | MUST | PASS | 1 |
| [`keyid-url-with-fragment`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#signature-verification) | MUST | PASS | 1 |
| [`receiver-verification-steps`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#signature-verification) | MUST | PASS | 1 |
| [`response-expires-optional`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-subscription) | MAY | PASS | 1 |
| [`response-type-webhook`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-subscription) | MUST | PASS | 1 |
| [`signature-covered-components`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#signature-requirements) | MUST | PASS | 2 |
| [`signature-input-created-keyid`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#signature-requirements) | MUST | PASS | 2 |
| [`signing-key-published`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-authentication) | MUST | PASS | 2 |
| [`storage-description-id-matches`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#signature-verification) | MUST | PASS | 1 |
| [`subscription-expires-optional`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-subscription) | MAY | PASS | 1 |
| [`subscription-get-delete`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-subscription-management) | MUST | PASS | 1 |
| [`subscription-inbox-required`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-subscription) | MUST | PASS | 1 |
| [`subscription-listing-container`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-subscription-management) | MUST | PASS | 2 |
| [`subscription-type-and-fields`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#webhook-subscription) | MUST | PASS | 2 |
| [`subscription-type-identifier`](https://w3c.github.io/lws-protocol/lws10-notifications-webhook/#subscription-type) | MUST | PASS | 1 |

