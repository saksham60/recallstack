// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reasonai_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ReasonAIRunError _$ReasonAIRunErrorFromJson(Map<String, dynamic> json) =>
    _ReasonAIRunError(
      code: json['code'] as String?,
      message: json['message'] as String,
    );

Map<String, dynamic> _$ReasonAIRunErrorToJson(_ReasonAIRunError instance) =>
    <String, dynamic>{'code': instance.code, 'message': instance.message};

ReasonAITextPart _$ReasonAITextPartFromJson(Map<String, dynamic> json) =>
    ReasonAITextPart(
      partId: json['partId'] as String,
      text: json['text'] as String,
      finalized: json['finalized'] as bool,
      $type: json['runtimeType'] as String?,
    );

Map<String, dynamic> _$ReasonAITextPartToJson(ReasonAITextPart instance) =>
    <String, dynamic>{
      'partId': instance.partId,
      'text': instance.text,
      'finalized': instance.finalized,
      'runtimeType': instance.$type,
    };

ReasonAIToolPart _$ReasonAIToolPartFromJson(Map<String, dynamic> json) =>
    ReasonAIToolPart(
      toolCallId: json['toolCallId'] as String,
      toolName: json['toolName'] as String,
      status: json['status'] as String,
      summary: json['summary'] as String?,
      $type: json['runtimeType'] as String?,
    );

Map<String, dynamic> _$ReasonAIToolPartToJson(ReasonAIToolPart instance) =>
    <String, dynamic>{
      'toolCallId': instance.toolCallId,
      'toolName': instance.toolName,
      'status': instance.status,
      'summary': instance.summary,
      'runtimeType': instance.$type,
    };

ReasonAISourcesPart _$ReasonAISourcesPartFromJson(Map<String, dynamic> json) =>
    ReasonAISourcesPart(
      partId: json['partId'] as String,
      sources: (json['sources'] as List<dynamic>)
          .map((e) => ReasonAISource.fromJson(e as Map<String, dynamic>))
          .toList(),
      retrievalStatus: json['retrievalStatus'] as String?,
      contextToken: json['contextToken'] as String?,
      notice: json['notice'] as String?,
      $type: json['runtimeType'] as String?,
    );

Map<String, dynamic> _$ReasonAISourcesPartToJson(
  ReasonAISourcesPart instance,
) => <String, dynamic>{
  'partId': instance.partId,
  'sources': instance.sources,
  'retrievalStatus': instance.retrievalStatus,
  'contextToken': instance.contextToken,
  'notice': instance.notice,
  'runtimeType': instance.$type,
};

ReasonAIVisualPart _$ReasonAIVisualPartFromJson(Map<String, dynamic> json) =>
    ReasonAIVisualPart(
      partId: json['partId'] as String,
      data: json['data'] as Map<String, dynamic>,
      $type: json['runtimeType'] as String?,
    );

Map<String, dynamic> _$ReasonAIVisualPartToJson(ReasonAIVisualPart instance) =>
    <String, dynamic>{
      'partId': instance.partId,
      'data': instance.data,
      'runtimeType': instance.$type,
    };

ReasonAIArtifactPart _$ReasonAIArtifactPartFromJson(
  Map<String, dynamic> json,
) => ReasonAIArtifactPart(
  partId: json['partId'] as String,
  proposalId: json['proposalId'] as String,
  status: $enumDecode(_$ReasonAIArtifactStatusEnumMap, json['status']),
  data: json['data'] as Map<String, dynamic>,
  baseArtifactFingerprint: json['baseArtifactFingerprint'] as String?,
  $type: json['runtimeType'] as String?,
);

Map<String, dynamic> _$ReasonAIArtifactPartToJson(
  ReasonAIArtifactPart instance,
) => <String, dynamic>{
  'partId': instance.partId,
  'proposalId': instance.proposalId,
  'status': _$ReasonAIArtifactStatusEnumMap[instance.status]!,
  'data': instance.data,
  'baseArtifactFingerprint': instance.baseArtifactFingerprint,
  'runtimeType': instance.$type,
};

