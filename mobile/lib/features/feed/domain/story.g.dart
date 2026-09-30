// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'story.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Source _$SourceFromJson(Map<String, dynamic> json) => _Source(
  id: json['id'] as String,
  name: json['name'] as String,
  domain: json['domain'] as String,
  faviconUrl: json['faviconUrl'] as String,
);

Map<String, dynamic> _$SourceToJson(_Source instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'domain': instance.domain,
  'faviconUrl': instance.faviconUrl,
};

_ViewerState _$ViewerStateFromJson(Map<String, dynamic> json) => _ViewerState(
  saved: json['saved'] as bool? ?? false,
  notInterested: json['notInterested'] as bool? ?? false,
  read: json['read'] as bool? ?? false,
);

Map<String, dynamic> _$ViewerStateToJson(_ViewerState instance) =>
    <String, dynamic>{
      'saved': instance.saved,
      'notInterested': instance.notInterested,
      'read': instance.read,
    };

_Story _$StoryFromJson(Map<String, dynamic> json) => _Story(
  id: json['id'] as String,
  title: json['title'] as String,
  summary: json['summary'] as String,
  whyItMatters: json['whyItMatters'] as String,
  source: Source.fromJson(json['source'] as Map<String, dynamic>),
  sourceUrl: json['sourceUrl'] as String,
  imageUrl: json['imageUrl'] as String,
  publishedAt: DateTime.parse(json['publishedAt'] as String),
  topics: (json['topics'] as List<dynamic>).map((e) => e as String).toList(),
  importanceScore: (json['importanceScore'] as num).toDouble(),
  qualityScore: (json['qualityScore'] as num).toDouble(),
  viewerState: ViewerState.fromJson(
    json['viewerState'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$StoryToJson(_Story instance) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'summary': instance.summary,
  'whyItMatters': instance.whyItMatters,
  'source': instance.source,
  'sourceUrl': instance.sourceUrl,
  'imageUrl': instance.imageUrl,
  'publishedAt': instance.publishedAt.toIso8601String(),
  'topics': instance.topics,
  'importanceScore': instance.importanceScore,
  'qualityScore': instance.qualityScore,
  'viewerState': instance.viewerState,
};

_FeedResponse _$FeedResponseFromJson(Map<String, dynamic> json) =>
    _FeedResponse(
      items: (json['items'] as List<dynamic>)
          .map((e) => Story.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: json['nextCursor'] as String?,
      hasMore: json['hasMore'] as bool,
    );

Map<String, dynamic> _$FeedResponseToJson(_FeedResponse instance) =>
    <String, dynamic>{
      'items': instance.items,
      'nextCursor': instance.nextCursor,
      'hasMore': instance.hasMore,
    };
