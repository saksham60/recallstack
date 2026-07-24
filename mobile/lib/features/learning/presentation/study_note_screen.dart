import 'dart:convert';
import 'package:app/features/catalog/data/catalog_repository.dart';
import 'package:app/features/learning/presentation/blocks/block_renderer_registry.dart';
import 'package:app/core/sync/mutation_repository.dart';
import 'package:app/core/database/database.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

final studyNoteFutureProvider =
    FutureProvider.family<Map<String, dynamic>?, String>((ref, slug) async {
      final repo = ref.watch(catalogRepositoryProvider);
      final contentItem = await repo.getContentItemBySlug(slug);
      if (contentItem == null) return null;
      return ref.watch(studyNoteByIdFutureProvider(contentItem.item.id).future);
    });

final studyNoteByIdFutureProvider =
    FutureProvider.family<Map<String, dynamic>?, String>((
      ref,
      contentId,
    ) async {
      final repo = ref.watch(catalogRepositoryProvider);
      final contentItem = await repo.getContentItem(contentId);
      if (contentItem == null) return null;

      final doc = await repo.getContentDocument(contentId);
      if (doc == null) return {'item': contentItem, 'blocks': []};

      List<dynamic> blocks = [];
      try {
        blocks = jsonDecode(doc.blocksJson) as List<dynamic>;
      } catch (e) {
        // Ignore invalid JSON
      }

      return {'item': contentItem, 'blocks': blocks};
    });

final isBookmarkedProvider = StreamProvider.family<bool, String>((
  ref,
  contentId,
) {
  final db = ref.watch(appDatabaseProvider);
  return (db.select(db.bookmarks)..where((t) => t.contentId.equals(contentId)))
      .watch()
      .map((list) => list.isNotEmpty);
});

class StudyNoteScreen extends ConsumerStatefulWidget {
  final String slug;

  const StudyNoteScreen({super.key, required this.slug});

  @override
  ConsumerState<StudyNoteScreen> createState() => _StudyNoteScreenState();
}

class _StudyNoteScreenState extends ConsumerState<StudyNoteScreen> {
  bool _isMutating = false;