const _$ReasonAIArtifactStatusEnumMap = {
  ReasonAIArtifactStatus.proposed: 'proposed',
  ReasonAIArtifactStatus.applied: 'applied',
  ReasonAIArtifactStatus.discarded: 'discarded',
  ReasonAIArtifactStatus.stale: 'stale',
};

_ReasonAISource _$ReasonAISourceFromJson(Map<String, dynamic> json) =>
    _ReasonAISource(
      sourceId: json['sourceId'] as String,
      title: json['title'] as String,
      url: json['url'] as String,
      kind: json['kind'] as String?,
    );

Map<String, dynamic> _$ReasonAISourceToJson(_ReasonAISource instance) =>
    <String, dynamic>{
      'sourceId': instance.sourceId,
      'title': instance.title,
      'url': instance.url,
      'kind': instance.kind,
    };

_ReasonAIRuntimeMessage _$ReasonAIRuntimeMessageFromJson(
  Map<String, dynamic> json,
) => _ReasonAIRuntimeMessage(
  id: json['id'] as String,
  role: json['role'] as String,
  parts: (json['parts'] as List<dynamic>)
      .map((e) => ReasonAIMessagePart.fromJson(e as Map<String, dynamic>))
      .toList(),
  status: $enumDecode(_$ReasonAIMessageStatusEnumMap, json['status']),
);

Map<String, dynamic> _$ReasonAIRuntimeMessageToJson(
  _ReasonAIRuntimeMessage instance,
) => <String, dynamic>{
  'id': instance.id,
  'role': instance.role,
  'parts': instance.parts,
  'status': _$ReasonAIMessageStatusEnumMap[instance.status]!,
};

const _$ReasonAIMessageStatusEnumMap = {
  ReasonAIMessageStatus.streaming: 'streaming',
  ReasonAIMessageStatus.completed: 'completed',
  ReasonAIMessageStatus.cancelled: 'cancelled',
  ReasonAIMessageStatus.failed: 'failed',
  ReasonAIMessageStatus.interrupted: 'interrupted',
};

_ReasonAIRuntimeState _$ReasonAIRuntimeStateFromJson(
  Map<String, dynamic> json,
) => _ReasonAIRuntimeState(
  runId: json['runId'] as String?,
  status:
      $enumDecodeNullable(_$ReasonAIRunStatusEnumMap, json['status']) ??
      ReasonAIRunStatus.idle,
  lastSeq: (json['lastSeq'] as num?)?.toInt() ?? 0,
  messages:
      (json['messages'] as List<dynamic>?)
          ?.map(
            (e) => ReasonAIRuntimeMessage.fromJson(e as Map<String, dynamic>),
          )
          .toList() ??
      const [],
  error: json['error'] == null
      ? null
      : ReasonAIRunError.fromJson(json['error'] as Map<String, dynamic>),
  terminalEventReceived: json['terminalEventReceived'] as bool? ?? false,
);

Map<String, dynamic> _$ReasonAIRuntimeStateToJson(
  _ReasonAIRuntimeState instance,
) => <String, dynamic>{
  'runId': instance.runId,
  'status': _$ReasonAIRunStatusEnumMap[instance.status]!,
  'lastSeq': instance.lastSeq,
  'messages': instance.messages,
  'error': instance.error,
  'terminalEventReceived': instance.terminalEventReceived,
};

const _$ReasonAIRunStatusEnumMap = {
  ReasonAIRunStatus.idle: 'idle',
  ReasonAIRunStatus.running: 'running',
  ReasonAIRunStatus.completed: 'completed',
  ReasonAIRunStatus.failed: 'failed',
  ReasonAIRunStatus.cancelled: 'cancelled',
  ReasonAIRunStatus.interrupted: 'interrupted',
};
