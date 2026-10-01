import 'dart:async';
import 'package:app/core/db/app_database.dart';
import 'package:app/features/feed/presentation/feed_api.dart';
import 'package:app/features/feed/presentation/feed_controller.dart';
import 'package:app/features/feed/presentation/feed_models.dart';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _story(String id) => {
  'id': id,
  'title': 'Title $id',
  'summary': 'Summary',
  'whyItMatters': 'Useful',
  'source': {'key': 'source', 'name': 'Source'},
  'sourceUrl': 'https://example.com',
  'imageUrl': '',
  'publishedAt': '2026-09-30T00:00:00Z',
  'topics': ['ai'],
  'importanceScore': 1,
  'qualityScore': 1,
  'viewerState': {'saved': false, 'seenAt': null},
};
FeedPage _page(List<String> ids, String? cursor, bool more) =>
    FeedPage(ids.map((id) => Story.parse(_story(id))).toList(), cursor, more);

class _FakeFeedApi extends FeedApi {
  _FakeFeedApi() : super(Dio());
  final pages = <Completer<FeedPage>>[];
  bool failEvent = false;
  @override
  Future<FeedPage> page({
    String topic = '',
    String? cursor,
    CancelToken? token,
  }) {
    final response = Completer<FeedPage>();
    pages.add(response);
    return response.future;
  }

  @override
  Future<void> event(String storyId, String type) async {
    if (failEvent) throw Exception('event failed');
  }
}

Future<void> _settle() async {
  await Future<void>.delayed(const Duration(milliseconds: 15));
}

void main() {
  test(
    'pagination appends, deduplicates, and keeps cards on page failure',
    () async {
      final api = _FakeFeedApi();
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      final container = ProviderContainer(
        overrides: [
          feedApiProvider.overrideWithValue(api),
          appDatabaseProvider.overrideWithValue(db),
        ],
      );
      addTearDown(() async {
        container.dispose();
        await db.close();
      });
      container.read(feedControllerProvider);
      await _settle();
      expect(api.pages, hasLength(1));
      api.pages[0].complete(_page(['a'], 'cursor1', true));
      await _settle();
      final controller = container.read(feedControllerProvider.notifier);
      final loading = controller.loadMore();
      await _settle();
      expect(container.read(feedControllerProvider).stories.map((e) => e.id), [
        'a',
      ]);
      api.pages[1].complete(_page(['a', 'b'], 'cursor2', true));
      await loading;
      expect(container.read(feedControllerProvider).stories.map((e) => e.id), [
        'a',
        'b',
      ]);
      final failing = controller.loadMore();
      await _settle();
      api.pages[2].completeError(Exception('offline'));
      await failing;
      final afterFailure = container.read(feedControllerProvider);
      expect(afterFailure.stories.map((e) => e.id), ['a', 'b']);
      expect(afterFailure.pageFailure, isNotNull);
    },
  );
  test(
    'topic switch ignores a late previous response and save rolls back',
    () async {
      final api = _FakeFeedApi();
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      final container = ProviderContainer(
        overrides: [
          feedApiProvider.overrideWithValue(api),
          appDatabaseProvider.overrideWithValue(db),
        ],
      );
      addTearDown(() async {
        container.dispose();
        await db.close();
      });
      container.read(feedControllerProvider);
      await _settle();
      final controller = container.read(feedControllerProvider.notifier);
      final changed = controller.load('ai');
      await _settle();
      api.pages[1].complete(_page(['new'], null, false));
      await changed;
      api.pages[0].complete(_page(['old'], null, false));
      await _settle();
      expect(container.read(feedControllerProvider).stories.single.id, 'new');
      api.failEvent = true;
      final saved = await controller.toggleSave(
        container.read(feedControllerProvider).stories.single,
      );
      expect(saved, isFalse);
      expect(
        container.read(feedControllerProvider).stories.single.saved,
        isFalse,
      );
    },
  );
}
