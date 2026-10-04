import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../../core/api/api_failure.dart';
import '../../core/reasonai/reasonai_client.dart';
import '../../core/reasonai/reasonai_events.dart';
import '../../core/reasonai/reasonai_state.dart';
import '../../core/reasonai/reasonai_stream.dart';
import '../../core/reasonai/reasonai_widgets.dart';
import '../../core/reasonai/visual_lesson.dart';
import 'dsa_api.dart';
import 'dsa_context.dart';
import 'dsa_models.dart';

Future<void> showDsaTutor(
  BuildContext context,
  StudyNote note, {
  required String approach,
  required String code,
}) {
  final mobile = MediaQuery.sizeOf(context).width <= 768;
  return showModalBottomSheet<void>(
    context: context,
    useRootNavigator: mobile,
    isScrollControlled: true,
    isDismissible: true,
    enableDrag: true,
    barrierColor: Colors.black54,
    backgroundColor: mobile ? Colors.transparent : null,
    builder: (_) => DsaTutorSheet(note: note, approach: approach, code: code),
  );
}

enum DsaTutorAction {
  chat,
  hint,
  explain,
  start,
  trace,
  visualize,
  review,
  complexity,
  research,
  solution,
}

DsaTutorAction mapDsaTutorAction(String value) {
  for (final action in DsaTutorAction.values) {
    if (action.name == value) return action;
  }
  return DsaTutorAction.chat;
}

Map<String, dynamic> buildTutorRequest({
  required String action,
  required String message,
  required bool searchWeb,
  required int hintLevel,
  required Map<String, dynamic> context,
  required List<Map<String, String>> history,
  required String idempotencyKey,
  String? conversationId,
  String? webContextToken,
  Map<String, dynamic>? visualFocus,
}) => {
  'action': mapDsaTutorAction(action).name,
  'message': message,
  'searchWeb': searchWeb,
  'hintLevel': hintLevel,
  'context': context,
  'history': history,
  if (conversationId != null) 'conversationId': conversationId,
  if (webContextToken != null) 'webContextToken': webContextToken,
  if (visualFocus != null) 'visualFocus': visualFocus,
  'idempotencyKey': idempotencyKey,
};

class DsaTutorSheet extends ConsumerStatefulWidget {
  const DsaTutorSheet({
    super.key,
    required this.note,
    required this.approach,
    required this.code,
  });
  final StudyNote note;
  final String approach, code;
  @override
  ConsumerState<DsaTutorSheet> createState() => _DsaTutorSheetState();
}

class _DsaTutorSheetState extends ConsumerState<DsaTutorSheet> {
  ChatState chat = const ChatState();
  bool searchWeb = false;
  int hintLevel = 0, generation = 0;
  String? conversationId, activeRun, webContextToken, notice;
  Map<String, dynamic>? visualFocus, lastRequest;
  ChatState? beforeLast;
  CancelToken? token;
  late final Dio webDio;
  @override
  void initState() {
    super.initState();
    webDio = ref.read(reasonAIDioProvider);
  }

  @override
  void dispose() {
    generation++;
    token?.cancel();
    if (chat.status == RunStatus.running) _cancelRemote();
    super.dispose();
  }

  void setFocus(VisualLesson lesson, int stepNumber) {
    final step = lesson.steps[stepNumber - 1];
    setState(
      () => visualFocus = {
        'lessonTitle': lesson.title.length > 120
            ? lesson.title.substring(0, 120)
            : lesson.title,
        'stepNumber': stepNumber,
        'stepTitle': step.title.length > 100
            ? step.title.substring(0, 100)
            : step.title,
      },
    );
  }

