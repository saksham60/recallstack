import 'reasonai_events.dart';
import 'visual_lesson.dart';

enum RunStatus { idle, running, completed, failed, cancelled, interrupted }

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.role,
    this.text = '',
    this.textParts = const {},
    this.completed = false,
    this.tools = const [],
    this.sources = const [],
    this.visual,
    this.notice,
  });
  final String id, role, text;
  final Map<String, String> textParts;
  final bool completed;
  final List<Map<String, dynamic>> tools, sources;
  final VisualLesson? visual;
  final String? notice;
  ChatMessage copy({
    String? text,
    Map<String, String>? textParts,
    bool? completed,
    List<Map<String, dynamic>>? tools,
    List<Map<String, dynamic>>? sources,
    VisualLesson? visual,
    String? notice,
  }) => ChatMessage(
    id: id,
    role: role,
    text: text ?? this.text,
    textParts: textParts ?? this.textParts,
    completed: completed ?? this.completed,
    tools: tools ?? this.tools,
    sources: sources ?? this.sources,
    visual: visual ?? this.visual,
    notice: notice ?? this.notice,
  );
}

class ChatState {
  const ChatState({
    this.messages = const [],
    this.status = RunStatus.idle,
    this.error,
    this.runId,
    this.lastSeq = -1,
  });
  final List<ChatMessage> messages;
  final RunStatus status;
  final String? error, runId;
  final int lastSeq;
  ChatState copy({
    List<ChatMessage>? messages,
    RunStatus? status,
    String? error,
    String? runId,
    int? lastSeq,
  }) => ChatState(
    messages: messages ?? this.messages,
    status: status ?? this.status,
    error: error,
    runId: runId ?? this.runId,
    lastSeq: lastSeq ?? this.lastSeq,
  );
}

ChatState reduce(ChatState state, ReasonAIEvent event) {
  if (event.type == 'run.started') {
    return state.copy(
      status: RunStatus.running,
      runId: event.runId,
      lastSeq: event.seq,
    );
  }
  if (event.runId != state.runId || event.seq <= state.lastSeq) return state;
  final data = event.data;
  final messages = [...state.messages];
  final id = data['messageId'] as String?;
  var index = id == null ? -1 : messages.indexWhere((m) => m.id == id);
  if (id != null && index < 0) {
    messages.add(ChatMessage(id: id, role: 'assistant'));
    index = messages.length - 1;
  }
  if (index >= 0) {
    final message = messages[index];
    switch (event.type) {
      case 'text.delta':
        final parts = {
          ...message.textParts,
          data['partId'] as String:
              (message.textParts[data['partId']] ?? '') +
              (data['delta'] as String),
        };
        messages[index] = message.copy(
          textParts: parts,
          text: parts.values.join(),
        );
      case 'text.final':
        final parts = {
          ...message.textParts,
          data['partId'] as String: data['text'] as String,
        };
        messages[index] = message.copy(
          textParts: parts,
          text: parts.values.join(),
        );
      case 'tool.started':
        messages[index] = message.copy(
          tools: [
            ...message.tools,
            {
              'id': data['toolCallId'],
              'name': data['toolName'],
              'status': 'running',
              'summary': data['summary'],
            },
          ],
        );
      case 'tool.completed':
      case 'tool.failed':
        messages[index] = message.copy(
          tools: [
            for (final tool in message.tools)
              tool['id'] == data['toolCallId']
                  ? {
                      ...tool,
                      'status': event.type == 'tool.completed'
                          ? 'completed'
                          : 'failed',
                      'summary': data['summary'] ?? tool['summary'],
                    }
                  : tool,
          ],
        );
      case 'sources.ready':
        messages[index] = message.copy(
          sources: (data['sources'] as List)
              .map((e) => Map<String, dynamic>.from(e as Map))
              .toList(),
          notice: data['notice'] as String?,
        );
      case 'visual.ready':
        messages[index] = message.copy(
          visual: VisualLesson.tryParse(data['data']),
        );
    }
  }
  final status = switch (event.type) {
    'run.completed' => RunStatus.completed,
    'run.failed' => RunStatus.failed,
    'run.cancelled' => RunStatus.cancelled,
    _ => state.status,
  };
  return ChatState(
    messages: event.type == 'run.completed'
        ? [
            for (final message in messages)
              message.role == 'assistant' && message.text.isNotEmpty
                  ? message.copy(completed: true)
                  : message,
          ]
        : messages,
    status: status,
    error: event.type == 'run.failed'
        ? 'ReasonAI could not finish. Please try again.'
        : null,
    runId: state.runId,
    lastSeq: event.seq,
  );
}

ChatState interrupt(ChatState state, String message) =>
    state.copy(status: RunStatus.interrupted, error: message);
List<Map<String, String>> historyOf(ChatState state) => state.messages
    .where(
      (m) =>
          m.completed &&
          (m.role == 'user' || m.role == 'assistant') &&
          m.text.trim().isNotEmpty,
    )
    .toList()
    .reversed
    .take(12)
    .toList()
    .reversed
    .map(
      (m) => {
        'role': m.role,
        'content': m.text.length > 12000 ? m.text.substring(0, 12000) : m.text,
      },
    )
    .toList();
