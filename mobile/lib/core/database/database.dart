import 'dart:io';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;
import 'package:sqlite3/sqlite3.dart';
import 'package:sqlite3_flutter_libs/sqlite3_flutter_libs.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:app/core/auth/supabase_auth_repository.dart';

import 'tables.dart';

part 'database.g.dart';

@DriftDatabase(
  tables: [
    Categories,
    ContentItems,
    ContentDocuments,
    UserProgress,
    Bookmarks,
    UserNotes,
    ReviewCards,
    LocalOutbox,
    SyncCursors,
    DeviceState,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(String? userId) : super(_openConnection(userId));
  AppDatabase.forTesting(super.connection);

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration {
    return MigrationStrategy(
      onCreate: (Migrator m) async {
        await m.createAll();
      },
      onUpgrade: (Migrator m, int from, int to) async {
        if (from < 2) {
          await m.addColumn(contentItems, contentItems.primaryPracticeUrl);
        }
      },
    );
  }
}

LazyDatabase _openConnection(String? userId) {
  return LazyDatabase(() async {
    if (Platform.environment.containsKey('FLUTTER_TEST')) {
      return NativeDatabase.memory();
    }
    final dbFolder = await getApplicationDocumentsDirectory();
    final fileName = userId != null
        ? 'recallstack_$userId.sqlite'
        : 'recallstack_anon.sqlite';
    final file = File(p.join(dbFolder.path, fileName));

    if (Platform.isAndroid) {
      await applyWorkaroundToOpenSqlite3OnOldAndroidVersions();
    }

    final cachebase = (await getTemporaryDirectory()).path;
    sqlite3.tempDirectory = cachebase;

    return NativeDatabase.createInBackground(file);
  });
}

@riverpod
AppDatabase appDatabase(Ref ref) {
  // Watch auth state to recreate database connection when user changes
  final user = ref.watch(currentUserProvider);
  final userId = user?.id;
  final db = AppDatabase(userId);
  ref.onDispose(() {
    db.close();
  });
  return db;
}
