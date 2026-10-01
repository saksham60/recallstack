import 'dart:async';
import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../../../core/db/app_database.dart';
import 'feed_api.dart';
import 'feed_models.dart';

class FeedState {
  const FeedState({
    this.topic = '',
    this.stories = const [],
    this.cursor,
    this.hasMore = false,
    this.initialLoading = true,
    this.loadingMore = false,
    this.failure,
    this.pageFailure,
  });
  final String topic;
  final List<Story> stories;
  final String? cursor;
  final bool hasMore, initialLoading, loadingMore;
  final Object? failure, pageFailure;
}

class FeedController extends Notifier<FeedState> {
  CancelToken? _token;
  Timer? _eventTimer;
  late FeedApi _api;
  int _generation = 0;
  final _mutating = <String>{};
  final _viewed = <String>{};
  final _asked = <String>{};
  final _pendingEvents = <Map<String, dynamic>>[];
  @override
  FeedState build() {
    _api = ref.read(feedApiProvider);
    ref.onDispose(() {
      _token?.cancel();
      _flushEvents();
    });
    Future.microtask(load);
    return const FeedState();
  }

  void trackView(String id) {
    if (!_viewed.add(id)) return;
    _pendingEvents.add({
      'eventId': const Uuid().v4(),
      'storyId': id,
      'type': 'VIEW',
      'occurredAt': DateTime.now().toUtc().toIso8601String(),
    });
    if (_pendingEvents.length >= 100) {
      _flushEvents();
    } else {
      _eventTimer ??= Timer(const Duration(milliseconds: 750), _flushEvents);
    }
  }

  void trackReasonAI(String id) {
    if (!_asked.add(id)) return;
    unawaited(_api.event(id, 'ASK_REASONAI').catchError((Object _) {}));
  }

  void _flushEvents() {
    _eventTimer?.cancel();
    _eventTimer = null;
    if (_pendingEvents.isEmpty) return;
    final batch = [..._pendingEvents];
    _pendingEvents.clear();
    unawaited(_api.events(batch).catchError((Object _) {}));
  }

  Future<void> load([String? selected]) async {
    final topic = selected ?? state.topic;
    _token?.cancel();
    final token = _token = CancelToken();
    final generation = ++_generation;
    state = FeedState(
      topic: topic,
      stories: selected == null ? state.stories : [],
      initialLoading: selected != null || state.stories.isEmpty,
    );
    try {
      final page = await ref
          .read(feedApiProvider)
          .page(topic: topic, token: token);
      if (generation != _generation || token.isCancelled) return;
      state = FeedState(
        topic: topic,
        stories: page.items,
        cursor: page.nextCursor,
        hasMore: page.hasMore,
        initialLoading: false,
      );
      await _reconcile(page.items);
    } catch (error) {
      if (generation != _generation || token.isCancelled) return;
      state = FeedState(
        topic: topic,
        stories: state.stories,
        initialLoading: false,
        failure: error,
      );
    }
  }

  Future<void> refresh() => load();
  Future<void> loadMore() async {
    if (state.loadingMore ||
        state.initialLoading ||
        !state.hasMore ||
        state.cursor == null) {
      return;
    }
    final before = state;
    final generation = _generation;
    final token = _token = CancelToken();
    state = FeedState(
      topic: before.topic,
      stories: before.stories,
      cursor: before.cursor,
      hasMore: before.hasMore,
      initialLoading: false,
      loadingMore: true,
    );
    try {
      final page = await ref
          .read(feedApiProvider)
          .page(topic: before.topic, cursor: before.cursor, token: token);
      if (generation != _generation || token.isCancelled) return;
      final ids = before.stories.map((story) => story.id).toSet();
      state = FeedState(
        topic: before.topic,
        stories: [
          ...before.stories,
          ...page.items.where((story) => ids.add(story.id)),
        ],
        cursor: page.nextCursor,
        hasMore: page.hasMore,
        initialLoading: false,
      );
      await _reconcile(page.items);
    } catch (error) {
      if (generation != _generation || token.isCancelled) return;
      state = FeedState(
        topic: before.topic,
        stories: before.stories,
        cursor: before.cursor,
        hasMore: before.hasMore,
        initialLoading: false,
        pageFailure: error,
      );
    }
  }

