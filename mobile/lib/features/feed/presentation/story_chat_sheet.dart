import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/reasonai/reasonai_client.dart';
import '../../../core/reasonai/reasonai_events.dart';
import '../../../core/reasonai/reasonai_state.dart';
import '../../../core/reasonai/reasonai_stream.dart';
import '../../../core/reasonai/reasonai_widgets.dart';
import 'feed_controller.dart';
import 'feed_models.dart';

Future<void> showStoryChat(BuildContext context, Story story) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => StoryChatSheet(story: story),
    );

class StoryChatSheet extends ConsumerStatefulWidget {
  const StoryChatSheet({super.key, required this.story});
  final Story story;
  @override
  ConsumerState<StoryChatSheet> createState() => _StoryChatSheetState();
}

class _StoryChatSheetState extends ConsumerState<StoryChatSheet> {
  ChatState chat = const ChatState();
  CancelToken? token;
  int generation = 0;
  String? lastText;
  ChatState? beforeLast;
  @override
  void dispose() {
    generation++;
    token?.cancel();
    super.dispose();
  }

  Future<void> send(String message) async {
    final text = message.trim();
    if (text.isEmpty ||
        text.length > 4000 ||
        chat.status == RunStatus.running) {
      return;
    }
    final history = historyOf(chat);
    beforeLast = chat;
    lastText = text;
    setState(
      () => chat = chat.copy(
        messages: [
          ...chat.messages,
          ChatMessage(
            id: 'user-${DateTime.now().microsecondsSinceEpoch}',
            role: 'user',
            text: text,
            completed: true,
          ),
        ],
        status: RunStatus.running,
      ),
    );
    ref.read(feedControllerProvider.notifier).trackReasonAI(widget.story.id);
    final current = ++generation;
    final active = token = CancelToken();
    try {
      await for (final event in const ReasonAIStream().open(
        dio: ref.read(reasonAIDioProvider),
        path: feedReasonAIPath,
        body: {
          'context': toReasonAIContext(widget.story),
          'message': text,
          'history': history,
        },
        token: active,
      )) {
        if (!mounted || current != generation || active.isCancelled) return;
        if (event is NonStreamResponse) {
          throw const ProtocolError('Unexpected JSON response');
        }
        setState(() => chat = reduce(chat, event));
      }
      if (mounted &&
          current == generation &&
          chat.status == RunStatus.running) {
        setState(
          () => chat = interrupt(chat, 'Answer interrupted. Try again.'),
        );
      }
    } catch (error) {
      if (!mounted || current != generation || active.isCancelled) return;
      final message = error is ReasonAIHttpException
          ? error.message
          : error is ProtocolError ||
                error is RunInterrupted ||
                error is StreamTimeout
          ? 'Answer interrupted. Try again.'
          : ApiFailure.from(error).userMessage;
      setState(() => chat = interrupt(chat, message));
    }
  }

  void stop() {
    generation++;
    token?.cancel();
    setState(() => chat = interrupt(chat, 'Stopped.'));
  }

  void retry() {
    if (lastText == null || beforeLast == null) return;
    setState(() => chat = beforeLast!);
    send(lastText!);
  }

  @override
  Widget build(BuildContext context) => AnimatedPadding(
    duration: const Duration(milliseconds: 180),
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: SizedBox(
      height:
          (MediaQuery.sizeOf(context).height -
              MediaQuery.viewInsetsOf(context).bottom) *
          0.92,
      child: Column(
        children: [
          ListTile(
            title: Text('ReasonAI · ${widget.story.sourceName}'),
            trailing: IconButton(
              icon: const Icon(Icons.close),
              onPressed: () => Navigator.pop(context),
            ),
          ),
          Expanded(
            child: ReasonAIThread(state: chat, onRetry: retry, onStop: stop),
          ),
          ReasonAIComposer(
            onSend: send,
            running: chat.status == RunStatus.running,
            onStop: stop,
            quickPrompts: const [
              'Explain this',
              'Why does this matter?',
              'Give me a practical example',
              'Interview angle',
              'Show me more like this',
              'Latest developments',
            ],
          ),
        ],
      ),
    ),
  );
}
