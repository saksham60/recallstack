import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../api/safe_url.dart';
import '../../shared/theme/app_theme.dart';
import 'reasonai_state.dart';
import 'visual_lesson.dart';

class ReasonAIThread extends StatefulWidget {
  const ReasonAIThread({
    super.key,
    required this.state,
    this.onRetry,
    this.onStop,
    this.onAskAboutStep,
  });
  final ChatState state;
  final VoidCallback? onRetry, onStop;
  final void Function(VisualLesson, int)? onAskAboutStep;
  @override
  State<ReasonAIThread> createState() => _ReasonAIThreadState();
}

class _ReasonAIThreadState extends State<ReasonAIThread> {
  final scroll = ScrollController();
  bool nearBottom = true;
  @override
  void initState() {
    super.initState();
    scroll.addListener(() {
      if (scroll.hasClients) nearBottom = scroll.position.extentAfter < 120;
    });
  }

  @override
  void didUpdateWidget(covariant ReasonAIThread oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (nearBottom) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (scroll.hasClients) {
          scroll.animateTo(
            scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  @override
  void dispose() {
    scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    if (state.messages.isEmpty &&
        state.status != RunStatus.running &&
        state.error == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'Ask ReasonAI to examine the context, trade-offs, or next step.',
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: AppColors.secondaryText),
          ),
        ),
      );
    }
    return ListView.builder(
      controller: scroll,
      padding: const EdgeInsets.all(16),
      itemCount:
          state.messages.length +
          (state.status == RunStatus.running || state.error != null ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == state.messages.length) {
          if (state.status == RunStatus.running) {
            return const Padding(
              padding: EdgeInsets.all(8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            );
          }
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Text(state.error ?? 'Answer interrupted. Try again.'),
                  if (widget.onRetry != null)
                    TextButton(
                      onPressed: widget.onRetry,
                      child: const Text('Retry'),
                    ),
                ],
              ),
            ),
          );
        }
        final message = state.messages[index];
        final user = message.role == 'user';
        return Align(
          alignment: user ? Alignment.centerRight : Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: user
                    ? MediaQuery.sizeOf(context).width * 0.82
                    : double.infinity,
              ),
              child: Container(
                decoration: BoxDecoration(
                  color: user ? AppColors.reasonAISoft : Colors.transparent,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: Padding(
                  padding: EdgeInsets.all(user ? 14 : 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (message.text.isNotEmpty)
                        MarkdownBody(
                          data: message.text.replaceAll(RegExp(r'<[^>]*>'), ''),
                          selectable: true,
                          onTapLink: (_, href, _) =>
                              openExternal(context, href),
                        ),
                      for (final tool in message.tools)
                        Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: Row(
                            children: [
                              Icon(
                                tool['status'] == 'running'
                                    ? Icons.sync
                                    : tool['status'] == 'completed'
                                    ? Icons.check_circle
                                    : Icons.error_outline,
                                size: 18,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  tool['summary']?.toString() ??
                                      'Using ${tool['name']}',
                                ),
                              ),
                            ],
                          ),
                        ),
                      if (message.notice != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(message.notice!),
                        ),
                      for (final source in message.sources)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          leading: const Icon(Icons.open_in_new, size: 18),
                          title: Text(source['title']?.toString() ?? 'Source'),
                          subtitle: Text(
                            safeHttpUrl(source['url'] as String?)?.host ?? '',
                          ),
                          onTap: () =>
                              openExternal(context, source['url'] as String?),
                        ),
                      if (message.visual != null)
                        VisualLessonView(
                          lesson: message.visual!,
                          onAskAboutStep: widget.onAskAboutStep,
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class ReasonAIComposer extends StatefulWidget {
  const ReasonAIComposer({
    super.key,
    required this.onSend,
    required this.running,
    required this.onStop,
    this.quickPrompts = const [],
  });
  final void Function(String) onSend;
  final bool running;
  final VoidCallback onStop;
  final List<String> quickPrompts;
  @override
  State<ReasonAIComposer> createState() => _ReasonAIComposerState();
}

class _ReasonAIComposerState extends State<ReasonAIComposer> {
  final input = TextEditingController();
  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  void send() {
    final text = input.text.trim();
    if (text.isEmpty || widget.running) return;
    widget.onSend(text);
    input.clear();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.quickPrompts.isNotEmpty)
            SizedBox(
              height: 48,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final prompt in widget.quickPrompts)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ActionChip(
                        label: Text(prompt),
                        onPressed: widget.running
                            ? null
                            : () => widget.onSend(prompt),
                      ),
                    ),
                ],
              ),
            ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: input,
                  maxLines: 4,
                  minLines: 1,
                  maxLength: 4000,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => send(),
                  decoration: const InputDecoration(
                    hintText: 'Ask ReasonAI',
                    counterText: '',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: widget.running ? 'Stop' : 'Send',
                onPressed: widget.running ? widget.onStop : send,
                icon: Icon(widget.running ? Icons.stop : Icons.arrow_upward),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

class VisualLessonView extends StatefulWidget {
  const VisualLessonView({
    super.key,
    required this.lesson,
    this.onAskAboutStep,
  });
  final VisualLesson lesson;
  final void Function(VisualLesson, int)? onAskAboutStep;
  @override
  State<VisualLessonView> createState() => _VisualLessonViewState();
}

class _VisualLessonViewState extends State<VisualLessonView> {
  int index = 0;
  @override
  Widget build(BuildContext context) {
    final lesson = widget.lesson;
    final step = lesson.steps[index];
    Widget visual;
    switch (lesson.kind) {
      case 'array':
        visual = SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (var i = 0; i < step.values.length; i++)
                Container(
                  margin: const EdgeInsets.all(3),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: step.highlights.contains(i)
                        ? Theme.of(context).colorScheme.primaryContainer
                        : Theme.of(context).colorScheme.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    children: [
                      Text(step.values[i]),
                      for (final pointer in step.pointers.where(
                        (p) => p['index'] == i,
                      ))
                        Text(pointer['label']?.toString() ?? ''),
                    ],
                  ),
                ),
            ],
          ),
        );
      case 'grid':
        visual = SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Column(
            children: [
              for (var row = 0; row < step.rows.length; row++)
                Row(
                  children: [
                    for (
                      var column = 0;
                      column < step.rows[row].length;
                      column++
                    )
                      Container(
                        width: 42,
                        height: 42,
                        alignment: Alignment.center,
                        margin: const EdgeInsets.all(2),
                        color:
                            step.activeCells.any(
                              (c) => c['row'] == row && c['column'] == column,
                            )
                            ? Theme.of(context).colorScheme.primaryContainer
                            : Theme.of(
                                context,
                              ).colorScheme.surfaceContainerHigh,
                        child: Text(step.rows[row][column]),
                      ),
                  ],
                ),
            ],
          ),
        );
      default:
        visual = AspectRatio(
          aspectRatio: 1.6,
          child: CustomPaint(
            painter: _GraphPainter(step, Theme.of(context).colorScheme.primary),
          ),
        );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),
        Text(lesson.title, style: Theme.of(context).textTheme.titleMedium),
        Text('Step ${index + 1} of ${lesson.steps.length} · ${step.title}'),
        const SizedBox(height: 12),
        visual,
        const SizedBox(height: 8),
        Text(step.explanation),
        Wrap(
          spacing: 8,
          children: [
            for (final variable in step.variables)
              Chip(label: Text('${variable['name']}: ${variable['value']}')),
          ],
        ),
        Row(
          children: [
            TextButton(
              onPressed: index == 0 ? null : () => setState(() => index--),
              child: const Text('Previous'),
            ),
            const Spacer(),
            TextButton(
              onPressed: index == lesson.steps.length - 1
                  ? null
                  : () => setState(() => index++),
              child: const Text('Next'),
            ),
          ],
        ),
        if (widget.onAskAboutStep != null)
          TextButton.icon(
            onPressed: () => widget.onAskAboutStep!(lesson, index + 1),
            icon: const Icon(Icons.auto_awesome),
            label: const Text('Ask ReasonAI about this step'),
          ),
      ],
    );
  }
}

