import 'dart:io';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../auth/auth_repository.dart';
part 'app_database.g.dart';

class SavedStories extends Table {
  TextColumn get id => text()();
  TextColumn get title => text()();
  TextColumn get sourceName => text()();
  TextColumn get imageUrl => text().nullable()();
  DateTimeColumn get publishedAt => dateTime()();
  DateTimeColumn get savedAt => dateTime()();
  @override
  Set<Column> get primaryKey => {id};
}

class DsaDrafts extends Table {
  TextColumn get contentId => text()();
  TextColumn get approach => text().withDefault(const Constant(''))();
  TextColumn get code => text().withDefault(const Constant(''))();
  DateTimeColumn get updatedAt => dateTime()();
  @override
  Set<Column> get primaryKey => {contentId};
}

@DriftDatabase(tables: [SavedStories, DsaDrafts])
class AppDatabase extends _$AppDatabase {
  AppDatabase(String userId) : super(_open(userId));
  AppDatabase.forTesting(super.connection);
  @override
  int get schemaVersion => 1;
  Stream<List<SavedStory>> watchSaved() => (select(
    savedStories,
  )..orderBy([(t) => OrderingTerm.desc(t.savedAt)])).watch();
  Future<void> upsertSaved(SavedStoriesCompanion item) =>
      into(savedStories).insertOnConflictUpdate(item);
  Future<void> removeSaved(String id) =>
      (delete(savedStories)..where((t) => t.id.equals(id))).go();
  Future<DsaDraft?> getDraft(String contentId) => (select(
    dsaDrafts,
  )..where((t) => t.contentId.equals(contentId))).getSingleOrNull();
  Future<void> upsertDraft(String id, String approach, String code) =>
      into(dsaDrafts).insertOnConflictUpdate(
        DsaDraftsCompanion.insert(
          contentId: id,
          approach: Value(approach),
          code: Value(code),
          updatedAt: DateTime.now(),
        ),
      );
}

LazyDatabase _open(String userId) => LazyDatabase(() async {
  if (Platform.environment.containsKey('FLUTTER_TEST')) {
    return NativeDatabase.memory();
  }
  final base = await getApplicationDocumentsDirectory();
  final directory = Directory(p.join(base.path, 'reasonai', userId));
  await directory.create(recursive: true);
  return NativeDatabase.createInBackground(
    File(p.join(directory.path, 'reasonai.sqlite')),
  );
});
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final userId =
      ref.watch(authStateProvider).value?.user.id ??
      Supabase.instance.client.auth.currentUser?.id ??
      'signed-out';
  final db = AppDatabase(userId);
  ref.onDispose(db.close);
  return db;
});
