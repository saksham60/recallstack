class ProtocolError implements Exception {
  const ProtocolError(this.reason);
  final String reason;
}

class RunInterrupted implements Exception {}

class StreamTimeout implements Exception {}

class ReasonAIEvent {
  const ReasonAIEvent(this.type, this.runId, this.seq, this.data);
  final String type, runId;
  final int seq;
  final Map<String, dynamic> data;
}

class NonStreamResponse extends ReasonAIEvent {
  const NonStreamResponse(Map<String, dynamic> body)
    : super('nonstream', '', 0, body);
}

const _known = {
  'run.started',
  'run.heartbeat',
  'text.delta',
  'text.final',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'sources.ready',
  'visual.ready',
  'run.completed',
  'run.failed',
  'run.cancelled',
};
ReasonAIEvent? parseEvent(Map<String, dynamic> data) {
  final version = data['protocolVersion'];
  final runId = data['runId'];
  final seq = data['seq'];
  final type = data['type'];
  if (version != 1 ||
      runId is! String ||
      runId.isEmpty ||
      seq is! int ||
      seq < 0 ||
      type is! String ||
      type.isEmpty) {
    throw const ProtocolError('Invalid event envelope');
  }
  if (!_known.contains(type)) return null;
  void require(String field, Type valueType) {
    final value = data[field];
    if (value == null ||
        (valueType == String && value is! String) ||
        (valueType == List && value is! List) ||
        (value is String &&
            value.isEmpty &&
            field != 'delta' &&
            field != 'text')) {
      throw ProtocolError('Invalid $type.$field');
    }
  }

  switch (type) {
    case 'text.delta':
      require('messageId', String);
      require('partId', String);
      require('delta', String);
    case 'text.final':
      require('messageId', String);
      require('partId', String);
      require('text', String);
    case 'tool.started':
      require('messageId', String);
      require('toolCallId', String);
      require('toolName', String);
    case 'tool.completed':
    case 'tool.failed':
      require('messageId', String);
      require('toolCallId', String);
    case 'sources.ready':
      require('messageId', String);
      require('partId', String);
      require('sources', List);
      for (final source in data['sources'] as List) {
        if (source is! Map ||
            source['title'] is! String ||
            source['url'] is! String) {
          throw const ProtocolError('Invalid source');
        }
      }
    case 'visual.ready':
      require('messageId', String);
      require('partId', String);
      if (!data.containsKey('data')) {
        throw const ProtocolError('Missing visual data');
      }
    case 'run.failed':
      require('message', String);
  }
  return ReasonAIEvent(type, runId, seq, data);
}
