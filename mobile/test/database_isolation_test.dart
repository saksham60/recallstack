import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/database/database.dart';
import 'package:drift/native.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  group('Database Isolation', () {
    test('Authenticated users have isolated sqlite files', () async {
      final dbA = AppDatabase.forTesting(NativeDatabase.memory());
      final dbB = AppDatabase.forTesting(NativeDatabase.memory());

      try {
        // Helper to insert required foreign key data
        Future<void> insertFkData(AppDatabase db) async {
          await db
              .into(db.categories)
              .insert(
                CategoriesCompanion.insert(
                  id: 'cat-1',
                  domainId: 'domain-1',
                  title: 'Category',
                  sortOrder: 0,
                  updatedAt: DateTime.now(),
                ),
              );
          await db
              .into(db.contentItems)
              .insert(
                ContentItemsCompanion.insert(
                  id: 'item-1',
                  categoryId: 'cat-1',
                  title: 'Item',
                  slug: 'item',
                  type: 'concept',
                  sortOrder: 0,
                  updatedAt: DateTime.now(),
                ),
              );
        }

        await insertFkData(dbA);

        // Insert data into user A
        await dbA
            .into(dbA.userNotes)
            .insert(
              UserNotesCompanion.insert(
                id: 'note-A',
                contentId: 'item-1',
                type: 'note',
                body: 'User A note',
                rowVersion: 1,
                createdAt: DateTime.now(),
                updatedAt: DateTime.now(),
              ),
            );

        await dbA
            .into(dbA.bookmarks)
            .insert(
              BookmarksCompanion.insert(
                contentId: 'item-1',
                createdAt: DateTime.now(),
              ),
            );

        await dbA
            .into(dbA.userProgress)
            .insert(
              UserProgressCompanion.insert(
                contentId: 'item-1',
                status: 'learning',
                rowVersion: 1,
                updatedAt: DateTime.now(),
              ),
            );

        await dbA
            .into(dbA.reviewCards)
            .insert(
              ReviewCardsCompanion.insert(
                id: 'card-A',
                contentId: 'item-1',
                state: 'due',
                rowVersion: 1,
              ),
            );

        await dbA
            .into(dbA.localOutbox)
            .insert(
              LocalOutboxCompanion.insert(
                mutationId: 'mut-A',
                mutationType: 'update_note',
                entityType: 'note',
                entityId: 'note-A',
                payloadJson: '{}',
                status: 'pending',
                createdAt: DateTime.now(),
              ),
            );

        // Verify data is in user A
        expect((await dbA.select(dbA.userNotes).get()).length, 1);
        expect((await dbA.select(dbA.bookmarks).get()).length, 1);
        expect((await dbA.select(dbA.userProgress).get()).length, 1);
        expect((await dbA.select(dbA.reviewCards).get()).length, 1);
        expect((await dbA.select(dbA.localOutbox).get()).length, 1);

        // Verify data is NOT in user B
        expect((await dbB.select(dbB.userNotes).get()).isEmpty, true);
        expect((await dbB.select(dbB.bookmarks).get()).isEmpty, true);
        expect((await dbB.select(dbB.userProgress).get()).isEmpty, true);
        expect((await dbB.select(dbB.reviewCards).get()).isEmpty, true);
        expect((await dbB.select(dbB.localOutbox).get()).isEmpty, true);

        await insertFkData(dbB);

        // Insert data into user B
        await dbB
            .into(dbB.userNotes)
            .insert(
              UserNotesCompanion.insert(
                id: 'note-B',
                contentId: 'item-1',
                type: 'note',
                body: 'User B note',
                rowVersion: 1,
                createdAt: DateTime.now(),
                updatedAt: DateTime.now(),
              ),
            );
        await dbB
            .into(dbB.bookmarks)
            .insert(
              BookmarksCompanion.insert(
                contentId: 'item-1',
                createdAt: DateTime.now(),
              ),
            );
        await dbB
            .into(dbB.userProgress)
            .insert(
              UserProgressCompanion.insert(
                contentId: 'item-1',
                status: 'mastered',
                rowVersion: 1,
                updatedAt: DateTime.now(),
              ),
            );
        await dbB
            .into(dbB.reviewCards)
            .insert(
              ReviewCardsCompanion.insert(
                id: 'card-B',
                contentId: 'item-1',
                state: 'pending_sync',
                rowVersion: 1,
              ),
            );
        await dbB
            .into(dbB.localOutbox)
            .insert(
              LocalOutboxCompanion.insert(
                mutationId: 'mut-B',
                mutationType: 'insert_bookmark',
                entityType: 'bookmark',
                entityId: 'item-1',
                payloadJson: '{}',
                status: 'pending',
                createdAt: DateTime.now(),
              ),
            );

        // Verify user A still only has their data in every user-owned table.
        final notesA = await dbA.select(dbA.userNotes).get();
        expect(notesA.map((note) => note.id), ['note-A']);

        final bookmarksA = await dbA.select(dbA.bookmarks).get();
        expect(bookmarksA.map((bookmark) => bookmark.contentId), ['item-1']);

        final progressA = await dbA.select(dbA.userProgress).get();
        expect(progressA.map((progress) => progress.status), ['learning']);

        final cardsA = await dbA.select(dbA.reviewCards).get();
        expect(cardsA.map((card) => card.id), ['card-A']);

        final outboxA = await dbA.select(dbA.localOutbox).get();
        expect(outboxA.map((mutation) => mutation.mutationId), ['mut-A']);
      } finally {
        await dbA.close();
        await dbB.close();
      }
    });
  });
}
