import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_failure.dart';
import '../../shared/widgets/states.dart';
import '../dsa/dsa_api.dart';

class ReviseScreen extends ConsumerStatefulWidget {
  const ReviseScreen({super.key});
  @override
  ConsumerState<ReviseScreen> createState() => _ReviseScreenState();
}

class _ReviseScreenState extends ConsumerState<ReviseScreen> {
  int index = 0;
  bool revealed = false, saving = false;
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(dueReviewsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Revise')),
      body: state.when(
        loading: () => const ListSkeleton(itemHeight: 112),
        error: (e, _) => ErrorState(
          error: e,
          onRetry: () => ref.invalidate(dueReviewsProvider),
        ),
        data: (cards) {
          if (cards.isEmpty || index >= cards.length) {
            return EmptyState(
              icon: Icons.check_circle_outline,
              title: "You're caught up",
              body:
                  'Problems where you needed help or struggled will appear here after practice.',
              action: OutlinedButton(
                onPressed: () => context.go('/dsa'),
                child: const Text('Practice a problem'),
              ),
            );
          }
          final card = cards[index];
          return Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: ListView(
                    children: [
                      Text(
                        '${index + 1} of ${cards.length}',
                        style: Theme.of(context).textTheme.labelLarge,
                      ),
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: 8,
                        children: [
                          Chip(
                            label: Text(card['type']?.toString() ?? 'problem'),
                          ),
                          if (card['difficulty'] != null)
                            Chip(label: Text(card['difficulty'].toString())),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Text(
                        card['title'] as String? ?? '',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 20),
                      if (revealed) Text(card['summary'] as String? ?? ''),
                      if (!revealed)
                        OutlinedButton(
                          onPressed: () => setState(() => revealed = true),
                          child: const Text('Reveal'),
                        ),
                      TextButton(
                        onPressed: () => context.push(
                          '/dsa/problems/${Uri.encodeComponent(card['slug'] as String)}',
                        ),
                        child: const Text('Open problem'),
                      ),
                    ],
                  ),
                ),
                if (revealed)
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final rating in ['again', 'hard', 'good', 'easy'])
                        FilledButton.tonal(
                          onPressed: saving
                              ? null
                              : () async {
                                  setState(() => saving = true);
                                  try {
                                    await ref
                                        .read(dsaApiProvider)
                                        .submitReview(card, rating);
                                    if (mounted) {
                                      setState(() {
                                        index++;
                                        revealed = false;
                                      });
                                    }
                                  } catch (error) {
                                    final failure = ApiFailure.from(error);
                                    if (failure.kind == FailureKind.conflict) {
                                      ref.invalidate(dueReviewsProvider);
                                      if (mounted) {
                                        setState(() {
                                          index = 0;
                                          revealed = false;
                                        });
                                      }
                                    } else if (context.mounted) {
                                      ScaffoldMessenger.of(
                                        context,
                                      ).showSnackBar(
                                        SnackBar(
                                          content: Text(failure.userMessage),
                                        ),
                                      );
                                    }
                                  } finally {
                                    if (mounted) setState(() => saving = false);
                                  }
                                },
                          child: Text(
                            rating[0].toUpperCase() + rating.substring(1),
                          ),
                        ),
                    ],
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
