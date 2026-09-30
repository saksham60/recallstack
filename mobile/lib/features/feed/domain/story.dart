import 'package:freezed_annotation/freezed_annotation.dart';

part 'story.freezed.dart';
part 'story.g.dart';

@freezed
abstract class Source with _$Source {
  const factory Source({
    required String id,
    required String name,
    required String domain,
    required String faviconUrl,
  }) = _Source;

  factory Source.fromJson(Map<String, dynamic> json) => _$SourceFromJson(json);
}

@freezed
abstract class ViewerState with _$ViewerState {
  const factory ViewerState({
    @Default(false) bool saved,
    @Default(false) bool notInterested,
    @Default(false) bool read,
  }) = _ViewerState;

  factory ViewerState.fromJson(Map<String, dynamic> json) => _$ViewerStateFromJson(json);
}

@freezed
abstract class Story with _$Story {
  const factory Story({
    required String id,
    required String title,
    required String summary,
    required String whyItMatters,
    required Source source,
    required String sourceUrl,
    required String imageUrl,
    required DateTime publishedAt,
    required List<String> topics,
    required double importanceScore,
    required double qualityScore,
    required ViewerState viewerState,
  }) = _Story;

  factory Story.fromJson(Map<String, dynamic> json) => _$StoryFromJson(json);
}

@freezed
abstract class FeedResponse with _$FeedResponse {
  const factory FeedResponse({
    required List<Story> items,
    String? nextCursor,
    required bool hasMore,
  }) = _FeedResponse;

  factory FeedResponse.fromJson(Map<String, dynamic> json) => _$FeedResponseFromJson(json);
}
