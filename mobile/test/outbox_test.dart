import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/database/database.dart';
import 'package:app/core/sync/mutation_repository.dart';

void main() {
  late AppDatabase db;
  late MutationRepository repository;

  setUp(() {
    db = AppDatabase(null); // Anonymous DB for tests
    repository = MutationRepository(db);
  });

  tearDown(() async {
    await db.close();
  });

  test(
    'toggleBookmark enqueues a mutation and updates optimistic state',
    () async {
      // 1. Insert content item
      await db
          .into(db.contentItems)
          .insert(
            ContentItemsCompanion.insert(
              id: 'item-1',
              categoryId: 'cat-1',
              title: 'Title',
              slug: 'title',
              type: 'concept',
              sortOrder: 0,
              updatedAt: DateTime.now(),
            ),
          );

      // 2. Toggle on
      await repository.toggleBookmark('item-1', true);

      // Verify pessimistic state
      final bookmarks = await db.select(db.bookmarks).get();
      expect(bookmarks.length, 1);
      expect(bookmarks.first.contentId, 'item-1');

      // Verify outbox
      final outbox1 = await db.select(db.localOutbox).get();
      expect(outbox1.length, 1);
      expect(outbox1.first.mutationType, 'insert_bookmark');
      expect(outbox1.first.entityId, 'item-1');
      final bookmarkPayload =
          jsonDecode(outbox1.first.payloadJson) as Map<String, dynamic>;
      expect(bookmarkPayload['is_bookmarked'], true);

      // 3. Toggle off
      await repository.toggleBookmark('item-1', false);

      final bookmarks2 = await db.select(db.bookmarks).get();
      expect(bookmarks2.isEmpty, true);

      final outbox2 = await db.select(db.localOutbox).get();
      expect(outbox2.length, 2);
      expect(outbox2.last.mutationType, 'delete_bookmark');
    },
  );

  test(
    'submitReview updates state to pending_sync and enqueues mutation',
    () async {
      // 1. Insert review card
      await db
          .into(db.reviewCards)
          .insert(
            ReviewCardsCompanion.insert(
              id: 'card-1',
              contentId: 'item-1',
              state: 'due',
              rowVersion: 1,
            ),
          );

      // 2. Submit
      await repository.submitReview('card-1', 'good');

      final cards = await db.select(db.reviewCards).get();
      expect(cards.first.state, 'pending_sync');

      final outbox = await db.select(db.localOutbox).get();
      expect(outbox.length, 1);
      expect(outbox.first.entityType, 'review');
      final reviewPayload =
          jsonDecode(outbox.first.payloadJson) as Map<String, dynamic>;
      expect(reviewPayload['rating'], 'good');
    },
  );
}
