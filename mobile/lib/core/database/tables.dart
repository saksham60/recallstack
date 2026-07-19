import 'package:drift/drift.dart';

class Categories extends Table {
  TextColumn get id => text()();
  TextColumn get domainId => text()();
  TextColumn get title => text()();
  TextColumn get description => text().nullable()();
  IntColumn get sortOrder => integer()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

class ContentItems extends Table {
  TextColumn get id => text()();
  TextColumn get categoryId => text().references(Categories, #id)();
  TextColumn get title => text()();
  TextColumn get slug => text()();
  TextColumn get type => text()(); // 'concept', 'problem', etc.
  TextColumn get difficulty => text().nullable()();
  IntColumn get sortOrder => integer()();
  TextColumn get currentPublishedVersionId => text().nullable()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

class ContentDocuments extends Table {
  TextColumn get id => text()(); // Version ID
  TextColumn get contentId => text().references(ContentItems, #id)();
  TextColumn get blocksJson => text()(); // JSON string of study blocks
  DateTimeColumn get publishedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

class UserProgress extends Table {
  TextColumn get contentId => text().references(ContentItems, #id)();
  TextColumn get status => text()(); // 'not_started', 'learning', 'mastered'
  IntColumn get rowVersion => integer()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {contentId};
}

class Bookmarks extends Table {
  TextColumn get contentId => text().references(ContentItems, #id)();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {contentId};
}

class UserNotes extends Table {
  TextColumn get id => text()();
  TextColumn get contentId => text().references(ContentItems, #id)();
  TextColumn get type => text()(); // 'note', 'mistake', 'insight'
  TextColumn get body => text()();
  IntColumn get rowVersion => integer()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

class ReviewCards extends Table {
  TextColumn get id => text()();
  TextColumn get contentId => text().references(ContentItems, #id)();
  TextColumn get state => text()();
  DateTimeColumn get nextReviewAt => dateTime().nullable()();
  IntColumn get rowVersion => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

class LocalOutbox extends Table {
  TextColumn get mutationId => text()();
  TextColumn get mutationType => text()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  TextColumn get payloadJson => text()();
  TextColumn get status => text()(); // 'pending', 'processing', 'failed'
  IntColumn get retryCount => integer().withDefault(const Constant(0))();
  DateTimeColumn get nextRetryAt => dateTime().nullable()();
  TextColumn get lastError => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {mutationId};
}

class SyncCursors extends Table {
  TextColumn get id => text()(); // 'user' or 'catalog_{domainId}'
  TextColumn get cursorValue => text()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

class DeviceState extends Table {
  TextColumn get id => text()(); // 'current'
  TextColumn get deviceId => text()();
  DateTimeColumn get registeredAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}
