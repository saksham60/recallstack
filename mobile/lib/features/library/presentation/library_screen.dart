import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/shared/theme/app_colors.dart';
import 'package:app/core/database/database.dart';

final bookmarkedItemsProvider = StreamProvider<List<Bookmark>>((ref) {
  final db = ref.watch(appDatabaseProvider);
  return db.select(db.bookmarks).watch();
});

class LibraryScreen extends ConsumerWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Library', style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: -0.5)),
          actions: [
            IconButton(
              icon: const Icon(Icons.search),
              onPressed: () {
                // Open search
              },
            ),
          ],
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Bookmarks'),
              Tab(text: 'History'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _BookmarksTab(),
            _HistoryTab(),
          ],
        ),
      ),
    );
  }
}

class _BookmarksTab extends ConsumerWidget {
  const _BookmarksTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bookmarksAsync = ref.watch(bookmarkedItemsProvider);

    return bookmarksAsync.when(
      data: (bookmarks) {
        if (bookmarks.isEmpty) {
          return const Center(child: Text('No bookmarks yet.'));
        }
        return ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: bookmarks.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final bm = bookmarks[index];
            return ListTile(
              title: Text('Content ${bm.contentId}', style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: const Text('Bookmarked item'),
              leading: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.accent.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.bookmark, color: AppColors.accent),
              ),
              trailing: const Icon(Icons.chevron_right, color: AppColors.textMuted),
              onTap: () {
                // Normally we'd get the slug and push to /content/:slug
                // Or push by ID if supported
              },
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, st) => Center(child: Text('Error: $e')),
    );
  }
}

class _HistoryTab extends ConsumerWidget {
  const _HistoryTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return const Center(
      child: Text('Recent activity will appear here.'),
    );
  }
}
