import 'package:flutter/material.dart';
import 'package:app/core/reasonai/reasonai_models.dart';
import 'package:app/shared/theme/app_colors.dart';
import 'package:flutter_markdown/flutter_markdown.dart';

class ReasonAIChatWidget extends StatelessWidget {
  final ReasonAIRuntimeState state;

  const ReasonAIChatWidget({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    final messages = state.messages;

    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      itemCount: messages.length + (state.status == ReasonAIRunStatus.running ? 1 : 0),
      separatorBuilder: (context, index) => const SizedBox(height: 16),
      itemBuilder: (context, index) {
        if (index == messages.length) {
          return const Align(
            alignment: Alignment.centerLeft,
            child: SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          );
        }
        return ReasonAIMessageWidget(message: messages[index]);
      },
    );
  }
}

class ReasonAIMessageWidget extends StatelessWidget {
  final ReasonAIRuntimeMessage message;

  const ReasonAIMessageWidget({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == 'user';

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.85,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isUser ? AppColors.accent : AppColors.surfaceElevated,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isUser ? 16 : 4),
            bottomRight: Radius.circular(isUser ? 4 : 16),
          ),
          border: isUser ? null : Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: message.parts.map((part) => _buildPart(context, part, isUser)).toList(),
        ),
      ),
    );
  }

  Widget _buildPart(BuildContext context, ReasonAIMessagePart part, bool isUser) {
    return part.map(
      text: (p) => MarkdownBody(
        data: p.text,
        styleSheet: MarkdownStyleSheet(
          p: TextStyle(color: isUser ? Colors.white : AppColors.textPrimary, height: 1.5, fontSize: 16),
          code: TextStyle(backgroundColor: AppColors.background.withValues(alpha: 0.5), color: AppColors.accentLight),
          codeblockDecoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
      tool: (p) => Padding(
        padding: const EdgeInsets.only(top: 8.0),
        child: Row(
          children: [
            if (p.status == 'running')
              const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.textMuted))
            else if (p.status == 'completed')
              const Icon(Icons.check_circle, size: 16, color: AppColors.success)
            else
              const Icon(Icons.error, size: 16, color: AppColors.danger),
            const SizedBox(width: 8),
            Text(
              p.summary ?? 'Using tool ${p.toolName}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textSecondary, fontStyle: FontStyle.italic),
            ),
          ],
        ),
      ),
      sources: (p) => Padding(
        padding: const EdgeInsets.only(top: 8.0),
        child: Wrap(
          spacing: 8,
          children: p.sources.map((s) => Chip(
            label: Text(s.title),
            visualDensity: VisualDensity.compact,
            backgroundColor: AppColors.surface,
          )).toList(),
        ),
      ),
      visual: (p) => const SizedBox(),
      artifact: (p) => const SizedBox(),
    );
  }
}
