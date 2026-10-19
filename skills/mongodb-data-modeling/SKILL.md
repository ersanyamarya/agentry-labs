---
name: mongodb-data-modeling
description: Design new MongoDB/Mongoose schemas or audit existing ones against document-modeling best practices — embedding vs. referencing, unbounded arrays, compound index field order (ESR), the 16MB document cap, and denormalization-for-reads patterns (extended reference, subset, bucket, attribute). Use this whenever the user is designing a new collection or schema, modeling a relationship (one-to-many, many-to-many) in MongoDB/Mongoose, choosing between embedding a sub-document and referencing by ObjectId, complaining about slow queries or COLLSCANs, adding a compound index, or asking you to review/critique an existing schema or query pattern — even if they don't say "MongoDB" explicitly and just describe the data shape or the query they need to run fast.
---

# MongoDB Data Modeling

MongoDB schema design is a different discipline from relational modeling, and the failure mode is subtle: a schema that looks reasonable and works fine in development can fall over in production because it was normalized like a relational schema instead of shaped around how it's actually queried. This skill exists to catch that before it ships — whether you're drafting a new schema or reading an existing one.

## The one question that drives everything

For every collection, before writing a single field: **how will this be queried, and how often, relative to how it's written?**

MongoDB has joins (`$lookup`), but reaching for them on a hot read path is usually a sign the schema was designed for entity relationships rather than for the queries the application actually runs. Storage is cheap; a network round-trip and disk I/O are not. Duplicating a few fields to make a common read a single `find()` is normal here, not a shortcut.

So when designing or reviewing a schema, start by listing the actual read and write operations the application performs against it — not the entities. The shape falls out of that list.

## Embed or reference?

This is the single most consequential decision per relationship, and it should be argued from access pattern and mutation frequency, not from cardinality alone:

| Signal | Embed | Reference |
|---|---|---|
| Relationship | 1-to-1, 1-to-few | 1-to-many (unbounded), many-to-many |
| Read pattern | Always fetched together | Queried independently |
| Mutation frequency | Nested data rarely changes | Changes often, or changes independently of the parent |
| Consistency need | Fine with single-document atomicity | Needs to be updated in one place and reflected everywhere |

When reviewing a schema, look for the mismatch: an embedded array that's actually unbounded (comments, events, log lines), or a reference that's followed on every request when the referenced data barely changes and could just be embedded or duplicated.

## Hard limits to check against

These aren't style preferences — violate them and the write fails or the collection degrades:

- **16MB per document.** If a design lets a document grow without bound (see below), it's a matter of when, not if, this gets hit. Route large blobs or truly unbounded logs to GridFS or object storage instead of stuffing them in-document.
- **100 levels of nesting.** Deep nesting is rare to hit by accident, but a schema with dynamically-recursive structure (trees, comment threads) should have an explicit depth guard.
- **64 indexes per collection.** Not usually a binding constraint, but a sign of un-thought-out query patterns if a collection is approaching it.
- **One array field per compound index.** MongoDB can't build a multikey compound index across two array fields. If a design needs to filter/sort efficiently on two different arrays at once, that's a signal to restructure (e.g., pull one array out into its own collection).

## The rules to check a design against

1. **Store together what's read together.** If a query always needs A and B, embedding avoids a second round-trip — this is the main argument *for* embedding.
2. **No unbounded arrays.** An array that grows without a natural cap (comments, activity events, order history) will eventually cause write fragmentation and risks the 16MB ceiling. Cap it, paginate it into its own collection, or apply the Subset pattern below.
3. **Pre-aggregate on write, not on read.** If a value (`totalLikes`, `itemCount`, `averageRating`) is read far more often than the underlying data changes, compute and store it when the underlying data changes, not on every read.

## Patterns worth reaching for by name

These are the standard ways to apply "denormalize for the read path" without reinventing them ad hoc — recognize them in a design and name them when reviewing, propose them when designing:

- **Extended reference** — duplicate the handful of fields a query actually displays (e.g., an `Order` keeps a snapshot of `userName`/`shippingAddress` alongside `userId`) so the common read skips a `$lookup`. This is also usually *correct* behavior for historical records — the order should show the address as it was, not as it is now.
- **Subset** — when a one-to-many relationship is unbounded (hundreds of reviews), embed only the most relevant slice (e.g., 10 most recent) in the parent for the common case, and keep the full set in its own collection for the rare case that needs it.
- **Bucket** — for high-frequency time-series/IoT-style writes, group entries into per-interval documents (one doc per device per hour) instead of one document per data point, to avoid millions of tiny documents.
- **Attribute** — for entities with a long tail of sparse or dynamic fields (product specs that vary wildly by category), store `attributes: [{ k, v }]` instead of one column per possible attribute, so a single index on `attributes.k`/`attributes.v` covers all of them.
- **Schema versioning** — a `schemaVersion` field lets a collection evolve without a lockstep migration, and `$jsonSchema` validators enforce the current shape at the database layer rather than trusting every writer.

## Indexing: the ESR rule

When a compound index backs a multi-field query, order the fields **Equality, Sort, Range**:

1. Equality-filtered fields first (`status: "active"`)
2. Fields the query sorts by next (`createdAt: -1`)
3. Range-filtered fields last (`age: { $gte: 21 }`)

So a query filtering `status`, sorting by `createdAt`, and range-filtering `age` wants the index `{ status: 1, createdAt: -1, age: 1 }` — in that order, not the order the fields happen to appear in the query. Field order in a compound index is not cosmetic: an index built in the wrong order won't serve the query efficiently even though all the right fields are present.

## When reviewing an existing schema or slow query

Don't just pattern-match against the list above — verify:

- Check document size for the collections in question (`Object.bsonsize(db.collection.findOne())` or the `$bsonSize` aggregation operator) if unbounded growth is suspected.
- Run `.explain("executionStats")` on the query in question. The plan should show `IXSCAN`; a `COLLSCAN` on a collection of meaningful size is the concrete symptom that a modeling or indexing rule was violated, not a hypothesis.
- If the fix is to denormalize, check whether the write path can keep the duplicated data consistent without a cascading multi-document update on every write — heavy denormalization that requires updating dozens of documents per write has just moved the cost rather than removed it.

## Applying this in a Mongoose/TypeScript codebase

If the project defines schemas by hand (rather than through an ORM abstraction), the same rules apply directly: embedded documents become nested schema objects, references become `ObjectId` fields with a `ref`, and compound indexes are declared with `.index({ field1: 1, field2: -1 })` in ESR order. Cross-referenced models need to be registered on the same connection for `.populate()` to work — if a review turns up a reference that's never populated and always fetched by extended-reference fields instead, that's a sign the reference could be dropped or the schema simplified.
