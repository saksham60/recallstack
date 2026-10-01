class VisualLesson {
  const VisualLesson(this.title, this.summary, this.kind, this.steps);
  final String title, summary, kind;
  final List<VisualStep> steps;
  static VisualLesson? tryParse(Object? value) {
    try {
      final map = Map<String, dynamic>.from(value as Map);
      final title = map['title'] as String;
      final summary = map['summary'] as String? ?? '';
      final kind = map['kind'] as String;
      final items = map['steps'] as List;
      if (title.isEmpty ||
          !['array', 'graph', 'grid'].contains(kind) ||
          items.isEmpty ||
          items.length > 12) {
        return null;
      }
      final steps = items.map((item) => VisualStep.parse(item)).toList();
      return VisualLesson(title, summary, kind, steps);
    } catch (_) {
      return null;
    }
  }
}

class VisualStep {
  const VisualStep(
    this.title,
    this.explanation,
    this.values,
    this.highlights,
    this.pointers,
    this.nodes,
    this.edges,
    this.rows,
    this.activeCells,
    this.variables,
  );
  final String title, explanation;
  final List<String> values;
  final List<int> highlights;
  final List<Map<String, dynamic>> pointers,
      nodes,
      edges,
      activeCells,
      variables;
  final List<List<String>> rows;
  static VisualStep parse(Object? value) {
    final map = Map<String, dynamic>.from(value as Map);
    final title = map['title'] as String;
    final explanation = map['explanation'] as String;
    if (title.isEmpty) throw const FormatException('Missing step title');
    List<Map<String, dynamic>> objects(String key) => (map[key] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    final nodes = objects('nodes');
    for (final node in nodes) {
      final x = node['x'], y = node['y'];
      if (node['id'] is! String ||
          x is! num ||
          y is! num ||
          x < 0 ||
          x > 100 ||
          y < 0 ||
          y > 100) {
        throw const FormatException('Invalid graph node');
      }
    }
    return VisualStep(
      title,
      explanation,
      List<String>.from(map['values'] as List? ?? []),
      List<int>.from(map['highlights'] as List? ?? []),
      objects('pointers'),
      nodes,
      objects('edges'),
      (map['rows'] as List? ?? [])
          .map((e) => List<String>.from(e as List))
          .toList(),
      objects('activeCells'),
      objects('variables'),
    );
  }
}
