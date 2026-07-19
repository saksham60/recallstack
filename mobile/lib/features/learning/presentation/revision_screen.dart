import 'package:app/core/database/database.dart';
import 'package:app/core/sync/mutation_repository.dart';
import 'package:app/features/catalog/data/catalog_repository.dart';
import 'package:app/features/learning/presentation/blocks/block_renderer_registry.dart';
import 'package:app/features/learning/presentation/study_note_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final pendingReviewsProvider = StreamProvider.autoDispose<List<ReviewCard>>((ref) {
  final db = ref.watch(appDatabaseProvider);
  return (db.select(db.reviewCards)..where((t) => t.state.isNotValue('pending_sync'))).watch();
});

class RevisionScreen extends ConsumerStatefulWidget {
  const RevisionScreen({super.key});

  @override
  ConsumerState<RevisionScreen> createState() => _RevisionScreenState();
}

class _RevisionScreenState extends ConsumerState<RevisionScreen> {
  bool _showAnswer = false;

  @override
  Widget build(BuildContext context) {
    final reviewsAsync = ref.watch(pendingReviewsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Revision Queue'),
      ),
      body: reviewsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Error: $err')),
        data: (cards) {
          if (cards.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.check_circle_outline, size: 64, color: theme.colorScheme.primary),
                  const SizedBox(height: 16),
                  Text('All caught up!', style: theme.textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  const Text('No more items in your revision queue.'),
                ],
              ),
            );
          }

          final card = cards.first;
          return _buildCardContent(context, card);
        },
      ),
    );
  }

  Widget _buildCardContent(BuildContext context, ReviewCard card) {
    final docAsync = ref.watch(studyNoteFutureProvider(card.contentId));
    final theme = Theme.of(context);

    return docAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, stack) => Center(child: Text('Error loading content: $err')),
      data: (rawData) {
        if (rawData == null) {
          return const Center(child: Text('Content not found. Sync required.'));
        }
        final data = rawData;

        final contentItem = (data['item'] as ContentItemWithProgress).item;
        final blocks = data['blocks'] as List<dynamic>;

        return Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      contentItem.title,
                      style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const Divider(),
                    if (_showAnswer) ...[
                      const SizedBox(height: 16),
                      ...blocks.map((block) {
                        if (block is Map<String, dynamic>) {
                          return ContentBlockRendererRegistry.render(block);
                        }
                        return const SizedBox.shrink();
                      }),
                    ] else ...[
                      const SizedBox(height: 32),
                      const Center(
                        child: Text('Try to recall this concept or problem from memory.'),
                      ),
                    ]
                  ],
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest.withAlpha(50),
                border: Border(top: BorderSide(color: theme.colorScheme.outlineVariant)),
              ),
              child: SafeArea(
                child: _showAnswer
                    ? Row(
                        children: [
                          _ReviewButton(label: 'Again', color: Colors.red, onPressed: () => _submit(card.id, 'again')),
                          const SizedBox(width: 8),
                          _ReviewButton(label: 'Hard', color: Colors.orange, onPressed: () => _submit(card.id, 'hard')),
                          const SizedBox(width: 8),
                          _ReviewButton(label: 'Good', color: Colors.green, onPressed: () => _submit(card.id, 'good')),
                          const SizedBox(width: 8),
                          _ReviewButton(label: 'Easy', color: Colors.blue, onPressed: () => _submit(card.id, 'easy')),
                        ],
                      )
                    : SizedBox(
                        width: double.infinity,
                        height: 56,
                        child: FilledButton(
                          onPressed: () {
                            setState(() {
                              _showAnswer = true;
                            });
                          },
                          child: const Text('Show Answer', style: TextStyle(fontSize: 18)),
                        ),
                      ),
              ),
            )
          ],
        );
      },
    );
  }

  void _submit(String cardId, String rating) {
    ref.read(mutationRepositoryProvider).submitReview(cardId, rating);
    setState(() {
      _showAnswer = false;
    });
  }
}

class _ReviewButton extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onPressed;

  const _ReviewButton({required this.label, required this.color, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: color.withAlpha(50),
          foregroundColor: color,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
      ),
    );
  }
}
