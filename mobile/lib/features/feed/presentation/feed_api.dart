import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import 'feed_models.dart';

class FeedApi {
  const FeedApi(this.dio);
  final Dio dio;
  Future<FeedPage> page({
    String topic = '',
    String? cursor,
    CancelToken? token,
  }) async {
    try {
      final response = await dio.get(
        'knowledge/feed',
        queryParameters: {
          'limit': 10,
          if (topic.isNotEmpty) 'topic': topic,
          if (cursor != null) 'cursor': cursor,
        },
        cancelToken: token,
      );
      return FeedPage.parse(response.data);
    } catch (error) {
      throw ApiFailure.from(error);
    }
  }

  Future<Story> story(String id) async {
    try {
      final response = await dio.get(
        'knowledge/stories/${Uri.encodeComponent(id)}',
      );
      return Story.parse(response.data);
    } catch (error) {
      throw ApiFailure.from(error);
    }
  }

  Future<void> event(String storyId, String type) async {
    await events([
      {
        'eventId': const Uuid().v4(),
        'storyId': storyId,
        'type': type,
        'occurredAt': DateTime.now().toUtc().toIso8601String(),
      },
    ]);
  }

  Future<void> events(List<Map<String, dynamic>> batch) async {
    try {
      await dio.post('knowledge/events/batch', data: {'events': batch});
    } catch (error) {
      throw ApiFailure.from(error);
    }
  }

  Future<Map<String, dynamic>> preferences() async {
    try {
      final response = await dio.get('knowledge/preferences');
      return Map<String, dynamic>.from(response.data as Map);
    } catch (error) {
      throw ApiFailure.from(error);
    }
  }

  Future<void> patchPreferences({
    List<String>? topics,
    String? interestPrompt,
  }) async {
    try {
      await dio.patch(
        'knowledge/preferences',
        data: {
          if (topics != null)
            'topics': topics
                .map((topic) => {'topic': topic, 'weight': 1})
                .toList(),
          if (interestPrompt != null) 'interestPrompt': interestPrompt,
        },
      );
    } catch (error) {
      throw ApiFailure.from(error);
    }
  }
}

final feedApiProvider = Provider<FeedApi>(
  (ref) => FeedApi(ref.watch(backendDioProvider)),
);