  Future<void> send(
    String action,
    String message, {
    Map<String, dynamic>? retryBody,
  }) async {
    final text = message.trim();
    if (chat.status == RunStatus.running ||
        text.isEmpty ||
        text.length > 4000) {
      return;
    }
    if (action == 'review' &&
        widget.approach.trim().isEmpty &&
        widget.code.trim().isEmpty) {
      setState(
        () => notice = 'Write an approach or code before asking for a review.',
      );
      return;
    }
    final history = historyOf(chat);
    beforeLast = chat;
    final nextHint = action == 'hint' && retryBody == null
        ? hintLevel + 1
        : hintLevel;
    setState(() {
      notice = null;
      hintLevel = nextHint;
      chat = chat.copy(
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
      );
    });
    final current = ++generation;
    final active = token = CancelToken();
    activeRun = null;
    try {
      final notes = await ref.read(dsaApiProvider).notes(widget.note.id);
      if (!mounted || current != generation) return;
      final body = retryBody == null
          ? buildTutorRequest(
              action: action,
              message: text,
              searchWeb: searchWeb,
              hintLevel: nextHint,
              context: buildDsaContext(
                widget.note,
                approach: widget.approach,
                code: widget.code,
                notes: notes,
              ),
              history: history,
              idempotencyKey: const Uuid().v4(),
              conversationId: conversationId,
              webContextToken: webContextToken,
              visualFocus: visualFocus,
            )
          : {
              ...retryBody,
              'idempotencyKey': const Uuid().v4(),
              if (conversationId != null) 'conversationId': conversationId,
            };
      lastRequest = body;
      await for (final event in const ReasonAIStream().open(
        dio: webDio,
        path: dsaReasonAIPath,
        body: body,
        token: active,
        onHeaders: (headers) {
          conversationId =
              headers.value('X-ReasonAI-Conversation-Id') ?? conversationId;
          activeRun = headers.value('X-ReasonAI-Run-Id') ?? activeRun;
        },
      )) {
        if (!mounted || current != generation || active.isCancelled) return;
        if (event is NonStreamResponse) {
          final json = event.data;
          if (json['replayed'] == true) {
            setState(() {
              conversationId =
                  json['conversationId'] as String? ?? conversationId;
              activeRun = json['runId'] as String? ?? activeRun;
              notice = 'Previous answer is being restored.';
              chat = chat.copy(status: RunStatus.completed);
            });
          } else {
            final text = json['text'] as String? ?? '';
            final sources = (json['sources'] as List? ?? [])
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList();
            setState(() {
              webContextToken =
                  json['webContextToken'] as String? ?? webContextToken;
              chat = chat.copy(
                messages: [
                  ...chat.messages,
                  ChatMessage(
                    id: 'response-$current',
                    role: 'assistant',
                    text: text,
                    completed: true,
                    sources: sources,
                    visual: VisualLesson.tryParse(json['visual']),
                    notice: json['notice'] as String?,
                  ),
                ],
                status: RunStatus.completed,
              );
            });
          }
          return;
        }
        if (event.type == 'sources.ready') {
          webContextToken =
              event.data['contextToken'] as String? ?? webContextToken;
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
      var inProgress = false;
      if (error is ReasonAIHttpException) {
        inProgress = error.statusCode == 409 && error.code == 'RUN_IN_PROGRESS';
      }
      if (!mounted || current != generation) return;
      final message = inProgress
          ? 'ReasonAI is still answering your last question.'
          : error is ReasonAIHttpException
          ? error.message
          : error is ProtocolError ||
                error is StreamTimeout ||
                error is RunInterrupted
          ? 'Answer interrupted. Try again.'
          : ApiFailure.from(error).userMessage;
      setState(() => chat = interrupt(chat, message));
    }
  }

  void stop() {
    generation++;
    token?.cancel();
    _cancelRemote();
    setState(() => chat = interrupt(chat, 'Stopped.'));
  }

  void _cancelRemote() {
    final id = conversationId, run = activeRun;
    if (id != null && run != null) {
      unawaited(() async {
        try {
          await webDio.post(
            'api/reasonai/conversations/${Uri.encodeComponent(id)}/runs/${Uri.encodeComponent(run)}/cancel',
          );
        } catch (_) {}
      }());
    }
  }

  void retry() {
    final request = lastRequest;
    if (request == null || beforeLast == null) return;
    setState(() => chat = beforeLast!);
    send(
      request['action'] as String,
      request['message'] as String,
      retryBody: request,
    );
  }

  void clear() {
    if (chat.status == RunStatus.running) stop();
    setState(() {
      chat = const ChatState();
      hintLevel = 0;
      conversationId = null;
      activeRun = null;
      webContextToken = null;
      visualFocus = null;
      lastRequest = null;
      notice = null;
    });
  }

  Future<void> menu(String value) async {
    switch (value) {
      case 'start':
        send('start', 'Help me start');
      case 'research':
        setState(() => searchWeb = true);
        send('research', 'Research this problem');
      case 'solution':
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (dialog) => AlertDialog(
            title: const Text('Show the solution?'),
            content: const Text(
              'You can still practice the problem afterward.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialog, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialog, true),
                child: const Text('Show solution'),
              ),
            ],
          ),
        );
        if (confirmed == true) send('solution', 'Show solution');
      case 'search':
        setState(() => searchWeb = !searchWeb);
      case 'clear':
        clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final mobile = MediaQuery.sizeOf(context).width <= 768;
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    final safeTop = MediaQuery.viewPaddingOf(context).top;
    final content = Column(
      children: [
        if (mobile)
          Center(
            child: Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Container(
                key: const Key('dsa-tutor-drag-handle'),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
        Padding(
          padding: EdgeInsets.fromLTRB(8, mobile ? 12 + safeTop : 0, 8, 4),
          child: Row(
            children: [
              if (mobile)
                IconButton(
                  tooltip: 'Close ReasonAI',
                  constraints: const BoxConstraints.tightFor(
                    width: 44,
                    height: 44,
                  ),
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              Expanded(
                child: Text(
                  'ReasonAI · ${widget.note.title}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              PopupMenuButton<String>(
                onSelected: menu,
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'start',
                    child: Text('Help me start'),
                  ),
                  const PopupMenuItem(
                    value: 'research',
                    child: Text('Research'),
                  ),
                  const PopupMenuItem(
                    value: 'solution',
                    child: Text('Show solution'),
                  ),
                  PopupMenuItem(
                    value: 'search',
                    child: Text(
                      searchWeb ? 'Search web: on' : 'Search web: off',
                    ),
                  ),
                  const PopupMenuItem(
                    value: 'clear',
                    child: Text('Clear conversation'),
                  ),
                ],
              ),
            ],
          ),
        ),
        if (visualFocus != null)
          ListTile(
            title: Text('Asking about step ${visualFocus!['stepNumber']}'),
            subtitle: Text(visualFocus!['stepTitle'] as String),
            trailing: IconButton(
              icon: const Icon(Icons.close),
              onPressed: () => setState(() => visualFocus = null),
            ),
          ),
        if (notice != null)
          Padding(padding: const EdgeInsets.all(8), child: Text(notice!)),
        Expanded(
          child: ReasonAIThread(
            state: chat,
            onRetry: retry,
            onStop: stop,
            onAskAboutStep: setFocus,
          ),
        ),
        SizedBox(
          height: 48,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final entry in const {
                'hint': 'Hint',
                'explain': 'Explain',
                'trace': 'Trace',
                'visualize': 'Visualize',
                'review': 'Review',
                'complexity': 'Complexity',
              }.entries)
                Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: ActionChip(
                    label: Text(entry.value),
                    onPressed: chat.status == RunStatus.running
                        ? null
                        : () => send(entry.key, entry.value),
                  ),
                ),
            ],
          ),
        ),
        ReasonAIComposer(
          onSend: (text) => send('chat', text),
          running: chat.status == RunStatus.running,
          onStop: stop,
        ),
      ],
    );
    return AnimatedPadding(
      duration: const Duration(milliseconds: 180),
      padding: EdgeInsets.only(bottom: keyboard),
      child: SizedBox(
        height:
            (MediaQuery.sizeOf(context).height - keyboard) *
            (mobile ? 0.88 : 0.92),
        child: mobile
            ? Material(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(24),
                ),
                clipBehavior: Clip.antiAlias,
                child: content,
              )
            : content,
      ),
    );
  }
}
