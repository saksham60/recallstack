import 'package:app/core/db/app_database.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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
