import 'dart:convert';
import 'package:app/core/database/database.dart';
import 'package:drift/drift.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:uuid/uuid.dart';

part 'mutation_repository.g.dart';

class MutationRepository {
  final AppDatabase _db;
  final _uuid = const Uuid();

  MutationRepository(this._db);

  /// Enqueues a mutation into the outbox.
  Future<void> enqueueMutation(String type, String entityType, String entityId, Map<String, dynamic> payload) async {
    final mutationId = _uuid.v4();
    final jsonPayload = jsonEncode(payload);

    await _db.into(_db.localOutbox).insert(LocalOutboxCompanion.insert(
      mutationId: mutationId,
      mutationType: type,
      entityType: entityType,
      entityId: entityId,
      payloadJson: jsonPayload,
      status: 'pending',
      createdAt: DateTime.now(),
      retryCount: const Value(0),
    ));
  }

  /// Toggles a bookmark locally and enqueues the mutation.
  Future<void> toggleBookmark(String contentId, bool isBookmarked) async {
    await _db.transaction(() async {
      // 1. Optimistic update
      if (isBookmarked) {
        await _db.into(_db.bookmarks).insert(
          BookmarksCompanion.insert(
            contentId: contentId,
            createdAt: DateTime.now(),
          ),
          mode: InsertMode.insertOrReplace,
        );
      } else {
        await (_db.delete(_db.bookmarks)..where((t) => t.contentId.equals(contentId))).go();
      }

      // 2. Enqueue mutation
      await enqueueMutation(isBookmarked ? 'insert_bookmark' : 'delete_bookmark', 'bookmark', contentId, {
        'is_bookmarked': isBookmarked,
      });
    });
  }

  /// Saves a user note locally and enqueues the mutation.
  Future<void> saveUserNote(String contentId, String noteText) async {
    await _db.transaction(() async {
      final noteId = _uuid.v4();
      await _db.into(_db.userNotes).insert(
        UserNotesCompanion.insert(
          id: noteId,
          contentId: contentId,
          type: 'note',
          body: noteText,
          rowVersion: 1,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        ),
        mode: InsertMode.insertOrReplace,
      );

      await enqueueMutation('save_note', 'note', noteId, {
        'content_item_id': contentId,
        'kind': 'note',
        'body': noteText,
      });
    });
  }

  /// Saves a practice attempt
  Future<void> savePracticeAttempt(String contentId, String outcome) async {
    await _db.transaction(() async {
      await enqueueMutation('practice_attempt', 'practice_attempt', contentId, {
        'content_item_id': contentId,
        'outcome': outcome,
        'attempted_at': DateTime.now().toUtc().toIso8601String(),
        'hint_used': false,
      });
    });
  }

  /// Submits a flashcard review
  Future<void> submitReview(String cardId, String rating) async {
    await _db.transaction(() async {
      final card = await (_db.select(_db.reviewCards)..where((t) => t.id.equals(cardId))).getSingle();
      final reviewEventId = _uuid.v4();
      
      // Do not locally compute the exact next_review_at here; we just optimistic update state to 'pending_sync'
      // letting the backend scheduler authoritative compute.
      await (_db.update(_db.reviewCards)..where((t) => t.id.equals(cardId)))
          .write(const ReviewCardsCompanion(state: Value('pending_sync')));

      await enqueueMutation('review_card', 'review', cardId, {
        'review_event_id': reviewEventId,
        'rating': rating,
        'expected_row_version': card.rowVersion,
        'reviewed_at': DateTime.now().toUtc().toIso8601String(),
      });
    });
  }
}

@riverpod
MutationRepository mutationRepository(Ref ref) {
  return MutationRepository(ref.watch(appDatabaseProvider));
}
