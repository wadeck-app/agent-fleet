# GitLab Deploy Token Validation -- Findings

## Context

Project: 84445653 (`@wadeck` scope)
Token type tested: Deploy tokens (`gldt-*`) with `read_package_registry` and `write_package_registry` scopes.

---

## Validation order for Generic Packages API

Tested with `PUT /api/v4/projects/:id/packages/generic/:name/:version/:filename`:

| Token | Version format | HTTP | Conclusion |
|---|---|---|---|
| None | valid | 401 | Auth checked first |
| None | invalid (`@@`) | 401 | Auth checked first |
| `read_package_registry` | invalid (`@@`) | **400** | Auth OK, **format validated before scope** |
| `read_package_registry` | valid | **403** | Auth OK, format OK, scope KO |
| `write_package_registry` | valid + body | **201** | All OK, file created |

**Key finding:** GitLab validates **auth → format → scope**. Using invalid version formats bypasses scope checking (returns 400 regardless of scope). There is no non-destructive probe for `write_package_registry` scope.

---

## Confirmed behavior of `write_package_registry` deploy token

Tested with full PUT → GET → DELETE cycle:

| Operation | Endpoint | HTTP | Result |
|---|---|---|---|
| PUT file | `/packages/generic/:name/:version/:file` | 201 | File created |
| GET file | `/packages/generic/:name/:version/:file` | 200 | File readable by same token |
| DELETE file | `/packages/generic/:name/:version/:file` | **404** | GitLab security-by-obscurity: 404 instead of 403 |
| GET packages list | `/packages?package_name=...` | 401 | Requires `api` scope |
| GraphQL package query | `/api/graphql` | 401 | Requires `api` scope |

**Key finding:** `write_package_registry` can write AND read Generic Package files, but CANNOT delete them. GitLab returns 404 (not 403) to obscure the authorization failure. There is no accessible endpoint to delete Generic Package files without `api` scope.

**Probe idempotency:** PUT to a fixed path (`ci-write-probe/0.0.1/probe.txt`) overwrites the existing file. Each CI run results in exactly ONE package with ONE version and ONE file (5 bytes). No proliferation occurs.

**To delete when needed:** GitLab UI → Project → Packages and Registries → Package Registry → `ci-write-probe` → delete.

---

## Introspection endpoints

| Endpoint | `read_package_registry` token | `write_package_registry` token |
|---|---|---|
| `GET /api/v4/personal_access_tokens/self` | 401 | 401 |
| `GET /api/v4/deploy_tokens/self` | 404 | 404 |
| `GET /api/v4/user` | 401 | 401 |

**Finding:** Neither introspection endpoint works for deploy tokens with only package registry scopes. Both require `api` scope.

---

## Non-destructive probe: PyPI endpoint

**Discovered:** `POST /api/v4/projects/:id/packages/pypi` with empty body.

GitLab validates `write_package_registry` scope BEFORE validating the request content on the PyPI endpoint:

| Token | HTTP | Meaning | Artifact created? |
|---|---|---|---|
| `write_package_registry` | **400** | Scope OK, content missing error | **No** |
| `read_package_registry` only | **403** | Scope rejected | No |
| Invalid/expired | 401 | Auth failed | No |

```bash
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "https://gitlab.com/api/v4/projects/84445653/packages/pypi")
# 400 = write_package_registry OK, 403 = scope missing
```

This is the **definitive non-destructive probe** for `write_package_registry` validation.
No bootstrap, no cleanup, no artifacts.

---

## Current probe strategy (CI workflows)

Since no non-destructive probe exists for `write_package_registry`:

1. **READ token**: validated by `GET /packages/npm/@wadeck/singleton-daemon-kit` → 200 OK
2. **WRITE token**: probe via `PUT /packages/generic/ci-write-probe/0.0.1/probe.txt` → 201 OK
   - File is created (harmless, ~5 bytes)
   - File CANNOT be deleted by the deploy token (requires `api` scope)
   - Cleanup: manual deletion from GitLab UI when needed

---

## npm registry endpoint behavior

`PUT /api/v4/projects/:id/packages/npm/@scope%2fpkg-name` with `write_package_registry`:
- With valid npm tarball body → publishes package
- With malformed body (`{}`) → creates a **broken npm package entry** in the registry that persists

**Warning:** Do NOT use the npm registry endpoint as a write probe -- it creates broken packages.
