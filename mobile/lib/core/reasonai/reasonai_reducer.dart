import 'reasonai_models.dart';
import 'reasonai_events.dart';

class ReasonAIRuntimeReducer {
  static ReasonAIRuntimeState reduce(ReasonAIRuntimeState state, ReasonAIEvent event) {
    if (event.type == 'run.started') {
      if (state.status != ReasonAIRunStatus.idle) return state;
      return state.copyWith(
        runId: event.runId,
        status: ReasonAIRunStatus.running,
        lastSeq: event.seq,
        error: null,
        terminalEventReceived: false,
      );
    }

    if (state.status != ReasonAIRunStatus.running ||
        state.terminalEventReceived ||
        state.runId != event.runId ||
        event.seq <= state.lastSeq) {
      return state;
    }

    switch (event.type) {
      case 'protocol.unknown':
      case 'run.heartbeat':
        return _advance(state, event);
      case 'text.delta':
        return _advance(
            state,
            event,
            _updateText(
                state.messages,
                event.raw['messageId'] as String,
                event.raw['partId'] as String,
                event.raw['delta'] as String,
                false));
      case 'text.final':
        return _advance(
            state,
            event,
            _updateText(
                state.messages,
                event.raw['messageId'] as String,
                event.raw['partId'] as String,
                event.raw['text'] as String,
                true));
      case 'tool.started':
        return _advance(
            state,
            event,
            _startTool(
                state.messages,
                event.raw['messageId'] as String,
                event.raw['toolCallId'] as String,
                event.raw['toolName'] as String,
                event.raw['summary'] as String?));
      case 'tool.completed':
      case 'tool.failed':
        return _advance(
            state,
            event,
            _finishTool(
                state.messages,
                event.raw['messageId'] as String,
                event.raw['toolCallId'] as String,
                event.type == 'tool.completed' ? 'completed' : 'failed',
                event.raw['summary'] as String?));
      case 'sources.ready':
        final rawSources = event.raw['sources'] as List<dynamic>? ?? [];
        final sources = rawSources
            .map((s) => ReasonAISource.fromJson(s as Map<String, dynamic>))
            .toList();
        return _advance(
            state,
            event,
            _upsertPart(
                state.messages,
                event.raw['messageId'] as String,
                ReasonAIMessagePart.sources(
                  partId: event.raw['partId'] as String,
                  sources: sources,
                  retrievalStatus: event.raw['retrievalStatus'] as String?,
                  contextToken: event.raw['contextToken'] as String?,
                  notice: event.raw['notice'] as String?,
                )));
      case 'visual.ready':
        return _advance(
            state,
            event,
            _upsertPart(
                state.messages,
                event.raw['messageId'] as String,
                ReasonAIMessagePart.visual(
                  partId: event.raw['partId'] as String,
                  data: event.raw['data'] as Map<String, dynamic>? ?? {},
                )));
      case 'artifact.proposal':
        return _advance(
            state,
            event,
            _upsertPart(
                state.messages,
                event.raw['messageId'] as String,
                ReasonAIMessagePart.artifact(
                  partId: event.raw['partId'] as String,
                  proposalId: event.raw['proposalId'] as String,
                  status: ReasonAIArtifactStatus.proposed,
                  data: event.raw['data'] as Map<String, dynamic>? ?? {},
                  baseArtifactFingerprint:
                      event.raw['baseArtifactFingerprint'] as String?,
                )));
      case 'artifact.status':
        final rawStatus = event.raw['status'] as String;
        final status = ReasonAIArtifactStatus.values
            .firstWhere((e) => e.name == rawStatus, orElse: () => ReasonAIArtifactStatus.stale);
        return _advance(
            state,
            event,
            _updateArtifactStatus(
                state.messages,
                event.raw['messageId'] as String,
                event.raw['proposalId'] as String,
                status));
      case 'run.completed':
        return state.copyWith(
          status: ReasonAIRunStatus.completed,
          lastSeq: event.seq,
          messages: _setStreamingMessageStatus(state.messages, ReasonAIMessageStatus.completed),
          terminalEventReceived: true,
        );
      case 'run.failed':
        return state.copyWith(
          status: ReasonAIRunStatus.failed,
          lastSeq: event.seq,
          messages: _setStreamingMessageStatus(state.messages, ReasonAIMessageStatus.failed),
          error: ReasonAIRunError(
            message: event.raw['message'] as String? ?? 'Unknown error',
            code: event.raw['code'] as String?,
          ),
          terminalEventReceived: true,
        );
      case 'run.cancelled':
        return state.copyWith(
          status: ReasonAIRunStatus.cancelled,
          lastSeq: event.seq,
          messages: _setStreamingMessageStatus(state.messages, ReasonAIMessageStatus.cancelled),
          terminalEventReceived: true,
        );
      default:
        return state;
    }
  }

  static ReasonAIRuntimeState interrupt(ReasonAIRuntimeState state) {
    if (state.status != ReasonAIRunStatus.running || state.terminalEventReceived) return state;
    return state.copyWith(
      status: ReasonAIRunStatus.interrupted,
      messages: _setStreamingMessageStatus(state.messages, ReasonAIMessageStatus.interrupted),
    );
  }

  static ReasonAIRuntimeState _advance(ReasonAIRuntimeState state, ReasonAIEvent event, [List<ReasonAIRuntimeMessage>? messages]) {
    return state.copyWith(
      lastSeq: event.seq,
      messages: messages ?? state.messages,
    );
  }

