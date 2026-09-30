import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/features/feed/presentation/feed_controller.dart';
import 'package:app/shared/theme/app_colors.dart';
import 'package:intl/intl.dart';
import 'package:app/features/feed/presentation/reasonai_story_controller.dart';
import 'package:app/core/reasonai/presentation/reasonai_chat_widget.dart';

class StoryDetailScreen extends ConsumerWidget {
  final String storyId;
  const StoryDetailScreen({super.key, required this.storyId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final storyState = ref.watch(storyDetailProvider(storyId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Story'),
        actions: [
          IconButton(
            icon: const Icon(Icons.bookmark_outline),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.share_outlined),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.more_vert),
            onPressed: () {},
          ),
        ],
      ),
      body: storyState.when(
        data: (story) {
          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 14,
                      backgroundImage: NetworkImage(story.source.faviconUrl),
                      backgroundColor: AppColors.surfaceElevated,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      story.source.name,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(color: AppColors.textSecondary),
                    ),
                    const Spacer(),
                    Text(
                      DateFormat.yMMMd().format(story.publishedAt),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Text(
                  story.title,
                  style: Theme.of(context).textTheme.displayMedium,
                ),
                const SizedBox(height: 24),
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Image.network(
                    story.imageUrl,
                    width: double.infinity,
                    height: 200,
                    fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(height: 32),
                Text(
                  'Summary',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                Text(
                  story.summary,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(height: 1.6, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 32),
                Text(
                  'Why it matters',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                Text(
                  story.whyItMatters,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(height: 1.6, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 48),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.auto_awesome),
                    label: const Text('Ask ReasonAI'),
                    onPressed: () {
                      _showReasonAIChat(context, storyId);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accent,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('Error: $e')),
      ),
    );
  }

  void _showReasonAIChat(BuildContext context, String storyId) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
          child: SizedBox(
            height: MediaQuery.of(context).size.height * 0.75,
            child: _ReasonAIStoryChatSheet(storyId: storyId),
          ),
        );
      },
    );
  }
}

class _ReasonAIStoryChatSheet extends ConsumerStatefulWidget {
  final String storyId;
  const _ReasonAIStoryChatSheet({required this.storyId});

  @override
  ConsumerState<_ReasonAIStoryChatSheet> createState() => _ReasonAIStoryChatSheetState();
}

class _ReasonAIStoryChatSheetState extends ConsumerState<_ReasonAIStoryChatSheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(reasonAIStoryControllerProvider(widget.storyId));

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: AppColors.border)),
          ),
          child: Row(
            children: [
              const Icon(Icons.auto_awesome, color: AppColors.accent),
              const SizedBox(width: 8),
              Text('ReasonAI', style: Theme.of(context).textTheme.titleMedium),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
        Expanded(
          child: ReasonAIChatWidget(state: state), // From reasonai_chat_widget.dart
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  decoration: const InputDecoration(
                    hintText: 'Ask anything...',
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                  ),
                  onSubmitted: (val) {
                    ref.read(reasonAIStoryControllerProvider(widget.storyId).notifier).sendMessage(val);
                    _controller.clear();
                  },
                ),
              ),
              IconButton(
                icon: const Icon(Icons.send, color: AppColors.accent),
                onPressed: () {
                  ref.read(reasonAIStoryControllerProvider(widget.storyId).notifier).sendMessage(_controller.text);
                  _controller.clear();
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}
