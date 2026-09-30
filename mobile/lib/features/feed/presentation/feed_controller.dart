import 'package:app/features/feed/data/feed_repository.dart';
import 'package:app/features/feed/domain/story.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'feed_controller.g.dart';

@riverpod
class FeedController extends _$FeedController {
  @override
  FutureOr<List<Story>> build() async {
    return _fetchInitial();
  }

  Future<List<Story>> _fetchInitial() async {
    final repository = ref.read(feedRepositoryProvider);
    final response = await repository.getKnowledgeFeed(limit: 10);
    ref.read(feedCursorProvider.notifier).state = response.nextCursor;
    ref.read(feedHasMoreProvider.notifier).state = response.hasMore;
    return response.items;
  }

  Future<void> fetchNextPage() async {
    final hasMore = ref.read(feedHasMoreProvider);
    if (!hasMore || state.isLoading) return;

    final cursor = ref.read(feedCursorProvider);
    final repository = ref.read(feedRepositoryProvider);

    state = const AsyncValue.loading();

    try {
      final response = await repository.getKnowledgeFeed(cursor: cursor, limit: 10);
      ref.read(feedCursorProvider.notifier).state = response.nextCursor;
      ref.read(feedHasMoreProvider.notifier).state = response.hasMore;

      final previousItems = state.value ?? [];
      state = AsyncValue.data([...previousItems, ...response.items]);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    try {
      final items = await _fetchInitial();
      state = AsyncValue.data(items);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}

@riverpod
class FeedCursor extends _$FeedCursor {
  @override
  String? build() => null;
}

@riverpod
class FeedHasMore extends _$FeedHasMore {
  @override
  bool build() => true;
}

@riverpod
class StoryDetail extends _$StoryDetail {
  @override
  FutureOr<Story> build(String id) async {
    return ref.read(feedRepositoryProvider).getStory(id);
  }
}
