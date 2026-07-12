# ADR 0001: Modular monolith with extractable modules

- Status: accepted
- Date: 2026-07-11

## Context

RecallStack deploys initially as a stateless FastAPI service on Cloud Run. It may later move to
Kubernetes and extract modules when scaling, ownership, or availability requirements justify the
operational cost. Premature network boundaries would create distributed transactions without current
benefit.

## Decision

The backend is a modular monolith with domain, application, infrastructure, and presentation boundaries.
Each module owns its SQLAlchemy mappings and repositories. API schemas and domain entities never expose
ORM objects. Transaction boundaries are application services behind explicit unit-of-work ports.

Modules communicate through application interfaces and domain events. The shared `EventPublisher` port
has an in-process adapter; a future Google Pub/Sub adapter can implement the same port. Shared code is
limited to platform capabilities such as authentication, database lifecycle, errors, logging, and
pagination. A module must not import another module's ORM mappings or query another module's tables.

## Extraction path

Identity, catalog/content, learning/practice, recall, and sync can each become a Kubernetes deployment by:

1. Replacing direct application-interface calls with versioned RPC or event adapters.
2. Replacing the in-process event publisher with an outbox-backed Pub/Sub publisher.
3. Moving the module's owned tables into its own PostgreSQL schema or database after data ownership is
   proven and migration/backfill plans exist.
4. Preserving existing HTTP schemas at the gateway while routing to the extracted service.
5. Replacing cross-module atomic workflows with explicit orchestration and idempotent compensation.

Catalog and content should remain together until their publication transaction boundary is redesigned.
Learning, practice, and recall should remain together while recording an attempt updates progress and a
review card atomically. Sync is the strongest early extraction candidate because its traffic and
retention profile differ, but it still depends on authoritative module mutation contracts.

## Consequences

The initial deployment stays simple and transactional. Boundaries require some mapping and port code,
but prevent ORM coupling. Extraction is possible, not free: database splits and distributed workflows
will require dedicated ADRs and approved schema migrations.
