// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $SavedStoriesTable extends SavedStories
    with TableInfo<$SavedStoriesTable, SavedStory> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SavedStoriesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sourceNameMeta = const VerificationMeta(
    'sourceName',
  );
  @override
  late final GeneratedColumn<String> sourceName = GeneratedColumn<String>(
    'source_name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _imageUrlMeta = const VerificationMeta(
    'imageUrl',
  );
  @override
  late final GeneratedColumn<String> imageUrl = GeneratedColumn<String>(
    'image_url',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _publishedAtMeta = const VerificationMeta(
    'publishedAt',
  );
  @override
  late final GeneratedColumn<DateTime> publishedAt = GeneratedColumn<DateTime>(
    'published_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _savedAtMeta = const VerificationMeta(
    'savedAt',
  );
  @override
  late final GeneratedColumn<DateTime> savedAt = GeneratedColumn<DateTime>(
    'saved_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    title,
    sourceName,
    imageUrl,
    publishedAt,
    savedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'saved_stories';
  @override
  VerificationContext validateIntegrity(
    Insertable<SavedStory> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('source_name')) {
      context.handle(
        _sourceNameMeta,
        sourceName.isAcceptableOrUnknown(data['source_name']!, _sourceNameMeta),
      );
    } else if (isInserting) {
      context.missing(_sourceNameMeta);
    }
    if (data.containsKey('image_url')) {
      context.handle(
        _imageUrlMeta,
        imageUrl.isAcceptableOrUnknown(data['image_url']!, _imageUrlMeta),
      );
    }
    if (data.containsKey('published_at')) {
      context.handle(
        _publishedAtMeta,
        publishedAt.isAcceptableOrUnknown(
          data['published_at']!,
          _publishedAtMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_publishedAtMeta);
    }
    if (data.containsKey('saved_at')) {
      context.handle(
        _savedAtMeta,
        savedAt.isAcceptableOrUnknown(data['saved_at']!, _savedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_savedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  SavedStory map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SavedStory(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      sourceName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}source_name'],
      )!,
      imageUrl: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}image_url'],
      ),
      publishedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}published_at'],
      )!,
      savedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}saved_at'],
      )!,
    );
  }

  @override
  $SavedStoriesTable createAlias(String alias) {
    return $SavedStoriesTable(attachedDatabase, alias);
  }
}

