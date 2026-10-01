import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_failure.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../../../shared/widgets/states.dart';
import 'feed_controller.dart';
import 'feed_models.dart';
import 'feed_preferences_sheet.dart';
import 'story_chat_sheet.dart';

class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});
  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  final scroll = ScrollController();
  @override
  void initState() {
    super.initState();
    scroll.addListener(() {
      if (scroll.hasClients && scroll.position.extentAfter < 600) {
        ref.read(feedControllerProvider.notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final feed = ref.watch(feedControllerProvider);
    final controller = ref.read(feedControllerProvider.notifier);
    return Scaffold(
      appBar: AppBar(
        title: const Text('ReasonAI'),
        actions: [
          IconButton(
            tooltip: 'Tune feed',
            icon: const Icon(Icons.tune),
            onPressed: () => openFeedPreferences(context),
          ),
        ],
      ),
      body: Column(
        children: [
          SizedBox(
            height: 54,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                for (final topic in feedTopics.entries)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(topic.value),
                      selected: feed.topic == topic.key,
                      onSelected: (_) {
                        if (feed.topic == topic.key) return;
                        scroll.jumpTo(0);
                        controller.load(topic.key);
                      },
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: feed.initialLoading
                ? ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      SkeletonBox(
                        height: math.min(
                          MediaQuery.sizeOf(context).width * 0.6,
                          210,
                        ),
                      ),
                      const SizedBox(height: 16),
                      SkeletonBox(
                        height: math.min(
                          MediaQuery.sizeOf(context).width * 0.6,
                          210,
                        ),
                      ),
                    ],
                  )
                : feed.failure != null && feed.stories.isEmpty
                ? ErrorState(error: feed.failure!, onRetry: controller.refresh)
                : feed.stories.isEmpty
                ? const EmptyState(
                    icon: Icons.newspaper,
                    title: 'Nothing here yet',
                    body: 'Try another topic or refresh your feed.',
                  )
                : LayoutBuilder(
                    builder: (context, viewport) => RefreshIndicator(
                      onRefresh: controller.refresh,
                      child: ListView.separated(
                        controller: scroll,
                        padding: const EdgeInsets.all(16),
                        itemCount:
                            feed.stories.length +
                            (feed.hasMore || feed.pageFailure != null ? 1 : 0),
                        separatorBuilder: (_, _) => const SizedBox(height: 16),
                        itemBuilder: (context, index) {
                          if (index == feed.stories.length) {
                            if (feed.pageFailure != null) {
                              return TextButton(
                                onPressed: controller.loadMore,
                                child: Text(
                                  '${ApiFailure.from(feed.pageFailure!).userMessage} Retry',
                                ),
                              );
                            }
                            return feed.loadingMore
                                ? const Center(
                                    child: Padding(
                                      padding: EdgeInsets.all(12),
                                      child: CircularProgressIndicator(),
                                    ),
                                  )
                                : TextButton(
                                    onPressed: controller.loadMore,
                                    child: const Text('Load more'),
                                  );
                          }
                          final story = feed.stories[index];
                          controller.trackView(story.id);
                          return StoryCard(
                            story: story,
                            viewportHeight: viewport.maxHeight,
                            onTap: () => context.push(
                              '/story/${Uri.encodeComponent(story.id)}',
                            ),
                          );
                        },
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class StoryCard extends ConsumerWidget {
  const StoryCard({
    super.key,
    required this.story,
    required this.onTap,
    required this.viewportHeight,
  });
  final Story story;
  final VoidCallback onTap;
  final double viewportHeight;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final width = MediaQuery.sizeOf(context).width - 32;
    final imageHeight = math.min(width / (16 / 9), viewportHeight * 0.34);
    final compact = viewportHeight < 460;
    final theme = Theme.of(context);
    final askStyle = FilledButton.styleFrom(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      minimumSize: const Size(0, 42),
      visualDensity: VisualDensity.compact,
    );
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppNetworkImage(
              url: story.imageUrl,
              height: imageHeight,
              radius: 0,
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          story.sourceName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelSmall,
                        ),
                      ),
                      if (story.topics.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Text('·', style: theme.textTheme.labelSmall),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            story.topics.first,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.labelSmall,
                          ),
                        ),
                      ],
                      const SizedBox(width: 8),
                      Text(story.ageLabel(), style: theme.textTheme.labelSmall),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    story.title,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 5),
                  Text(
                    story.summary,
                    maxLines: compact ? 1 : 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      IconButton(
                        tooltip: story.saved ? 'Unsave' : 'Save',
                        visualDensity: VisualDensity.compact,
                        onPressed: () async {
                          final ok = await ref
                              .read(feedControllerProvider.notifier)
                              .toggleSave(story);
                          if (!ok && context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Could not update saved story.'),
                              ),
                            );
                          }
                        },
                        icon: Icon(
                          story.saved ? Icons.bookmark : Icons.bookmark_outline,
                        ),
                      ),
                      IconButton(
                        tooltip: 'Not interested',
                        visualDensity: VisualDensity.compact,
                        onPressed: () async {
                          final controller = ref.read(
                            feedControllerProvider.notifier,
                          );
                          final ok = await controller.hide(story);
                          if (ok && context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: const Text('Story hidden'),
                                action: SnackBarAction(
                                  label: 'Undo',
                                  onPressed: () => controller.undoHide(story),
                                ),
                              ),
                            );
                          } else if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  ApiFailure(FailureKind.unknown).userMessage,
                                ),
                              ),
                            );
                          }
                        },
                        icon: const Icon(Icons.visibility_off_outlined),
                      ),
                      const Spacer(),
                      if (width < 350)
                        FilledButton(
                          onPressed: () => showStoryChat(context, story),
                          style: askStyle,
                          child: Text(
                            MediaQuery.textScalerOf(context).scale(13) > 15
                                ? 'Ask\nReasonAI'
                                : 'Ask ReasonAI',
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 13, height: 1.05),
                          ),
                        )
                      else
                        FilledButton.icon(
                          onPressed: () => showStoryChat(context, story),
                          style: askStyle,
                          icon: const Icon(Icons.auto_awesome, size: 18),
                          label: const Text(
                            'Ask ReasonAI',
                            style: TextStyle(fontSize: 13),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