  static List<ReasonAIRuntimeMessage> _updateAssistantMessage(
    List<ReasonAIRuntimeMessage> messages,
    String messageId,
    ReasonAIRuntimeMessage Function(ReasonAIRuntimeMessage) update,
  ) {
    final index = messages.indexWhere((m) => m.id == messageId);
    if (index >= 0 && messages[index].role != 'assistant') return messages;

    final current = index >= 0
        ? messages[index]
        : ReasonAIRuntimeMessage(id: messageId, role: 'assistant', parts: [], status: ReasonAIMessageStatus.streaming);
    final updated = update(current);

    if (index >= 0 && identical(updated, current)) return messages;
    if (index < 0 && identical(updated, current)) return messages;

    final next = List<ReasonAIRuntimeMessage>.from(messages);
    if (index >= 0) {
      next[index] = updated;
    } else {
      next.add(updated);
    }
    return next;
  }

  static String? _partId(ReasonAIMessagePart part) {
    return part.map(
      text: (p) => p.partId,
      tool: (p) => null,
      sources: (p) => p.partId,
      visual: (p) => p.partId,
      artifact: (p) => p.partId,
    );
  }

  static List<ReasonAIRuntimeMessage> _upsertPart(
    List<ReasonAIRuntimeMessage> messages,
    String messageId,
    ReasonAIMessagePart nextPart,
  ) {
    return _updateAssistantMessage(messages, messageId, (message) {
      final id = _partId(nextPart);
      final index = id == null ? -1 : message.parts.indexWhere((p) => _partId(p) == id);

      if (index >= 0 && message.parts[index].runtimeType != nextPart.runtimeType) return message;
      if (index < 0) {
        return message.copyWith(parts: [...message.parts, nextPart]);
      }
      final parts = List<ReasonAIMessagePart>.from(message.parts);
      parts[index] = nextPart;
      return message.copyWith(parts: parts);
    });
  }

  static List<ReasonAIRuntimeMessage> _updateText(
    List<ReasonAIRuntimeMessage> messages,
    String messageId,
    String targetPartId,
    String text,
    bool finalized,
  ) {
    return _updateAssistantMessage(messages, messageId, (message) {
      final index = message.parts.indexWhere((p) => _partId(p) == targetPartId);
      if (index < 0) {
        return message.copyWith(
          parts: [...message.parts, ReasonAIMessagePart.text(partId: targetPartId, text: text, finalized: finalized)]
        );
      }
      final current = message.parts[index];
      if (current is! ReasonAITextPart) return message;
      if (current.finalized && !finalized) return message;

      final parts = List<ReasonAIMessagePart>.from(message.parts);
      parts[index] = current.copyWith(
        text: finalized ? text : current.text + text,
        finalized: current.finalized || finalized,
      );
      return message.copyWith(parts: parts);
    });
  }

  static List<ReasonAIRuntimeMessage> _startTool(
    List<ReasonAIRuntimeMessage> messages,
    String messageId,
    String toolCallId,
    String toolName,
    String? summary,
  ) {
    if (messages.any((m) => m.parts.any((p) => p is ReasonAIToolPart && p.toolCallId == toolCallId))) {
      return messages;
    }
    return _updateAssistantMessage(messages, messageId, (message) {
      return message.copyWith(
        parts: [
          ...message.parts,
          ReasonAIMessagePart.tool(toolCallId: toolCallId, toolName: toolName, status: 'running', summary: summary)
        ]
      );
    });
  }

  static List<ReasonAIRuntimeMessage> _finishTool(
    List<ReasonAIRuntimeMessage> messages,
    String messageId,
    String toolCallId,
    String status,
    String? summary,
  ) {
    return _updateAssistantMessage(messages, messageId, (message) {
      final index = message.parts.indexWhere((p) => p is ReasonAIToolPart && p.toolCallId == toolCallId);
      if (index < 0) return message;
      final current = message.parts[index] as ReasonAIToolPart;
      if (current.status != 'running') return message;

      final parts = List<ReasonAIMessagePart>.from(message.parts);
      parts[index] = current.copyWith(status: status, summary: summary ?? current.summary);
      return message.copyWith(parts: parts);
    });
  }

  static List<ReasonAIRuntimeMessage> _updateArtifactStatus(
    List<ReasonAIRuntimeMessage> messages,
    String messageId,
    String proposalId,
    ReasonAIArtifactStatus status,
  ) {
    return _updateAssistantMessage(messages, messageId, (message) {
      final index = message.parts.indexWhere((p) => p is ReasonAIArtifactPart && p.proposalId == proposalId);
      if (index < 0) return message;
      final current = message.parts[index] as ReasonAIArtifactPart;
      if (current.status != ReasonAIArtifactStatus.proposed) return message;

      final parts = List<ReasonAIMessagePart>.from(message.parts);
      parts[index] = current.copyWith(status: status);
      return message.copyWith(parts: parts);
    });
  }

  static List<ReasonAIRuntimeMessage> _setStreamingMessageStatus(
    List<ReasonAIRuntimeMessage> messages,
    ReasonAIMessageStatus status,
  ) {
    var changed = false;
    final next = messages.map((message) {
      if (message.role != 'assistant' || message.status != ReasonAIMessageStatus.streaming) return message;
      changed = true;
      return message.copyWith(status: status);
    }).toList();
    return changed ? next : messages;
  }
}