class SavedStory extends DataClass implements Insertable<SavedStory> {
  final String id;
  final String title;
  final String sourceName;
  final String? imageUrl;
  final DateTime publishedAt;
  final DateTime savedAt;
  const SavedStory({
    required this.id,
    required this.title,
    required this.sourceName,
    this.imageUrl,
    required this.publishedAt,
    required this.savedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['title'] = Variable<String>(title);
    map['source_name'] = Variable<String>(sourceName);
    if (!nullToAbsent || imageUrl != null) {
      map['image_url'] = Variable<String>(imageUrl);
    }
    map['published_at'] = Variable<DateTime>(publishedAt);
    map['saved_at'] = Variable<DateTime>(savedAt);
    return map;
  }

  SavedStoriesCompanion toCompanion(bool nullToAbsent) {
    return SavedStoriesCompanion(
      id: Value(id),
      title: Value(title),
      sourceName: Value(sourceName),
      imageUrl: imageUrl == null && nullToAbsent
          ? const Value.absent()
          : Value(imageUrl),
      publishedAt: Value(publishedAt),
      savedAt: Value(savedAt),
    );
  }

  factory SavedStory.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SavedStory(
      id: serializer.fromJson<String>(json['id']),
      title: serializer.fromJson<String>(json['title']),
      sourceName: serializer.fromJson<String>(json['sourceName']),
      imageUrl: serializer.fromJson<String?>(json['imageUrl']),
      publishedAt: serializer.fromJson<DateTime>(json['publishedAt']),
      savedAt: serializer.fromJson<DateTime>(json['savedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'title': serializer.toJson<String>(title),
      'sourceName': serializer.toJson<String>(sourceName),
      'imageUrl': serializer.toJson<String?>(imageUrl),
      'publishedAt': serializer.toJson<DateTime>(publishedAt),
      'savedAt': serializer.toJson<DateTime>(savedAt),
    };
  }

  SavedStory copyWith({
    String? id,
    String? title,
    String? sourceName,
    Value<String?> imageUrl = const Value.absent(),
    DateTime? publishedAt,
    DateTime? savedAt,
  }) => SavedStory(
    id: id ?? this.id,
    title: title ?? this.title,
    sourceName: sourceName ?? this.sourceName,
    imageUrl: imageUrl.present ? imageUrl.value : this.imageUrl,
    publishedAt: publishedAt ?? this.publishedAt,
    savedAt: savedAt ?? this.savedAt,
  );
  SavedStory copyWithCompanion(SavedStoriesCompanion data) {
    return SavedStory(
      id: data.id.present ? data.id.value : this.id,
      title: data.title.present ? data.title.value : this.title,
      sourceName: data.sourceName.present
          ? data.sourceName.value
          : this.sourceName,
      imageUrl: data.imageUrl.present ? data.imageUrl.value : this.imageUrl,
      publishedAt: data.publishedAt.present
          ? data.publishedAt.value
          : this.publishedAt,
      savedAt: data.savedAt.present ? data.savedAt.value : this.savedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SavedStory(')
          ..write('id: $id, ')
          ..write('title: $title, ')
          ..write('sourceName: $sourceName, ')
          ..write('imageUrl: $imageUrl, ')
          ..write('publishedAt: $publishedAt, ')
          ..write('savedAt: $savedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, title, sourceName, imageUrl, publishedAt, savedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SavedStory &&
          other.id == this.id &&
          other.title == this.title &&
          other.sourceName == this.sourceName &&
          other.imageUrl == this.imageUrl &&
          other.publishedAt == this.publishedAt &&
          other.savedAt == this.savedAt);
}

class SavedStoriesCompanion extends UpdateCompanion<SavedStory> {
  final Value<String> id;
  final Value<String> title;
  final Value<String> sourceName;
  final Value<String?> imageUrl;
  final Value<DateTime> publishedAt;
  final Value<DateTime> savedAt;
  final Value<int> rowid;
  const SavedStoriesCompanion({
    this.id = const Value.absent(),
    this.title = const Value.absent(),
    this.sourceName = const Value.absent(),
    this.imageUrl = const Value.absent(),
    this.publishedAt = const Value.absent(),
    this.savedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SavedStoriesCompanion.insert({
    required String id,
    required String title,
    required String sourceName,
    this.imageUrl = const Value.absent(),
    required DateTime publishedAt,
    required DateTime savedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       title = Value(title),
       sourceName = Value(sourceName),
       publishedAt = Value(publishedAt),
       savedAt = Value(savedAt);
  static Insertable<SavedStory> custom({
    Expression<String>? id,
    Expression<String>? title,
    Expression<String>? sourceName,
    Expression<String>? imageUrl,
    Expression<DateTime>? publishedAt,
    Expression<DateTime>? savedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (title != null) 'title': title,
      if (sourceName != null) 'source_name': sourceName,
      if (imageUrl != null) 'image_url': imageUrl,
      if (publishedAt != null) 'published_at': publishedAt,
      if (savedAt != null) 'saved_at': savedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SavedStoriesCompanion copyWith({
    Value<String>? id,
    Value<String>? title,
    Value<String>? sourceName,
    Value<String?>? imageUrl,
    Value<DateTime>? publishedAt,
    Value<DateTime>? savedAt,
    Value<int>? rowid,
  }) {
    return SavedStoriesCompanion(
      id: id ?? this.id,
      title: title ?? this.title,
      sourceName: sourceName ?? this.sourceName,
      imageUrl: imageUrl ?? this.imageUrl,
      publishedAt: publishedAt ?? this.publishedAt,
      savedAt: savedAt ?? this.savedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (sourceName.present) {
      map['source_name'] = Variable<String>(sourceName.value);
    }
    if (imageUrl.present) {
      map['image_url'] = Variable<String>(imageUrl.value);
    }
    if (publishedAt.present) {
      map['published_at'] = Variable<DateTime>(publishedAt.value);
    }
    if (savedAt.present) {
      map['saved_at'] = Variable<DateTime>(savedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SavedStoriesCompanion(')
          ..write('id: $id, ')
          ..write('title: $title, ')
          ..write('sourceName: $sourceName, ')
          ..write('imageUrl: $imageUrl, ')
          ..write('publishedAt: $publishedAt, ')
          ..write('savedAt: $savedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $DsaDraftsTable extends DsaDrafts
    with TableInfo<$DsaDraftsTable, DsaDraft> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $DsaDraftsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _contentIdMeta = const VerificationMeta(
    'contentId',
  );
  @override
  late final GeneratedColumn<String> contentId = GeneratedColumn<String>(
    'content_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _approachMeta = const VerificationMeta(
    'approach',
  );
  @override
  late final GeneratedColumn<String> approach = GeneratedColumn<String>(
    'approach',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _codeMeta = const VerificationMeta('code');
  @override
  late final GeneratedColumn<String> code = GeneratedColumn<String>(
    'code',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [contentId, approach, code, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'dsa_drafts';
  @override
  VerificationContext validateIntegrity(
    Insertable<DsaDraft> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('content_id')) {
      context.handle(
        _contentIdMeta,
        contentId.isAcceptableOrUnknown(data['content_id']!, _contentIdMeta),
      );
    } else if (isInserting) {
      context.missing(_contentIdMeta);
    }
    if (data.containsKey('approach')) {
      context.handle(
        _approachMeta,
        approach.isAcceptableOrUnknown(data['approach']!, _approachMeta),
      );
    }
    if (data.containsKey('code')) {
      context.handle(
        _codeMeta,
        code.isAcceptableOrUnknown(data['code']!, _codeMeta),
      );
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {contentId};
  @override
  DsaDraft map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return DsaDraft(
      contentId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}content_id'],
      )!,
      approach: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}approach'],
      )!,
      code: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}code'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $DsaDraftsTable createAlias(String alias) {
    return $DsaDraftsTable(attachedDatabase, alias);
  }
}

class DsaDraft extends DataClass implements Insertable<DsaDraft> {
  final String contentId;
  final String approach;
  final String code;
  final DateTime updatedAt;
  const DsaDraft({
    required this.contentId,
    required this.approach,
    required this.code,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['content_id'] = Variable<String>(contentId);
    map['approach'] = Variable<String>(approach);
    map['code'] = Variable<String>(code);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  DsaDraftsCompanion toCompanion(bool nullToAbsent) {
    return DsaDraftsCompanion(
      contentId: Value(contentId),
      approach: Value(approach),
      code: Value(code),
      updatedAt: Value(updatedAt),
    );
  }

  factory DsaDraft.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return DsaDraft(
      contentId: serializer.fromJson<String>(json['contentId']),
      approach: serializer.fromJson<String>(json['approach']),
      code: serializer.fromJson<String>(json['code']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'contentId': serializer.toJson<String>(contentId),
      'approach': serializer.toJson<String>(approach),
      'code': serializer.toJson<String>(code),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  DsaDraft copyWith({
    String? contentId,
    String? approach,
    String? code,
    DateTime? updatedAt,
  }) => DsaDraft(
    contentId: contentId ?? this.contentId,
    approach: approach ?? this.approach,
    code: code ?? this.code,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  DsaDraft copyWithCompanion(DsaDraftsCompanion data) {
    return DsaDraft(
      contentId: data.contentId.present ? data.contentId.value : this.contentId,
      approach: data.approach.present ? data.approach.value : this.approach,
      code: data.code.present ? data.code.value : this.code,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('DsaDraft(')
          ..write('contentId: $contentId, ')
          ..write('approach: $approach, ')
          ..write('code: $code, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(contentId, approach, code, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is DsaDraft &&
          other.contentId == this.contentId &&
          other.approach == this.approach &&
          other.code == this.code &&
          other.updatedAt == this.updatedAt);
}

class DsaDraftsCompanion extends UpdateCompanion<DsaDraft> {
  final Value<String> contentId;
  final Value<String> approach;
  final Value<String> code;
  final Value<DateTime> updatedAt;
  final Value<int> rowid;
  const DsaDraftsCompanion({
    this.contentId = const Value.absent(),
    this.approach = const Value.absent(),
    this.code = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  DsaDraftsCompanion.insert({
    required String contentId,
    this.approach = const Value.absent(),
    this.code = const Value.absent(),
    required DateTime updatedAt,
    this.rowid = const Value.absent(),
  }) : contentId = Value(contentId),
       updatedAt = Value(updatedAt);
  static Insertable<DsaDraft> custom({
    Expression<String>? contentId,
    Expression<String>? approach,
    Expression<String>? code,
    Expression<DateTime>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (contentId != null) 'content_id': contentId,
      if (approach != null) 'approach': approach,
      if (code != null) 'code': code,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  DsaDraftsCompanion copyWith({
    Value<String>? contentId,
    Value<String>? approach,
    Value<String>? code,
    Value<DateTime>? updatedAt,
    Value<int>? rowid,
  }) {
    return DsaDraftsCompanion(
      contentId: contentId ?? this.contentId,
      approach: approach ?? this.approach,
      code: code ?? this.code,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (contentId.present) {
      map['content_id'] = Variable<String>(contentId.value);
    }
    if (approach.present) {
      map['approach'] = Variable<String>(approach.value);
    }
    if (code.present) {
      map['code'] = Variable<String>(code.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('DsaDraftsCompanion(')
          ..write('contentId: $contentId, ')
          ..write('approach: $approach, ')
          ..write('code: $code, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $SavedStoriesTable savedStories = $SavedStoriesTable(this);
  late final $DsaDraftsTable dsaDrafts = $DsaDraftsTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [savedStories, dsaDrafts];
}

typedef $$SavedStoriesTableCreateCompanionBuilder =
    SavedStoriesCompanion Function({
      required String id,
      required String title,
      required String sourceName,
      Value<String?> imageUrl,
      required DateTime publishedAt,
      required DateTime savedAt,
      Value<int> rowid,
    });
typedef $$SavedStoriesTableUpdateCompanionBuilder =
    SavedStoriesCompanion Function({
      Value<String> id,
      Value<String> title,
      Value<String> sourceName,
      Value<String?> imageUrl,
      Value<DateTime> publishedAt,
      Value<DateTime> savedAt,
      Value<int> rowid,
    });

class $$SavedStoriesTableFilterComposer
    extends Composer<_$AppDatabase, $SavedStoriesTable> {
  $$SavedStoriesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sourceName => $composableBuilder(
    column: $table.sourceName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get imageUrl => $composableBuilder(
    column: $table.imageUrl,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get publishedAt => $composableBuilder(
    column: $table.publishedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get savedAt => $composableBuilder(
    column: $table.savedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SavedStoriesTableOrderingComposer
    extends Composer<_$AppDatabase, $SavedStoriesTable> {
  $$SavedStoriesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sourceName => $composableBuilder(
    column: $table.sourceName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get imageUrl => $composableBuilder(
    column: $table.imageUrl,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get publishedAt => $composableBuilder(
    column: $table.publishedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get savedAt => $composableBuilder(
    column: $table.savedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SavedStoriesTableAnnotationComposer
    extends Composer<_$AppDatabase, $SavedStoriesTable> {
  $$SavedStoriesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get sourceName => $composableBuilder(
    column: $table.sourceName,
    builder: (column) => column,
  );

  GeneratedColumn<String> get imageUrl =>
      $composableBuilder(column: $table.imageUrl, builder: (column) => column);

  GeneratedColumn<DateTime> get publishedAt => $composableBuilder(
    column: $table.publishedAt,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get savedAt =>
      $composableBuilder(column: $table.savedAt, builder: (column) => column);
}

class $$SavedStoriesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SavedStoriesTable,
          SavedStory,
          $$SavedStoriesTableFilterComposer,
          $$SavedStoriesTableOrderingComposer,
          $$SavedStoriesTableAnnotationComposer,
          $$SavedStoriesTableCreateCompanionBuilder,
          $$SavedStoriesTableUpdateCompanionBuilder,
          (
            SavedStory,
            BaseReferences<_$AppDatabase, $SavedStoriesTable, SavedStory>,
          ),
          SavedStory,
          PrefetchHooks Function()
        > {
  $$SavedStoriesTableTableManager(_$AppDatabase db, $SavedStoriesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SavedStoriesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SavedStoriesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SavedStoriesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<String> sourceName = const Value.absent(),
                Value<String?> imageUrl = const Value.absent(),
                Value<DateTime> publishedAt = const Value.absent(),
                Value<DateTime> savedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SavedStoriesCompanion(
                id: id,
                title: title,
                sourceName: sourceName,
                imageUrl: imageUrl,
                publishedAt: publishedAt,
                savedAt: savedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String title,
                required String sourceName,
                Value<String?> imageUrl = const Value.absent(),
                required DateTime publishedAt,
                required DateTime savedAt,
                Value<int> rowid = const Value.absent(),
              }) => SavedStoriesCompanion.insert(
                id: id,
                title: title,
                sourceName: sourceName,
                imageUrl: imageUrl,
                publishedAt: publishedAt,
                savedAt: savedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SavedStoriesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SavedStoriesTable,
      SavedStory,
      $$SavedStoriesTableFilterComposer,
      $$SavedStoriesTableOrderingComposer,
      $$SavedStoriesTableAnnotationComposer,
      $$SavedStoriesTableCreateCompanionBuilder,
      $$SavedStoriesTableUpdateCompanionBuilder,
      (
        SavedStory,
        BaseReferences<_$AppDatabase, $SavedStoriesTable, SavedStory>,
      ),
      SavedStory,
      PrefetchHooks Function()
    >;
typedef $$DsaDraftsTableCreateCompanionBuilder =
    DsaDraftsCompanion Function({
      required String contentId,
      Value<String> approach,
      Value<String> code,
      required DateTime updatedAt,
      Value<int> rowid,
    });
typedef $$DsaDraftsTableUpdateCompanionBuilder =
    DsaDraftsCompanion Function({
      Value<String> contentId,
      Value<String> approach,
      Value<String> code,
      Value<DateTime> updatedAt,
      Value<int> rowid,
    });

class $$DsaDraftsTableFilterComposer
    extends Composer<_$AppDatabase, $DsaDraftsTable> {
  $$DsaDraftsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get contentId => $composableBuilder(
    column: $table.contentId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get approach => $composableBuilder(
    column: $table.approach,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get code => $composableBuilder(
    column: $table.code,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$DsaDraftsTableOrderingComposer
    extends Composer<_$AppDatabase, $DsaDraftsTable> {
  $$DsaDraftsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get contentId => $composableBuilder(
    column: $table.contentId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get approach => $composableBuilder(
    column: $table.approach,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get code => $composableBuilder(
    column: $table.code,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$DsaDraftsTableAnnotationComposer
    extends Composer<_$AppDatabase, $DsaDraftsTable> {
  $$DsaDraftsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get contentId =>
      $composableBuilder(column: $table.contentId, builder: (column) => column);

  GeneratedColumn<String> get approach =>
      $composableBuilder(column: $table.approach, builder: (column) => column);

  GeneratedColumn<String> get code =>
      $composableBuilder(column: $table.code, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$DsaDraftsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $DsaDraftsTable,
          DsaDraft,
          $$DsaDraftsTableFilterComposer,
          $$DsaDraftsTableOrderingComposer,
          $$DsaDraftsTableAnnotationComposer,
          $$DsaDraftsTableCreateCompanionBuilder,
          $$DsaDraftsTableUpdateCompanionBuilder,
          (DsaDraft, BaseReferences<_$AppDatabase, $DsaDraftsTable, DsaDraft>),
          DsaDraft,
          PrefetchHooks Function()
        > {
  $$DsaDraftsTableTableManager(_$AppDatabase db, $DsaDraftsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$DsaDraftsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$DsaDraftsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$DsaDraftsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> contentId = const Value.absent(),
                Value<String> approach = const Value.absent(),
                Value<String> code = const Value.absent(),
                Value<DateTime> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => DsaDraftsCompanion(
                contentId: contentId,
                approach: approach,
                code: code,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String contentId,
                Value<String> approach = const Value.absent(),
                Value<String> code = const Value.absent(),
                required DateTime updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => DsaDraftsCompanion.insert(
                contentId: contentId,
                approach: approach,
                code: code,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$DsaDraftsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $DsaDraftsTable,
      DsaDraft,
      $$DsaDraftsTableFilterComposer,
      $$DsaDraftsTableOrderingComposer,
      $$DsaDraftsTableAnnotationComposer,
      $$DsaDraftsTableCreateCompanionBuilder,
      $$DsaDraftsTableUpdateCompanionBuilder,
      (DsaDraft, BaseReferences<_$AppDatabase, $DsaDraftsTable, DsaDraft>),
      DsaDraft,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$SavedStoriesTableTableManager get savedStories =>
      $$SavedStoriesTableTableManager(_db, _db.savedStories);
  $$DsaDraftsTableTableManager get dsaDrafts =>
      $$DsaDraftsTableTableManager(_db, _db.dsaDrafts);
}