  Future<void> _reconcile(List<Story> stories) async {
    final db = ref.read(appDatabaseProvider);
    for (final story in stories.where((item) => !item.saved)) {
      await db.removeSaved(story.id);
    }
  }

  Future<bool> toggleSave(Story story) async {
    if (!_mutating.add(story.id)) return true;
    final target = !story.saved;
    final before = state;
    state = FeedState(
      topic: before.topic,
      stories: [
        for (final item in before.stories)
          item.id == story.id ? item.withSaved(target) : item,
      ],
      cursor: before.cursor,
      hasMore: before.hasMore,
      initialLoading: before.initialLoading,
      loadingMore: before.loadingMore,
      failure: before.failure,
      pageFailure: before.pageFailure,
    );
    try {
      await ref
          .read(feedApiProvider)
          .event(story.id, target ? 'SAVE' : 'UNSAVE');
      final db = ref.read(appDatabaseProvider);
      if (target) {
        await db.upsertSaved(
          SavedStoriesCompanion.insert(
            id: story.id,
            title: story.title,
            sourceName: story.sourceName,
            imageUrl: Value(story.imageUrl),
            publishedAt: story.publishedAt,
            savedAt: DateTime.now(),
          ),
        );
      } else {
        await db.removeSaved(story.id);
      }
      return true;
    } catch (_) {
      final current = state;
      state = FeedState(
        topic: current.topic,
        stories: [
          for (final item in current.stories)
            item.id == story.id ? item.withSaved(story.saved) : item,
        ],
        cursor: current.cursor,
        hasMore: current.hasMore,
        initialLoading: current.initialLoading,
        loadingMore: current.loadingMore,
        failure: current.failure,
        pageFailure: current.pageFailure,
      );
      return false;
    } finally {
      _mutating.remove(story.id);
    }
  }

  Future<bool> hide(Story story) async {
    if (!_mutating.add(story.id)) return false;
    final before = state;
    final generation = _generation;
    final index = before.stories.indexWhere((item) => item.id == story.id);
    state = FeedState(
      topic: before.topic,
      stories: before.stories.where((item) => item.id != story.id).toList(),
      cursor: before.cursor,
      hasMore: before.hasMore,
      initialLoading: false,
      loadingMore: before.loadingMore,
      failure: before.failure,
      pageFailure: before.pageFailure,
    );
    try {
      await ref.read(feedApiProvider).event(story.id, 'HIDE');
      return true;
    } catch (_) {
      if (generation == _generation && index >= 0) {
        final current = state;
        final restored = [...current.stories];
        if (!restored.any((item) => item.id == story.id)) {
          restored.insert(index.clamp(0, restored.length), story);
        }
        state = FeedState(
          topic: current.topic,
          stories: restored,
          cursor: current.cursor,
          hasMore: current.hasMore,
          initialLoading: current.initialLoading,
          loadingMore: current.loadingMore,
          failure: current.failure,
          pageFailure: current.pageFailure,
        );
      }
      return false;
    } finally {
      _mutating.remove(story.id);
    }
  }

  Future<void> undoHide(Story story) async {
    await ref.read(feedApiProvider).event(story.id, 'UNHIDE');
    await refresh();
  }
}

final feedControllerProvider = NotifierProvider<FeedController, FeedState>(
  FeedController.new,
);
final storyProvider = FutureProvider.autoDispose.family<Story, String>((
  ref,
  id,
) async {
  final story = await ref.watch(feedApiProvider).story(id);
  if (!story.saved) await ref.read(appDatabaseProvider).removeSaved(id);
  return story;
});
