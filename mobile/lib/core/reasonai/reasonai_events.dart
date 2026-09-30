class ReasonAIEvent {
  final String type;
  final String runId;
  final int seq;
  final Map<String, dynamic> raw;

  ReasonAIEvent({
    required this.type,
    required this.runId,
    required this.seq,
    required this.raw,
  });

  factory ReasonAIEvent.fromJson(Map<String, dynamic> json) {
    return ReasonAIEvent(
      type: json['type'] as String? ?? 'protocol.unknown',
      runId: json['runId'] as String? ?? '',
      seq: json['seq'] as int? ?? 0,
      raw: json,
    );
  }
}