  Future<void> _runMutation(
    Future<void> Function() action,
    String successMessage,
  ) async {
    if (_isMutating) return;
    setState(() => _isMutating = true);
    try {
      await action();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(successMessage)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) {
        setState(() => _isMutating = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final dataAsync = ref.watch(studyNoteFutureProvider(widget.slug));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Study Note'),
        actions: [
          dataAsync.when(
            data: (data) {
              if (data == null) return const SizedBox.shrink();
              final contentId =
                  (data['item'] as ContentItemWithProgress).item.id;
              final isBookmarkedAsync = ref.watch(
                isBookmarkedProvider(contentId),
              );
              final isBookmarked = isBookmarkedAsync.value ?? false;
              return IconButton(
                icon: Icon(
                  isBookmarked ? Icons.bookmark : Icons.bookmark_border,
                ),
                onPressed: _isMutating
                    ? null
                    : () {
                        _runMutation(
                          () => ref
                              .read(mutationRepositoryProvider)
                              .toggleBookmark(contentId, !isBookmarked),
                          isBookmarked
                              ? 'Bookmark removed.'
                              : 'Bookmarked offline. Will sync shortly.',
                        );
                      },
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
      body: dataAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Error: $err')),
        data: (data) {
          if (data == null) {
            return const Center(child: Text('Content not found locally.'));
          }

          final contentWithProg = data['item'] as ContentItemWithProgress;
          final blocks = data['blocks'] as List<dynamic>;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  contentWithProg.item.title,
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    if (contentWithProg.item.difficulty != null)
                      _Badge(
                        text: contentWithProg.item.difficulty!.toUpperCase(),
                      ),
                    const SizedBox(width: 8),
                    _Badge(
                      text: contentWithProg.item.type.toUpperCase(),
                      isOutlined: true,
                    ),
                    const Spacer(),
                    if (contentWithProg.progress?.status != null)
                      Text(
                        'Status: ${contentWithProg.progress!.status}',
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: theme.colorScheme.primary,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 24),
                const Divider(),
                const SizedBox(height: 16),

                // Blocks
                ...blocks.map((block) {
                  if (block is Map<String, dynamic>) {
                    return ContentBlockRendererRegistry.render(block);
                  }
                  return const SizedBox.shrink();
                }),

                const SizedBox(height: 32),
                const Divider(),
                const SizedBox(height: 16),

                // Practice / Notes placeholders
                ElevatedButton.icon(
                  onPressed: _isMutating
                      ? null
                      : () async {
                          final practiceUrl =
                              contentWithProg.item.primaryPracticeUrl;
                          final url = practiceUrl != null
                              ? Uri.parse(practiceUrl)
                              : null;
                          if (url != null && await canLaunchUrl(url)) {
                            await launchUrl(url);
                            if (context.mounted) {
                              _showPracticeOutcomeDialog(
                                context,
                                ref,
                                contentWithProg.item.id,
                              );
                            }
                          } else {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'No practice link available for this item.',
                                  ),
                                ),
                              );
                            }
                          }
                        },
                  icon: const Icon(Icons.code),
                  label: const Text('Practice Externally'),
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size(double.infinity, 50),
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _isMutating
                      ? null
                      : () {
                          _showAddNoteDialog(
                            context,
                            ref,
                            contentWithProg.item.id,
                          );
                        },
                  icon: const Icon(Icons.note_add),
                  label: const Text('Add Note / Mistake'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(double.infinity, 50),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  void _showPracticeOutcomeDialog(
    BuildContext context,
    WidgetRef ref,
    String contentId,
  ) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Practice Outcome'),
        content: const Text('How did you do on this problem?'),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _runMutation(
                () => ref
                    .read(mutationRepositoryProvider)
                    .savePracticeAttempt(contentId, 'solved_independently'),
                'Practice attempt saved.',
              );
            },
            child: const Text(
              'Solved (Independently)',
              style: TextStyle(color: Colors.green),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _runMutation(
                () => ref
                    .read(mutationRepositoryProvider)
                    .savePracticeAttempt(contentId, 'solved_with_hint'),
                'Practice attempt saved.',
              );
            },
            child: const Text(
              'Solved (With Hint)',
              style: TextStyle(color: Colors.lightGreen),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _runMutation(
                () => ref
                    .read(mutationRepositoryProvider)
                    .savePracticeAttempt(
                      contentId,
                      'understood_but_could_not_code',
                    ),
                'Practice attempt saved.',
              );
            },
            child: const Text(
              'Understood, but stuck',
              style: TextStyle(color: Colors.orange),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _runMutation(
                () => ref
                    .read(mutationRepositoryProvider)
                    .savePracticeAttempt(contentId, 'pattern_not_identified'),
                'Practice attempt saved.',
              );
            },
            child: const Text(
              'Completely lost',
              style: TextStyle(color: Colors.red),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _runMutation(
                () => ref
                    .read(mutationRepositoryProvider)
                    .savePracticeAttempt(contentId, 'skipped'),
                'Practice attempt saved.',
              );
            },
            child: const Text('Skipped', style: TextStyle(color: Colors.grey)),
          ),
        ],
      ),
    );
  }

  void _showAddNoteDialog(
    BuildContext context,
    WidgetRef ref,
    String contentId,
  ) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add Note'),
        content: TextField(
          controller: controller,
          maxLines: 4,
          decoration: const InputDecoration(
            hintText: 'Write down key takeaways or mistakes...',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final text = controller.text.trim();
              Navigator.pop(context);
              if (text.isNotEmpty) {
                _runMutation(
                  () => ref
                      .read(mutationRepositoryProvider)
                      .saveUserNote(contentId, text),
                  'Note saved.',
                );
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  final String text;
  final bool isOutlined;

  const _Badge({required this.text, this.isOutlined = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme.secondary;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: isOutlined ? Colors.transparent : color.withAlpha(25),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(
          color: isOutlined
              ? theme.colorScheme.outlineVariant
              : color.withAlpha(128),
        ),
      ),
      child: Text(
        text,
        style: theme.textTheme.labelSmall?.copyWith(
          color: isOutlined ? theme.colorScheme.onSurfaceVariant : color,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