class _GraphPainter extends CustomPainter {
  _GraphPainter(this.step, this.color);
  final VisualStep step;
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    final locations = <String, Offset>{};
    for (final node in step.nodes) {
      locations[node['id'] as String] = Offset(
        (node['x'] as num).toDouble() * size.width / 100,
        (node['y'] as num).toDouble() * size.height / 100,
      );
    }
    final line = Paint()
      ..color = color.withValues(alpha: 0.55)
      ..strokeWidth = 2;
    for (final edge in step.edges) {
      final from = locations[edge['from']], to = locations[edge['to']];
      if (from != null && to != null) {
        canvas.drawLine(from, to, line);
        final text = edge['label']?.toString() ?? '';
        if (text.isNotEmpty) {
          final label = TextPainter(
            text: TextSpan(
              text: text,
              style: TextStyle(color: color, fontSize: 11),
            ),
            textDirection: TextDirection.ltr,
          )..layout(maxWidth: 90);
          final middle = Offset((from.dx + to.dx) / 2, (from.dy + to.dy) / 2);
          label.paint(
            canvas,
            middle - Offset(label.width / 2, label.height / 2),
          );
        }
      }
    }
    for (final node in step.nodes) {
      final center = locations[node['id']]!;
      final state = node['state'];
      canvas.drawCircle(
        center,
        20,
        Paint()
          ..color = state == 'active'
              ? color
              : color.withValues(alpha: state == 'visited' ? 0.6 : 0.32),
      );
      final label = TextPainter(
        text: TextSpan(
          text: node['label']?.toString() ?? '',
          style: const TextStyle(color: Colors.black, fontSize: 12),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: 40);
      label.paint(canvas, center - Offset(label.width / 2, label.height / 2));
    }
  }

  @override
  bool shouldRepaint(covariant _GraphPainter old) => old.step != step;
}
