class StudyNote {
  const StudyNote(this.data);
  final Map<String, dynamic> data;
  String get id => data['content_item_id'] as String;
  String get slug => data['slug'] as String;
  String get title => data['title'] as String;
  String? get difficulty => data['difficulty'] as String?;
  String get type => data['type'] as String;
  bool get bookmarked => data['is_bookmarked'] == true;
  List<Map<String, dynamic>> get blocks => (data['blocks'] as List)
      .map((e) => Map<String, dynamic>.from(e as Map))
      .toList();
  List<Map<String, dynamic>> get resources =>
      (data['practice_resources'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
  Map<String, dynamic>? get primaryResource {
    if (resources.isEmpty) return null;
    return resources.firstWhere(
      (e) => e['is_primary'] == true,
      orElse: () => resources.first,
    );
  }

  static StudyNote parse(Object? data) {
    final map = Map<String, dynamic>.from(data as Map);
    for (final key in ['content_item_id', 'slug', 'title', 'type']) {
      if (map[key] is! String) throw FormatException('Invalid note $key');
    }
    if (map['blocks'] is! List || map['practice_resources'] is! List) {
      throw const FormatException('Invalid study note');
    }
    return StudyNote(map);
  }
}
