import 'dart:convert';
import 'package:app/features/catalog/data/catalog_repository.dart';
import 'package:app/features/learning/presentation/blocks/block_renderer_registry.dart';
import 'package:app/core/sync/mutation_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

final studyNoteFutureProvider = FutureProvider.family<Map<String, dynamic>?, String>((ref, slug) async {
  final repo = ref.watch(catalogRepositoryProvider);
  final contentItem = await repo.getContentItemBySlug(slug);
  if (contentItem == null) return null;

  final doc = await repo.getContentDocument(contentItem.item.id);
  if (doc == null) return {'item': contentItem, 'blocks': []};

  List<dynamic> blocks = [];
  try {
    blocks = jsonDecode(doc.blocksJson) as List<dynamic>;
  } catch (e) {
    // Ignore invalid JSON
  }

  return {
    'item': contentItem,
    'blocks': blocks,
  };
});

class StudyNoteScreen extends ConsumerWidget {
  final String slug;

  const StudyNoteScreen({super.key, required this.slug});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dataAsync = ref.watch(studyNoteFutureProvider(slug));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Study Note'),
        actions: [
          IconButton(
            icon: const Icon(Icons.bookmark_border),
            onPressed: () {
              ref.read(mutationRepositoryProvider).toggleBookmark(slug, true);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Bookmarked offline. Will sync shortly.')),
              );
            },
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
                  style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    if (contentWithProg.item.difficulty != null)
                      _Badge(text: contentWithProg.item.difficulty!.toUpperCase()),
                    const SizedBox(width: 8),
                    _Badge(text: contentWithProg.item.type.toUpperCase(), isOutlined: true),
                    const Spacer(),
                    if (contentWithProg.progress?.status != null)
                      Text(
                        'Status: ${contentWithProg.progress!.status}',
                        style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.primary),
                      )
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
                  onPressed: () async {
                    final url = Uri.parse('https://leetcode.com/problemset/all/');
                    if (await canLaunchUrl(url)) {
                      await launchUrl(url);
                      if (context.mounted) {
                        _showPracticeOutcomeDialog(context, ref, contentWithProg.item.id);
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
                  onPressed: () {
                    _showAddNoteDialog(context, ref, contentWithProg.item.id);
                  },
                  icon: const Icon(Icons.note_add),
                  label: const Text('Add Note / Mistake'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(double.infinity, 50),
                  ),
                )
              ],
            ),
          );
        },
      ),
    );
  }

  void _showPracticeOutcomeDialog(BuildContext context, WidgetRef ref, String contentId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Practice Outcome'),
        content: const Text('How did you do on this problem?'),
        actions: [
          TextButton(
            onPressed: () {
              ref.read(mutationRepositoryProvider).savePracticeAttempt(contentId, 'struggled');
              Navigator.pop(context);
            },
            child: const Text('Struggled'),
          ),
          TextButton(
            onPressed: () {
              ref.read(mutationRepositoryProvider).savePracticeAttempt(contentId, 'solved');
              Navigator.pop(context);
            },
            child: const Text('Solved'),
          ),
        ],
      ),
    );
  }

  void _showAddNoteDialog(BuildContext context, WidgetRef ref, String contentId) {
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
              if (controller.text.trim().isNotEmpty) {
                ref.read(mutationRepositoryProvider).saveUserNote(contentId, controller.text.trim());
              }
              Navigator.pop(context);
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
        border: Border.all(color: isOutlined ? theme.colorScheme.outlineVariant : color.withAlpha(128)),
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
