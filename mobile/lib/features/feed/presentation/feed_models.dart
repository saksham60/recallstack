class Story {
  Story._(this.raw);
  final Map<String, dynamic> raw;
  String get id => raw['id'] as String;
  String get title => raw['title'] as String;
  String get summary => raw['summary'] as String;
  String get whyItMatters => raw['whyItMatters'] as String;
  String get sourceName => (raw['source'] as Map)['name'] as String;
  String? get imageUrl {
    final value = raw['imageUrl'] as String?;
    return value == null || value.isEmpty ? null : value;
  }

  String? get sourceUrl => raw['sourceUrl'] as String?;
  DateTime get publishedAt => DateTime.parse(raw['publishedAt'] as String);
  String ageLabel([DateTime? now]) {
    final minutes = (now ?? DateTime.now()).difference(publishedAt).inMinutes;
    if (minutes < 60) return minutes < 1 ? 'Just now' : '${minutes}m ago';
    final hours = minutes ~/ 60;
    if (hours < 24) return '${hours}h ago';
    final days = hours ~/ 24;
    return days < 7
        ? '${days}d ago'
        : '${publishedAt.day}/${publishedAt.month}/${publishedAt.year}';
  }

  List<String> get topics => List<String>.from(raw['topics'] as List);
  bool get saved => (raw['viewerState'] as Map)['saved'] == true;
  Story withSaved(bool saved) {
    final updated = Map<String, dynamic>.from(raw);
    updated['viewerState'] = {
      ...Map<String, dynamic>.from(raw['viewerState'] as Map),
      'saved': saved,
    };
    return Story._(updated);
  }

  static Story parse(Object? value) {
    final raw = Map<String, dynamic>.from(value as Map);
    for (final field in [
      'id',
      'title',
      'summary',
      'whyItMatters',
      'publishedAt',
    ]) {
      if (raw[field] is! String) throw FormatException('Invalid story $field');
    }
    if (raw['source'] is! Map ||
        (raw['source'] as Map)['name'] is! String ||
        raw['topics'] is! List ||
        raw['viewerState'] is! Map ||
        (raw['viewerState'] as Map)['saved'] is! bool) {
      throw const FormatException('Invalid story shape');
    }
    DateTime.parse(raw['publishedAt'] as String);
    return Story._(raw);
  }
}

Map<String, dynamic> toReasonAIContext(Story story) {
  final raw = story.raw;
  final source = raw['source'];
  final viewerState = raw['viewerState'];
  if (source is! Map ||
      source['key'] is! String ||
      source['name'] is! String ||
      raw['sourceUrl'] is! String ||
      raw['importanceScore'] is! num ||
      raw['qualityScore'] is! num ||
      viewerState is! Map ||
      viewerState['saved'] is! bool) {
    throw const FormatException('Incomplete story context for ReasonAI.');
  }
  return {
    'id': story.id,
    'title': story.title,
    'summary': story.summary,
    'whyItMatters': story.whyItMatters,
    'source': {'key': source['key'], 'name': source['name']},
    'sourceUrl': raw['sourceUrl'],
    'imageUrl': raw['imageUrl'],
    'publishedAt': raw['publishedAt'],
    'topics': story.topics,
    'importanceScore': raw['importanceScore'],
    'qualityScore': raw['qualityScore'],
    'viewerState': {
      'saved': viewerState['saved'],
      'seenAt': viewerState['seenAt'],
    },
  };
}

class FeedPage {
  const FeedPage(this.items, this.nextCursor, this.hasMore);
  final List<Story> items;
  final String? nextCursor;
  final bool hasMore;
  static FeedPage parse(Object? json) {
    final map = Map<String, dynamic>.from(json as Map);
    final raw = map['items'] as List;
    final stories = <Story>[];
    for (final item in raw) {
      try {
        stories.add(Story.parse(item));
      } catch (_) {
        /* Skip one malformed card. */
      }
    }
    if (raw.isNotEmpty && stories.isEmpty) {
      throw const FormatException('No valid stories');
    }
    final cursor = map['nextCursor'] as String?;
    final more = map['hasMore'] as bool;
    if (more && (cursor == null || cursor.isEmpty)) {
      throw const FormatException('Missing feed cursor');
    }
    return FeedPage(stories, cursor, more);
  }
}

const feedTopics = <String, String>{
  '': 'For You',
  'ai': 'AI',
  'agents': 'Agents',
  'architecture': 'Architecture',
  'cloud': 'Cloud',
  'research': 'Research',
  'security': 'Security',
  'data': 'Data',
  'developer-tools': 'Developer Tools',
};
