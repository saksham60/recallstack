import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/db/app_database.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../../../shared/widgets/states.dart';
import '../../dsa/dsa_api.dart';
import '../../feed/presentation/feed_api.dart';
import '../../feed/presentation/feed_controller.dart';

final savedStoriesProvider = StreamProvider<List<SavedStory>>(
  (ref) => ref.watch(appDatabaseProvider).watchSaved(),
);

class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({super.key});
  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen> {
  final query = TextEditingController();
  Timer? debounce;
  CancelToken? searchToken;
  int generation = 0;
  List<Map<String, dynamic>> results = [];
  bool searching = false;
  Object? failure;
  @override
  void dispose() {
    debounce?.cancel();
    searchToken?.cancel();
    query.dispose();
    super.dispose();
  }

  void _search(String value) {
    debounce?.cancel();
    searchToken?.cancel();
    final current = ++generation;
    if (value.trim().length < 2) {
      setState(() {
        results = [];
        searching = false;
        failure = null;
      });
      return;
    }
    setState(() {
      searching = true;
      failure = null;
    });
    debounce = Timer(const Duration(milliseconds: 350), () async {
      final token = searchToken = CancelToken();
      try {
        final found = await ref
            .read(dsaApiProvider)
            .search(value.trim(), token);
        if (mounted && current == generation && !token.isCancelled) {
          setState(() {
            results = found;
            searching = false;
          });
        }
      } catch (error) {
        if (mounted && current == generation && !token.isCancelled) {
          setState(() {
            failure = error;
            searching = false;
          });
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 3,
    child: Scaffold(
      appBar: AppBar(
        title: const Text('Library'),
        bottom: const TabBar(
          tabs: [
            Tab(text: 'Saved'),
            Tab(text: 'Bookmarks'),
            Tab(text: 'Search'),
          ],
        ),
      ),
      body: TabBarView(
        children: [
          ref
              .watch(savedStoriesProvider)
              .when(
                loading: () => const ListSkeleton(itemHeight: 72),
                error: (e, _) => ErrorState(
                  error: e,
                  onRetry: () => ref.invalidate(savedStoriesProvider),
                ),
                data: (saved) => saved.isEmpty
                    ? EmptyState(
                        icon: Icons.bookmark_outline,
                        title: 'No saved stories yet',
                        body:
                            'Your saved stories and learning material will appear here.',
                        action: OutlinedButton(
                          onPressed: () => context.go('/feed'),
                          child: const Text('Explore Feed'),
                        ),
                      )
                    : ListView.builder(
                        itemCount: saved.length,
                        itemBuilder: (context, index) {
                          final story = saved[index];
                          return Dismissible(
                            key: ValueKey(story.id),
                            background: const ColoredBox(
                              color: Colors.red,
                              child: Align(
                                alignment: Alignment.centerRight,
                                child: Padding(
                                  padding: EdgeInsets.all(16),
                                  child: Icon(Icons.delete_outline),
                                ),
                              ),
                            ),
                            direction: DismissDirection.endToStart,
                            confirmDismiss: (_) async {
                              try {
                                final remote = await ref
                                    .read(feedApiProvider)
                                    .story(story.id);
                                if (remote.saved) {
                                  final ok = await ref
                                      .read(feedControllerProvider.notifier)
                                      .toggleSave(remote);
                                  if (!ok) throw Exception('Unsave failed');
                                } else {
                                  await ref
                                      .read(appDatabaseProvider)
                                      .removeSaved(story.id);
                                }
                                return true;
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(
                                        ApiFailure.from(e).userMessage,
                                      ),
                                    ),
                                  );
                                }
                                return false;
                              }
                            },
                            child: ListTile(
                              leading: SizedBox(
                                width: 52,
                                height: 52,
                                child: AppNetworkImage(
                                  url: story.imageUrl,
                                  aspectRatio: 1,
                                  radius: 8,
                                ),
                              ),
                              title: Text(story.title),
                              subtitle: Text(
                                '${story.sourceName} · Saved on this device',
                              ),
                              onTap: () => context.push(
                                '/story/${Uri.encodeComponent(story.id)}',
                              ),
                            ),
                          );
                        },
                      ),
              ),
          ref
              .watch(bookmarksProvider)
              .when(
                loading: () => const ListSkeleton(itemHeight: 72),
                error: (e, _) => ErrorState(
                  error: e,
                  onRetry: () => ref.invalidate(bookmarksProvider),
                ),
                data: (bookmarks) => bookmarks.isEmpty
                    ? EmptyState(
                        icon: Icons.bookmark_border,
                        title: 'No DSA bookmarks',
                        body: 'Bookmark a problem in DSA to find it here.',
                        action: OutlinedButton(
                          onPressed: () => context.go('/dsa'),
                          child: const Text('Browse DSA'),
                        ),
                      )
                    : ListView.builder(
                        itemCount: bookmarks.length,
                        itemBuilder: (context, index) {
                          final item = bookmarks[index];
                          return ListTile(
                            title: Text(item['title'] as String? ?? ''),
                            subtitle: Text(_relativeDate(item['created_at'])),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => context.push(
                              '/dsa/problems/${Uri.encodeComponent(item['slug'] as String)}',
                            ),
                          );
                        },
                      ),
              ),
          Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: TextField(
                  controller: query,
                  autofocus: true,
                  onChanged: _search,
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    hintText: 'Search DSA problems',
                  ),
                ),
              ),
              Expanded(
                child: searching
                    ? const ListSkeleton(itemHeight: 72)
                    : failure != null
                    ? ErrorState(
                        error: failure!,
                        onRetry: () => _search(query.text),
                      )
                    : results.isEmpty
                    ? const EmptyState(
                        icon: Icons.search,
                        title: 'Find a problem',
                        body: 'Type at least two characters to search DSA.',
                      )
                    : ListView.builder(
                        itemCount: results.length,
                        itemBuilder: (context, index) {
                          final item = results[index];
                          return ListTile(
                            title: Text(item['title'] as String? ?? ''),
                            subtitle: Text(
                              item['summary_excerpt'] as String? ?? '',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            onTap: () => context.push(
                              '/dsa/problems/${Uri.encodeComponent(item['slug'] as String)}',
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

String _relativeDate(Object? value) {
  final date = DateTime.tryParse(value?.toString() ?? '');
  if (date == null) return '';
  final days = DateTime.now().difference(date).inDays;
  if (days <= 0) return 'Today';
  if (days == 1) return 'Yesterday';
  return '$days days ago';
}
