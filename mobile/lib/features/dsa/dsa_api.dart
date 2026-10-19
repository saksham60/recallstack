import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import 'dart:convert';
import '../../core/db/app_database.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_failure.dart';
import 'dsa_models.dart';

Map<String, dynamic> asMap(Object? value) =>
    Map<String, dynamic>.from(value as Map);
List<Map<String, dynamic>> items(Object? value) =>
    (asMap(value)['items'] as List).map((item) => asMap(item)).toList();

class DsaApi {
  DsaApi(this.dio, {this.database});
  final Dio dio;
  final AppDatabase? database;
  final Map<String, Map<String, dynamic>> _reviews = {};
  Future<T> _call<T>(Future<T> Function() work) async {
    try {
      return await work();
    } catch (e) {
      throw ApiFailure.from(e);
    }
  }

  Future<List<Map<String, dynamic>>> _allItems(
    String path,
    int pageSize,
  ) async {
    final result = <Map<String, dynamic>>[];
    for (var page = 1; page <= 1000; page++) {
      final body = asMap(
        (await dio.get(
          path,
          queryParameters: {'page': page, 'page_size': pageSize},
        )).data,
      );
      result.addAll((body['items'] as List).map(asMap));
      final pagination = body['pagination'];
      if (pagination is! Map || pagination['total_pages'] is! int) {
        throw const FormatException('Missing pagination');
      }
      if (page >= (pagination['total_pages'] as int)) return result;
    }
    throw const FormatException('Pagination exceeded the supported limit.');
  }

  Future<List<Map<String, dynamic>>> categories() => _call(() async {
    final data = (await dio.get('domains/dsa/categories')).data;
    if (data is! List) throw const FormatException('Invalid categories');
    return data.map(asMap).toList();
  });
  Future<List<Map<String, dynamic>>> categoryContent(String id) => _call(
    () => _allItems('categories/${Uri.encodeComponent(id)}/content', 50),
  );
  Future<StudyNote> studyNote(String slug) => _call(
    () async => StudyNote.parse(
      (await dio.get('content/${Uri.encodeComponent(slug)}')).data,
    ),
  );
  Future<void> setBookmark(String id, bool saved) => _call(() async {
    if (saved) {
      await dio.put('me/bookmarks/${Uri.encodeComponent(id)}');
    } else {
      await dio.delete('me/bookmarks/${Uri.encodeComponent(id)}');
    }
  });
  Future<List<Map<String, dynamic>>> bookmarks() =>
      _call(() => _allItems('me/bookmarks', 100));
  Future<List<Map<String, dynamic>>> allNotes() =>
      _call(() => _allItems('me/notes', 100));
  Future<List<Map<String, dynamic>>> notes(String id) => _call(
    () => _allItems('me/content/${Uri.encodeComponent(id)}/notes', 100),
  );
  Future<void> addNote(String id, String kind, String body) => _call(() async {
    await dio.post(
      'me/notes',
      data: {'content_item_id': id, 'kind': kind, 'body': body},
    );
  });
  Future<void> practiceAttempt(
    String id,
    String outcome, {
    bool hintUsed = false,
  }) => _call(() async {
    await dio.post(
      'practice/attempts',
      data: {
        'attempt_event_id': const Uuid().v4(),
        'content_item_id': id,
        'outcome': outcome,
        'attempted_at': DateTime.now().toUtc().toIso8601String(),
        'hint_used': hintUsed,
      },
    );
  });
  Future<List<Map<String, dynamic>>> dueReviews() =>
      _call(() => _allItems('me/reviews/due', 100));
  Future<void> submitReview(Map<String, dynamic> card, String rating) =>
      _call(() async {
        final key = 'review:${card['card_id']}:${card['row_version']}:$rating';
        final stored = await database?.readRecord(key);
        final body = stored == null
            ? (_reviews[key] ??= {
                'review_event_id': const Uuid().v4(),
                'rating': rating,
                'reviewed_at': DateTime.now().toUtc().toIso8601String(),
                'expected_row_version': card['row_version'],
              })
            : Map<String, dynamic>.from(jsonDecode(stored) as Map);
        await database?.writeRecord(key, jsonEncode(body));
        await dio.post(
          'me/reviews/${Uri.encodeComponent(card['card_id'] as String)}/submit',
          data: body,
        );
        _reviews.remove(key);
        await database?.deleteRecord(key);
      });
  Future<List<Map<String, dynamic>>> search(String query, CancelToken token) =>
      _call(
        () async => items(
          (await dio.get(
            'search',
            cancelToken: token,
            queryParameters: {'q': query, 'domain': 'dsa', 'page_size': 25},
          )).data,
        ),
      );
}

final dsaApiProvider = Provider<DsaApi>(
  (ref) => DsaApi(
    ref.watch(backendDioProvider),
    database: ref.watch(appDatabaseProvider),
  ),
);
final categoriesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) => ref.watch(dsaApiProvider).categories(),
    );
final categoryContentProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>(
      (ref, id) => ref.watch(dsaApiProvider).categoryContent(id),
    );
final studyNoteProvider = FutureProvider.autoDispose.family<StudyNote, String>(
  (ref, slug) => ref.watch(dsaApiProvider).studyNote(slug),
);
final notesProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>(
      (ref, id) => ref.watch(dsaApiProvider).notes(id),
    );
final bookmarksProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) => ref.watch(dsaApiProvider).bookmarks(),
    );
final dueReviewsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) => ref.watch(dsaApiProvider).dueReviews(),
    );
final allNotesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => ref.watch(dsaApiProvider).allNotes(),
);
