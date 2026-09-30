import 'package:freezed_annotation/freezed_annotation.dart';

part 'reasonai_models.freezed.dart';
part 'reasonai_models.g.dart';

enum ReasonAIMessageStatus { streaming, completed, cancelled, failed, interrupted }
enum ReasonAIRunStatus { idle, running, completed, failed, cancelled, interrupted }
enum ReasonAIArtifactStatus { proposed, applied, discarded, stale }

@freezed
abstract class ReasonAIRunError with _$ReasonAIRunError {
  const factory ReasonAIRunError({
    String? code,
    required String message,
  }) = _ReasonAIRunError;

  factory ReasonAIRunError.fromJson(Map<String, dynamic> json) => _$ReasonAIRunErrorFromJson(json);
}

@freezed
sealed class ReasonAIMessagePart with _$ReasonAIMessagePart {
  const factory ReasonAIMessagePart.text({
    required String partId,
    required String text,
    required bool finalized,
  }) = ReasonAITextPart;

  const factory ReasonAIMessagePart.tool({
    required String toolCallId,
    required String toolName,
    required String status, // 'running' | 'completed' | 'failed'
    String? summary,
  }) = ReasonAIToolPart;

  const factory ReasonAIMessagePart.sources({
    required String partId,
    required List<ReasonAISource> sources,
    String? retrievalStatus,
    String? contextToken,
    String? notice,
  }) = ReasonAISourcesPart;

  const factory ReasonAIMessagePart.visual({
    required String partId,
    required Map<String, dynamic> data,
  }) = ReasonAIVisualPart;

  const factory ReasonAIMessagePart.artifact({
    required String partId,
    required String proposalId,
    required ReasonAIArtifactStatus status,
    required Map<String, dynamic> data,
    String? baseArtifactFingerprint,
  }) = ReasonAIArtifactPart;

  factory ReasonAIMessagePart.fromJson(Map<String, dynamic> json) => _$ReasonAIMessagePartFromJson(json);
}

@freezed
abstract class ReasonAISource with _$ReasonAISource {
  const factory ReasonAISource({
    required String sourceId,
    required String title,
    required String url,
    String? kind,
  }) = _ReasonAISource;

  factory ReasonAISource.fromJson(Map<String, dynamic> json) => _$ReasonAISourceFromJson(json);
}

@freezed
abstract class ReasonAIRuntimeMessage with _$ReasonAIRuntimeMessage {
  const factory ReasonAIRuntimeMessage({
    required String id,
    required String role, // 'user' | 'assistant'
    required List<ReasonAIMessagePart> parts,
    required ReasonAIMessageStatus status,
  }) = _ReasonAIRuntimeMessage;

  factory ReasonAIRuntimeMessage.fromJson(Map<String, dynamic> json) => _$ReasonAIRuntimeMessageFromJson(json);
}

@freezed
abstract class ReasonAIRuntimeState with _$ReasonAIRuntimeState {
  const factory ReasonAIRuntimeState({
    String? runId,
    @Default(ReasonAIRunStatus.idle) ReasonAIRunStatus status,
    @Default(0) int lastSeq,
    @Default([]) List<ReasonAIRuntimeMessage> messages,
    ReasonAIRunError? error,
    @Default(false) bool terminalEventReceived,
  }) = _ReasonAIRuntimeState;

  factory ReasonAIRuntimeState.fromJson(Map<String, dynamic> json) => _$ReasonAIRuntimeStateFromJson(json);
}
