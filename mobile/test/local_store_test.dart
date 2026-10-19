import 'package:app/core/db/app_database.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'v1 upgrade preserves saved stories and drafts and adds recovery storage',
    () async {
      final connection = sqlite.sqlite3.openInMemory();
      connection.execute(
        'CREATE TABLE saved_stories (id TEXT NOT NULL PRIMARY KEY, title TEXT NOT NULL, source_name TEXT NOT NULL, image_url TEXT, published_at INTEGER NOT NULL, saved_at INTEGER NOT NULL)',
      );
      connection.execute(
        "CREATE TABLE dsa_drafts (content_id TEXT NOT NULL PRIMARY KEY, approach TEXT NOT NULL DEFAULT '', code TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL)",
      );
      connection.execute(
        "INSERT INTO saved_stories VALUES ('saved', 'Existing saved story', 'Source', NULL, 1, 1)",
      );
      connection.execute(
        "INSERT INTO dsa_drafts VALUES ('legacy', 'Existing approach', 'existing code', 1)",
      );
      connection.execute('PRAGMA user_version = 1');
      final db = AppDatabase.forTesting(NativeDatabase.opened(connection));
      addTearDown(db.close);
      expect(
        (await db.watchSaved().first).single.title,
        'Existing saved story',
      );
      expect((await db.getDraft('legacy'))!.code, 'existing code');
      await db.writeRecord('receipt', 'original request');
      expect(await db.readRecord('receipt'), 'original request');
      expect(
        (await db.customSelect('PRAGMA user_version').getSingle()).read<int>(
          'user_version',
        ),
        2,
      );
    },
  );
  test('saved stories and DSA drafts persist in their local tables', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    final now = DateTime.utc(2026, 9, 30);
    await db.upsertSaved(
      SavedStoriesCompanion.insert(
        id: 'story',
        title: 'Title',
        sourceName: 'Source',
        imageUrl: const Value(null),
        publishedAt: now,
        savedAt: now,
      ),
    );
    expect((await db.watchSaved().first).single.title, 'Title');
    await db.upsertDraft('problem', 'two pointers', 'code');
    expect((await db.getDraft('problem'))!.approach, 'two pointers');
    await db.removeSaved('story');
    expect(await db.watchSaved().first, isEmpty);
    expect((await db.getDraft('problem'))!.code, 'code');
  });
}
