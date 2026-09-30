// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'reasonai_models.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ReasonAIRunError {

 String? get code; String get message;
/// Create a copy of ReasonAIRunError
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ReasonAIRunErrorCopyWith<ReasonAIRunError> get copyWith => _$ReasonAIRunErrorCopyWithImpl<ReasonAIRunError>(this as ReasonAIRunError, _$identity);

  /// Serializes this ReasonAIRunError to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ReasonAIRunError&&(identical(other.code, code) || other.code == code)&&(identical(other.message, message) || other.message == message));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,code,message);

@override
String toString() {
  return 'ReasonAIRunError(code: $code, message: $message)';
}


}

/// @nodoc
abstract mixin class $ReasonAIRunErrorCopyWith<$Res>  {
  factory $ReasonAIRunErrorCopyWith(ReasonAIRunError value, $Res Function(ReasonAIRunError) _then) = _$ReasonAIRunErrorCopyWithImpl;
@useResult
$Res call({
 String? code, String message
});




}
/// @nodoc
class _$ReasonAIRunErrorCopyWithImpl<$Res>
    implements $ReasonAIRunErrorCopyWith<$Res> {
  _$ReasonAIRunErrorCopyWithImpl(this._self, this._then);

  final ReasonAIRunError _self;
  final $Res Function(ReasonAIRunError) _then;

/// Create a copy of ReasonAIRunError
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? code = freezed,Object? message = null,}) {
  return _then(_self.copyWith(
code: freezed == code ? _self.code : code // ignore: cast_nullable_to_non_nullable
as String?,message: null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [ReasonAIRunError].
extension ReasonAIRunErrorPatterns on ReasonAIRunError {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ReasonAIRunError value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ReasonAIRunError() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ReasonAIRunError value)  $default,){
final _that = this;
switch (_that) {
case _ReasonAIRunError():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ReasonAIRunError value)?  $default,){
final _that = this;
switch (_that) {
case _ReasonAIRunError() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? code,  String message)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ReasonAIRunError() when $default != null:
return $default(_that.code,_that.message);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? code,  String message)  $default,) {final _that = this;
switch (_that) {
case _ReasonAIRunError():
return $default(_that.code,_that.message);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? code,  String message)?  $default,) {final _that = this;
switch (_that) {
case _ReasonAIRunError() when $default != null:
return $default(_that.code,_that.message);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ReasonAIRunError implements ReasonAIRunError {
  const _ReasonAIRunError({this.code, required this.message});
  factory _ReasonAIRunError.fromJson(Map<String, dynamic> json) => _$ReasonAIRunErrorFromJson(json);

@override final  String? code;
@override final  String message;

/// Create a copy of ReasonAIRunError
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ReasonAIRunErrorCopyWith<_ReasonAIRunError> get copyWith => __$ReasonAIRunErrorCopyWithImpl<_ReasonAIRunError>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ReasonAIRunErrorToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ReasonAIRunError&&(identical(other.code, code) || other.code == code)&&(identical(other.message, message) || other.message == message));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,code,message);

@override
String toString() {
  return 'ReasonAIRunError(code: $code, message: $message)';
}


}

/// @nodoc
abstract mixin class _$ReasonAIRunErrorCopyWith<$Res> implements $ReasonAIRunErrorCopyWith<$Res> {
  factory _$ReasonAIRunErrorCopyWith(_ReasonAIRunError value, $Res Function(_ReasonAIRunError) _then) = __$ReasonAIRunErrorCopyWithImpl;
@override @useResult
$Res call({
 String? code, String message
});




}
/// @nodoc
class __$ReasonAIRunErrorCopyWithImpl<$Res>
    implements _$ReasonAIRunErrorCopyWith<$Res> {
  __$ReasonAIRunErrorCopyWithImpl(this._self, this._then);

  final _ReasonAIRunError _self;
  final $Res Function(_ReasonAIRunError) _then;

/// Create a copy of ReasonAIRunError
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? code = freezed,Object? message = null,}) {
  return _then(_ReasonAIRunError(
code: freezed == code ? _self.code : code // ignore: cast_nullable_to_non_nullable
as String?,message: null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}

ReasonAIMessagePart _$ReasonAIMessagePartFromJson(
  Map<String, dynamic> json
) {
        switch (json['runtimeType']) {
                  case 'text':
          return ReasonAITextPart.fromJson(
            json
          );
                case 'tool':
          return ReasonAIToolPart.fromJson(
            json
          );
                case 'sources':
          return ReasonAISourcesPart.fromJson(
            json
          );
                case 'visual':
          return ReasonAIVisualPart.fromJson(
            json
          );
                case 'artifact':
          return ReasonAIArtifactPart.fromJson(
            json
          );

          default:
            throw CheckedFromJsonException(
  json,
  'runtimeType',
  'ReasonAIMessagePart',
  'Invalid union type "${json['runtimeType']}"!'
);
        }

}

/// @nodoc
mixin _$ReasonAIMessagePart {



  /// Serializes this ReasonAIMessagePart to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ReasonAIMessagePart);
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => runtimeType.hashCode;

@override
String toString() {
  return 'ReasonAIMessagePart()';
}


}

/// @nodoc
class $ReasonAIMessagePartCopyWith<$Res>  {
$ReasonAIMessagePartCopyWith(ReasonAIMessagePart _, $Res Function(ReasonAIMessagePart) __);
}


/// Adds pattern-matching-related methods to [ReasonAIMessagePart].
extension ReasonAIMessagePartPatterns on ReasonAIMessagePart {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>({TResult Function( ReasonAITextPart value)?  text,TResult Function( ReasonAIToolPart value)?  tool,TResult Function( ReasonAISourcesPart value)?  sources,TResult Function( ReasonAIVisualPart value)?  visual,TResult Function( ReasonAIArtifactPart value)?  artifact,required TResult orElse(),}){
final _that = this;
switch (_that) {
case ReasonAITextPart() when text != null:
return text(_that);case ReasonAIToolPart() when tool != null:
return tool(_that);case ReasonAISourcesPart() when sources != null:
return sources(_that);case ReasonAIVisualPart() when visual != null:
return visual(_that);case ReasonAIArtifactPart() when artifact != null:
return artifact(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>({required TResult Function( ReasonAITextPart value)  text,required TResult Function( ReasonAIToolPart value)  tool,required TResult Function( ReasonAISourcesPart value)  sources,required TResult Function( ReasonAIVisualPart value)  visual,required TResult Function( ReasonAIArtifactPart value)  artifact,}){
final _that = this;
switch (_that) {
case ReasonAITextPart():
return text(_that);case ReasonAIToolPart():
return tool(_that);case ReasonAISourcesPart():
return sources(_that);case ReasonAIVisualPart():
return visual(_that);case ReasonAIArtifactPart():
return artifact(_that);}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>({TResult? Function( ReasonAITextPart value)?  text,TResult? Function( ReasonAIToolPart value)?  tool,TResult? Function( ReasonAISourcesPart value)?  sources,TResult? Function( ReasonAIVisualPart value)?  visual,TResult? Function( ReasonAIArtifactPart value)?  artifact,}){
final _that = this;
switch (_that) {
case ReasonAITextPart() when text != null:
return text(_that);case ReasonAIToolPart() when tool != null:
return tool(_that);case ReasonAISourcesPart() when sources != null:
return sources(_that);case ReasonAIVisualPart() when visual != null:
return visual(_that);case ReasonAIArtifactPart() when artifact != null:
return artifact(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>({TResult Function( String partId,  String text,  bool finalized)?  text,TResult Function( String toolCallId,  String toolName,  String status,  String? summary)?  tool,TResult Function( String partId,  List<ReasonAISource> sources,  String? retrievalStatus,  String? contextToken,  String? notice)?  sources,TResult Function( String partId,  Map<String, dynamic> data)?  visual,TResult Function( String partId,  String proposalId,  ReasonAIArtifactStatus status,  Map<String, dynamic> data,  String? baseArtifactFingerprint)?  artifact,required TResult orElse(),}) {final _that = this;
switch (_that) {
case ReasonAITextPart() when text != null:
return text(_that.partId,_that.text,_that.finalized);case ReasonAIToolPart() when tool != null:
return tool(_that.toolCallId,_that.toolName,_that.status,_that.summary);case ReasonAISourcesPart() when sources != null:
return sources(_that.partId,_that.sources,_that.retrievalStatus,_that.contextToken,_that.notice);case ReasonAIVisualPart() when visual != null:
return visual(_that.partId,_that.data);case ReasonAIArtifactPart() when artifact != null:
return artifact(_that.partId,_that.proposalId,_that.status,_that.data,_that.baseArtifactFingerprint);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>({required TResult Function( String partId,  String text,  bool finalized)  text,required TResult Function( String toolCallId,  String toolName,  String status,  String? summary)  tool,required TResult Function( String partId,  List<ReasonAISource> sources,  String? retrievalStatus,  String? contextToken,  String? notice)  sources,required TResult Function( String partId,  Map<String, dynamic> data)  visual,required TResult Function( String partId,  String proposalId,  ReasonAIArtifactStatus status,  Map<String, dynamic> data,  String? baseArtifactFingerprint)  artifact,}) {final _that = this;
switch (_that) {
case ReasonAITextPart():
return text(_that.partId,_that.text,_that.finalized);case ReasonAIToolPart():
return tool(_that.toolCallId,_that.toolName,_that.status,_that.summary);case ReasonAISourcesPart():
return sources(_that.partId,_that.sources,_that.retrievalStatus,_that.contextToken,_that.notice);case ReasonAIVisualPart():
return visual(_that.partId,_that.data);case ReasonAIArtifactPart():
return artifact(_that.partId,_that.proposalId,_that.status,_that.data,_that.baseArtifactFingerprint);}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>({TResult? Function( String partId,  String text,  bool finalized)?  text,TResult? Function( String toolCallId,  String toolName,  String status,  String? summary)?  tool,TResult? Function( String partId,  List<ReasonAISource> sources,  String? retrievalStatus,  String? contextToken,  String? notice)?  sources,TResult? Function( String partId,  Map<String, dynamic> data)?  visual,TResult? Function( String partId,  String proposalId,  ReasonAIArtifactStatus status,  Map<String, dynamic> data,  String? baseArtifactFingerprint)?  artifact,}) {final _that = this;
switch (_that) {
case ReasonAITextPart() when text != null:
return text(_that.partId,_that.text,_that.finalized);case ReasonAIToolPart() when tool != null:
return tool(_that.toolCallId,_that.toolName,_that.status,_that.summary);case ReasonAISourcesPart() when sources != null:
return sources(_that.partId,_that.sources,_that.retrievalStatus,_that.contextToken,_that.notice);case ReasonAIVisualPart() when visual != null:
return visual(_that.partId,_that.data);case ReasonAIArtifactPart() when artifact != null:
return artifact(_that.partId,_that.proposalId,_that.status,_that.data,_that.baseArtifactFingerprint);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class ReasonAITextPart implements ReasonAIMessagePart {
  const ReasonAITextPart({required this.partId, required this.text, required this.finalized, final  String? $type}): $type = $type ?? 'text';
  factory ReasonAITextPart.fromJson(Map<String, dynamic> json) => _$ReasonAITextPartFromJson(json);

 final  String partId;
 final  String text;
 final  bool finalized;

@JsonKey(name: 'runtimeType')
final String $type;


/// Create a copy of ReasonAIMessagePart
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ReasonAITextPartCopyWith<ReasonAITextPart> get copyWith => _$ReasonAITextPartCopyWithImpl<ReasonAITextPart>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ReasonAITextPartToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ReasonAITextPart&&(identical(other.partId, partId) || other.partId == partId)&&(identical(other.text, text) || other.text == text)&&(identical(other.finalized, finalized) || other.finalized == finalized));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,partId,text,finalized);

@override
String toString() {
  return 'ReasonAIMessagePart.text(partId: $partId, text: $text, finalized: $finalized)';
}


}

/// @nodoc
abstract mixin class $ReasonAITextPartCopyWith<$Res> implements $ReasonAIMessagePartCopyWith<$Res> {
  factory $ReasonAITextPartCopyWith(ReasonAITextPart value, $Res Function(ReasonAITextPart) _then) = _$ReasonAITextPartCopyWithImpl;
@useResult
$Res call({
 String partId, String text, bool finalized
});




}
/// @nodoc
class _$ReasonAITextPartCopyWithImpl<$Res>
    implements $ReasonAITextPartCopyWith<$Res> {
  _$ReasonAITextPartCopyWithImpl(this._self, this._then);

  final ReasonAITextPart _self;
  final $Res Function(ReasonAITextPart) _then;

/// Create a copy of ReasonAIMessagePart
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? partId = null,Object? text = null,Object? finalized = null,}) {
  return _then(ReasonAITextPart(
partId: null == partId ? _self.partId : partId // ignore: cast_nullable_to_non_nullable
as String,text: null == text ? _self.text : text // ignore: cast_nullable_to_non_nullable
as String,finalized: null == finalized ? _self.finalized : finalized // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}


}

/// @nodoc
@JsonSerializable()

class ReasonAIToolPart implements ReasonAIMessagePart {
  const ReasonAIToolPart({required this.toolCallId, required this.toolName, required this.status, this.summary, final  String? $type}): $type = $type ?? 'tool';
  factory ReasonAIToolPart.fromJson(Map<String, dynamic> json) => _$ReasonAIToolPartFromJson(json);

 final  String toolCallId;
 final  String toolName;
 final  String status;
// 'running' | 'completed' | 'failed'
 final  String? summary;

@JsonKey(name: 'runtimeType')
final String $type;


/// Create a copy of ReasonAIMessagePart
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ReasonAIToolPartCopyWith<ReasonAIToolPart> get copyWith => _$ReasonAIToolPartCopyWithImpl<ReasonAIToolPart>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ReasonAIToolPartToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ReasonAIToolPart&&(identical(other.toolCallId, toolCallId) || other.toolCallId == toolCallId)&&(identical(other.toolName, toolName) || other.toolName == toolName)&&(identical(other.status, status) || other.status == status)&&(identical(other.summary, summary) || other.summary == summary));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,toolCallId,toolName,status,summary);

@override
String toString() {
  return 'ReasonAIMessagePart.tool(toolCallId: $toolCallId, toolName: $toolName, status: $status, summary: $summary)';
}


}

/// @nodoc
abstract mixin class $ReasonAIToolPartCopyWith<$Res> implements $ReasonAIMessagePartCopyWith<$Res> {
  factory $ReasonAIToolPartCopyWith(ReasonAIToolPart value, $Res Function(ReasonAIToolPart) _then) = _$ReasonAIToolPartCopyWithImpl;
@useResult
$Res call({
 String toolCallId, String toolName, String status, String? summary
});




}
/// @nodoc
class _$ReasonAIToolPartCopyWithImpl<$Res>
    implements $ReasonAIToolPartCopyWith<$Res> {
  _$ReasonAIToolPartCopyWithImpl(this._self, this._then);

  final ReasonAIToolPart _self;
  final $Res Function(ReasonAIToolPart) _then;

/// Create a copy of ReasonAIMessagePart
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? toolCallId = null,Object? toolName = null,Object? status = null,Object? summary = freezed,}) {
  return _then(ReasonAIToolPart(
toolCallId: null == toolCallId ? _self.toolCallId : toolCallId // ignore: cast_nullable_to_non_nullable
as String,toolName: null == toolName ? _self.toolName : toolName // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,summary: freezed == summary ? _self.summary : summary // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

/// @nodoc
@JsonSerializable()

class ReasonAISourcesPart implements ReasonAIMessagePart {
  const ReasonAISourcesPart({required this.partId, required final  List<ReasonAISource> sources, this.retrievalStatus, this.contextToken, this.notice, final  String? $type}): _sources = sources,$type = $type ?? 'sources';
  factory ReasonAISourcesPart.fromJson(Map<String, dynamic> json) => _$ReasonAISourcesPartFromJson(json);

 final  String partId;
 final  List<ReasonAISource> _sources;
 List<ReasonAISource> get sources {
  if (_sources is EqualUnmodifiableListView) return _sources;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_sources);
}

 final  String? retrievalStatus;
 final  String? contextToken;
 final  String? notice;

@JsonKey(name: 'runtimeType')
final String $type;


/// Create a copy of ReasonAIMessagePart
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ReasonAISourcesPartCopyWith<ReasonAISourcesPart> get copyWith => _$ReasonAISourcesPartCopyWithImpl<ReasonAISourcesPart>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ReasonAISourcesPartToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ReasonAISourcesPart&&(identical(other.partId, partId) || other.partId == partId)&&const DeepCollectionEquality().equals(other._sources, _sources)&&(identical(other.retrievalStatus, retrievalStatus) || other.retrievalStatus == retrievalStatus)&&(identical(other.contextToken, contextToken) || other.contextToken == contextToken)&&(identical(other.notice, notice) || other.notice == notice));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,partId,const DeepCollectionEquality().hash(_sources),retrievalStatus,contextToken,notice);

@override
String toString() {
  return 'ReasonAIMessagePart.sources(partId: $partId, sources: $sources, retrievalStatus: $retrievalStatus, contextToken: $contextToken, notice: $notice)';
}


}

/// @nodoc
abstract mixin class $ReasonAISourcesPartCopyWith<$Res> implements $ReasonAIMessagePartCopyWith<$Res> {
  factory $ReasonAISourcesPartCopyWith(ReasonAISourcesPart value, $Res Function(ReasonAISourcesPart) _then) = _$ReasonAISourcesPartCopyWithImpl;
@useResult
$Res call({
 String partId, List<ReasonAISource> sources, String? retrievalStatus, String? contextToken, String? notice
});




}
/// @nodoc
class _$ReasonAISourcesPartCopyWithImpl<$Res>
    implements $ReasonAISourcesPartCopyWith<$Res> {
  _$ReasonAISourcesPartCopyWithImpl(this._self, this._then);

  final ReasonAISourcesPart _self;
  final $Res Function(ReasonAISourcesPart) _then;

/// Create a copy of ReasonAIMessagePart
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? partId = null,Object? sources = null,Object? retrievalStatus = freezed,Object? contextToken = freezed,Object? notice = freezed,}) {
  return _then(ReasonAISourcesPart(
partId: null == partId ? _self.partId : partId // ignore: cast_nullable_to_non_nullable
as String,sources: null == sources ? _self._sources : sources // ignore: cast_nullable_to_non_nullable
as List<ReasonAISource>,retrievalStatus: freezed == retrievalStatus ? _self.retrievalStatus : retrievalStatus // ignore: cast_nullable_to_non_nullable
as String?,contextToken: freezed == contextToken ? _self.contextToken : contextToken // ignore: cast_nullable_to_non_nullable
as String?,notice: freezed == notice ? _self.notice : notice // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

/// @nodoc
@JsonSerializable()

class ReasonAIVisualPart implements ReasonAIMessagePart {
  const ReasonAIVisualPart({required this.partId, required final  Map<String, dynamic> data, final  String? $type}): _data = data,$type = $type ?? 'visual';
  factory ReasonAIVisualPart.fromJson(Map<String, dynamic> json) => _$ReasonAIVisualPartFromJson(json);

 final  String partId;
 final  Map<String, dynamic> _data;
 Map<String, dynamic> get data {
  if (_data is EqualUnmodifiableMapView) return _data;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_data);
}


@JsonKey(name: 'runtimeType')
final String $type;


/// Create a copy of ReasonAIMessagePart
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ReasonAIVisualPartCopyWith<ReasonAIVisualPart> get copyWith => _$ReasonAIVisualPartCopyWithImpl<ReasonAIVisualPart>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ReasonAIVisualPartToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ReasonAIVisualPart&&(identical(other.partId, partId) || other.partId == partId)&&const DeepCollectionEquality().equals(other._data, _data));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,partId,const DeepCollectionEquality().hash(_data));

@override
String toString() {
  return 'ReasonAIMessagePart.visual(partId: $partId, data: $data)';
}


}

/// @nodoc
abstract mixin class $ReasonAIVisualPartCopyWith<$Res> implements $ReasonAIMessagePartCopyWith<$Res> {
  factory $ReasonAIVisualPartCopyWith(ReasonAIVisualPart value, $Res Function(ReasonAIVisualPart) _then) = _$ReasonAIVisualPartCopyWithImpl;
@useResult
$Res call({
 String partId, Map<String, dynamic> data
});




}
/// @nodoc
class _$ReasonAIVisualPartCopyWithImpl<$Res>
    implements $ReasonAIVisualPartCopyWith<$Res> {
  _$ReasonAIVisualPartCopyWithImpl(this._self, this._then);

  final ReasonAIVisualPart _self;
  final $Res Function(ReasonAIVisualPart) _then;

/// Create a copy of ReasonAIMessagePart
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? partId = null,Object? data = null,}) {
  return _then(ReasonAIVisualPart(
partId: null == partId ? _self.partId : partId // ignore: cast_nullable_to_non_nullable
as String,data: null == data ? _self._data : data // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>,
  ));
}


}

/// @nodoc
@JsonSerializable()

class ReasonAIArtifactPart implements ReasonAIMessagePart {
  const ReasonAIArtifactPart({required this.partId, required this.proposalId, required this.status, required final  Map<String, dynamic> data, this.baseArtifactFingerprint, final  String? $type}): _data = data,$type = $type ?? 'artifact';
  factory ReasonAIArtifactPart.fromJson(Map<String, dynamic> json) => _$ReasonAIArtifactPartFromJson(json);

 final  String partId;
 final  String proposalId;
 final  ReasonAIArtifactStatus status;
 final  Map<String, dynamic> _data;
 Map<String, dynamic> get data {
  if (_data is EqualUnmodifiableMapView) return _data;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_data);
}

 final  String? baseArtifactFingerprint;

@JsonKey(name: 'runtimeType')
final String $type;


/// Create a copy of ReasonAIMessagePart
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ReasonAIArtifactPartCopyWith<ReasonAIArtifactPart> get copyWith => _$ReasonAIArtifactPartCopyWithImpl<ReasonAIArtifactPart>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ReasonAIArtifactPartToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ReasonAIArtifactPart&&(identical(other.partId, partId) || other.partId == partId)&&(identical(other.proposalId, proposalId) || other.proposalId == proposalId)&&(identical(other.status, status) || other.status == status)&&const DeepCollectionEquality().equals(other._data, _data)&&(identical(other.baseArtifactFingerprint, baseArtifactFingerprint) || other.baseArtifactFingerprint == baseArtifactFingerprint));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,partId,proposalId,status,const DeepCollectionEquality().hash(_data),baseArtifactFingerprint);

@override
String toString() {
  return 'ReasonAIMessagePart.artifact(partId: $partId, proposalId: $proposalId, status: $status, data: $data, baseArtifactFingerprint: $baseArtifactFingerprint)';
}


}

/// @nodoc
abstract mixin class $ReasonAIArtifactPartCopyWith<$Res> implements $ReasonAIMessagePartCopyWith<$Res> {
  factory $ReasonAIArtifactPartCopyWith(ReasonAIArtifactPart value, $Res Function(ReasonAIArtifactPart) _then) = _$ReasonAIArtifactPartCopyWithImpl;
@useResult
$Res call({
 String partId, String proposalId, ReasonAIArtifactStatus status, Map<String, dynamic> data, String? baseArtifactFingerprint
});




}
/// @nodoc
class _$ReasonAIArtifactPartCopyWithImpl<$Res>
    implements $ReasonAIArtifactPartCopyWith<$Res> {
  _$ReasonAIArtifactPartCopyWithImpl(this._self, this._then);

  final ReasonAIArtifactPart _self;
  final $Res Function(ReasonAIArtifactPart) _then;

/// Create a copy of ReasonAIMessagePart
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? partId = null,Object? proposalId = null,Object? status = null,Object? data = null,Object? baseArtifactFingerprint = freezed,}) {
  return _then(ReasonAIArtifactPart(
partId: null == partId ? _self.partId : partId // ignore: cast_nullable_to_non_nullable
as String,proposalId: null == proposalId ? _self.proposalId : proposalId // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as ReasonAIArtifactStatus,data: null == data ? _self._data : data // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>,baseArtifactFingerprint: freezed == baseArtifactFingerprint ? _self.baseArtifactFingerprint : baseArtifactFingerprint // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$ReasonAISource {

 String get sourceId; String get title; String get url; String? get kind;
/// Create a copy of ReasonAISource
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ReasonAISourceCopyWith<ReasonAISource> get copyWith => _$ReasonAISourceCopyWithImpl<ReasonAISource>(this as ReasonAISource, _$identity);

  /// Serializes this ReasonAISource to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ReasonAISource&&(identical(other.sourceId, sourceId) || other.sourceId == sourceId)&&(identical(other.title, title) || other.title == title)&&(identical(other.url, url) || other.url == url)&&(identical(other.kind, kind) || other.kind == kind));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,sourceId,title,url,kind);

@override
String toString() {
  return 'ReasonAISource(sourceId: $sourceId, title: $title, url: $url, kind: $kind)';
}


}

/// @nodoc
abstract mixin class $ReasonAISourceCopyWith<$Res>  {
  factory $ReasonAISourceCopyWith(ReasonAISource value, $Res Function(ReasonAISource) _then) = _$ReasonAISourceCopyWithImpl;
@useResult
$Res call({
 String sourceId, String title, String url, String? kind
});




}
/// @nodoc
class _$ReasonAISourceCopyWithImpl<$Res>
    implements $ReasonAISourceCopyWith<$Res> {
  _$ReasonAISourceCopyWithImpl(this._self, this._then);

  final ReasonAISource _self;
  final $Res Function(ReasonAISource) _then;

/// Create a copy of ReasonAISource
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? sourceId = null,Object? title = null,Object? url = null,Object? kind = freezed,}) {
  return _then(_self.copyWith(
sourceId: null == sourceId ? _self.sourceId : sourceId // ignore: cast_nullable_to_non_nullable
as String,title: null == title ? _self.title : title // ignore: cast_nullable_to_non_nullable
as String,url: null == url ? _self.url : url // ignore: cast_nullable_to_non_nullable
as String,kind: freezed == kind ? _self.kind : kind // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [ReasonAISource].
extension ReasonAISourcePatterns on ReasonAISource {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ReasonAISource value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ReasonAISource() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ReasonAISource value)  $default,){
final _that = this;
switch (_that) {
case _ReasonAISource():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ReasonAISource value)?  $default,){
final _that = this;
switch (_that) {
case _ReasonAISource() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String sourceId,  String title,  String url,  String? kind)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ReasonAISource() when $default != null:
return $default(_that.sourceId,_that.title,_that.url,_that.kind);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String sourceId,  String title,  String url,  String? kind)  $default,) {final _that = this;
switch (_that) {
case _ReasonAISource():
return $default(_that.sourceId,_that.title,_that.url,_that.kind);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String sourceId,  String title,  String url,  String? kind)?  $default,) {final _that = this;
switch (_that) {
case _ReasonAISource() when $default != null:
return $default(_that.sourceId,_that.title,_that.url,_that.kind);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ReasonAISource implements ReasonAISource {
  const _ReasonAISource({required this.sourceId, required this.title, required this.url, this.kind});
  factory _ReasonAISource.fromJson(Map<String, dynamic> json) => _$ReasonAISourceFromJson(json);

@override final  String sourceId;
@override final  String title;
@override final  String url;
@override final  String? kind;

/// Create a copy of ReasonAISource
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ReasonAISourceCopyWith<_ReasonAISource> get copyWith => __$ReasonAISourceCopyWithImpl<_ReasonAISource>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ReasonAISourceToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ReasonAISource&&(identical(other.sourceId, sourceId) || other.sourceId == sourceId)&&(identical(other.title, title) || other.title == title)&&(identical(other.url, url) || other.url == url)&&(identical(other.kind, kind) || other.kind == kind));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,sourceId,title,url,kind);

@override
String toString() {
  return 'ReasonAISource(sourceId: $sourceId, title: $title, url: $url, kind: $kind)';
}


}

/// @nodoc
abstract mixin class _$ReasonAISourceCopyWith<$Res> implements $ReasonAISourceCopyWith<$Res> {
  factory _$ReasonAISourceCopyWith(_ReasonAISource value, $Res Function(_ReasonAISource) _then) = __$ReasonAISourceCopyWithImpl;
@override @useResult
$Res call({
 String sourceId, String title, String url, String? kind
});




}
/// @nodoc
class __$ReasonAISourceCopyWithImpl<$Res>
    implements _$ReasonAISourceCopyWith<$Res> {
  __$ReasonAISourceCopyWithImpl(this._self, this._then);

  final _ReasonAISource _self;
  final $Res Function(_ReasonAISource) _then;

/// Create a copy of ReasonAISource
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? sourceId = null,Object? title = null,Object? url = null,Object? kind = freezed,}) {
  return _then(_ReasonAISource(
sourceId: null == sourceId ? _self.sourceId : sourceId // ignore: cast_nullable_to_non_nullable
as String,title: null == title ? _self.title : title // ignore: cast_nullable_to_non_nullable
as String,url: null == url ? _self.url : url // ignore: cast_nullable_to_non_nullable
as String,kind: freezed == kind ? _self.kind : kind // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$ReasonAIRuntimeMessage {

 String get id; String get role;// 'user' | 'assistant'
 List<ReasonAIMessagePart> get parts; ReasonAIMessageStatus get status;
/// Create a copy of ReasonAIRuntimeMessage
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ReasonAIRuntimeMessageCopyWith<ReasonAIRuntimeMessage> get copyWith => _$ReasonAIRuntimeMessageCopyWithImpl<ReasonAIRuntimeMessage>(this as ReasonAIRuntimeMessage, _$identity);

  /// Serializes this ReasonAIRuntimeMessage to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ReasonAIRuntimeMessage&&(identical(other.id, id) || other.id == id)&&(identical(other.role, role) || other.role == role)&&const DeepCollectionEquality().equals(other.parts, parts)&&(identical(other.status, status) || other.status == status));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,role,const DeepCollectionEquality().hash(parts),status);

@override
String toString() {
  return 'ReasonAIRuntimeMessage(id: $id, role: $role, parts: $parts, status: $status)';
}


}

/// @nodoc
abstract mixin class $ReasonAIRuntimeMessageCopyWith<$Res>  {
  factory $ReasonAIRuntimeMessageCopyWith(ReasonAIRuntimeMessage value, $Res Function(ReasonAIRuntimeMessage) _then) = _$ReasonAIRuntimeMessageCopyWithImpl;
@useResult
$Res call({
 String id, String role, List<ReasonAIMessagePart> parts, ReasonAIMessageStatus status
});




}
/// @nodoc
class _$ReasonAIRuntimeMessageCopyWithImpl<$Res>
    implements $ReasonAIRuntimeMessageCopyWith<$Res> {
  _$ReasonAIRuntimeMessageCopyWithImpl(this._self, this._then);

  final ReasonAIRuntimeMessage _self;
  final $Res Function(ReasonAIRuntimeMessage) _then;

/// Create a copy of ReasonAIRuntimeMessage
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? role = null,Object? parts = null,Object? status = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,role: null == role ? _self.role : role // ignore: cast_nullable_to_non_nullable
as String,parts: null == parts ? _self.parts : parts // ignore: cast_nullable_to_non_nullable
as List<ReasonAIMessagePart>,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as ReasonAIMessageStatus,
  ));
}

}


/// Adds pattern-matching-related methods to [ReasonAIRuntimeMessage].
extension ReasonAIRuntimeMessagePatterns on ReasonAIRuntimeMessage {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ReasonAIRuntimeMessage value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ReasonAIRuntimeMessage() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ReasonAIRuntimeMessage value)  $default,){
final _that = this;
switch (_that) {
case _ReasonAIRuntimeMessage():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ReasonAIRuntimeMessage value)?  $default,){
final _that = this;
switch (_that) {
case _ReasonAIRuntimeMessage() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String role,  List<ReasonAIMessagePart> parts,  ReasonAIMessageStatus status)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ReasonAIRuntimeMessage() when $default != null:
return $default(_that.id,_that.role,_that.parts,_that.status);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String role,  List<ReasonAIMessagePart> parts,  ReasonAIMessageStatus status)  $default,) {final _that = this;
switch (_that) {
case _ReasonAIRuntimeMessage():
return $default(_that.id,_that.role,_that.parts,_that.status);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String role,  List<ReasonAIMessagePart> parts,  ReasonAIMessageStatus status)?  $default,) {final _that = this;
switch (_that) {
case _ReasonAIRuntimeMessage() when $default != null:
return $default(_that.id,_that.role,_that.parts,_that.status);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ReasonAIRuntimeMessage implements ReasonAIRuntimeMessage {
  const _ReasonAIRuntimeMessage({required this.id, required this.role, required final  List<ReasonAIMessagePart> parts, required this.status}): _parts = parts;
  factory _ReasonAIRuntimeMessage.fromJson(Map<String, dynamic> json) => _$ReasonAIRuntimeMessageFromJson(json);

@override final  String id;
@override final  String role;
// 'user' | 'assistant'
 final  List<ReasonAIMessagePart> _parts;
// 'user' | 'assistant'
@override List<ReasonAIMessagePart> get parts {
  if (_parts is EqualUnmodifiableListView) return _parts;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_parts);
}

@override final  ReasonAIMessageStatus status;

/// Create a copy of ReasonAIRuntimeMessage
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ReasonAIRuntimeMessageCopyWith<_ReasonAIRuntimeMessage> get copyWith => __$ReasonAIRuntimeMessageCopyWithImpl<_ReasonAIRuntimeMessage>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ReasonAIRuntimeMessageToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ReasonAIRuntimeMessage&&(identical(other.id, id) || other.id == id)&&(identical(other.role, role) || other.role == role)&&const DeepCollectionEquality().equals(other._parts, _parts)&&(identical(other.status, status) || other.status == status));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,role,const DeepCollectionEquality().hash(_parts),status);

@override
String toString() {
  return 'ReasonAIRuntimeMessage(id: $id, role: $role, parts: $parts, status: $status)';
}


}

/// @nodoc
abstract mixin class _$ReasonAIRuntimeMessageCopyWith<$Res> implements $ReasonAIRuntimeMessageCopyWith<$Res> {
  factory _$ReasonAIRuntimeMessageCopyWith(_ReasonAIRuntimeMessage value, $Res Function(_ReasonAIRuntimeMessage) _then) = __$ReasonAIRuntimeMessageCopyWithImpl;
@override @useResult
$Res call({
 String id, String role, List<ReasonAIMessagePart> parts, ReasonAIMessageStatus status
});




}
/// @nodoc
class __$ReasonAIRuntimeMessageCopyWithImpl<$Res>
    implements _$ReasonAIRuntimeMessageCopyWith<$Res> {
  __$ReasonAIRuntimeMessageCopyWithImpl(this._self, this._then);

  final _ReasonAIRuntimeMessage _self;
  final $Res Function(_ReasonAIRuntimeMessage) _then;

/// Create a copy of ReasonAIRuntimeMessage
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? role = null,Object? parts = null,Object? status = null,}) {
  return _then(_ReasonAIRuntimeMessage(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,role: null == role ? _self.role : role // ignore: cast_nullable_to_non_nullable
as String,parts: null == parts ? _self._parts : parts // ignore: cast_nullable_to_non_nullable
as List<ReasonAIMessagePart>,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as ReasonAIMessageStatus,
  ));
}


}


/// @nodoc
mixin _$ReasonAIRuntimeState {

 String? get runId; ReasonAIRunStatus get status; int get lastSeq; List<ReasonAIRuntimeMessage> get messages; ReasonAIRunError? get error; bool get terminalEventReceived;
/// Create a copy of ReasonAIRuntimeState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ReasonAIRuntimeStateCopyWith<ReasonAIRuntimeState> get copyWith => _$ReasonAIRuntimeStateCopyWithImpl<ReasonAIRuntimeState>(this as ReasonAIRuntimeState, _$identity);

  /// Serializes this ReasonAIRuntimeState to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ReasonAIRuntimeState&&(identical(other.runId, runId) || other.runId == runId)&&(identical(other.status, status) || other.status == status)&&(identical(other.lastSeq, lastSeq) || other.lastSeq == lastSeq)&&const DeepCollectionEquality().equals(other.messages, messages)&&(identical(other.error, error) || other.error == error)&&(identical(other.terminalEventReceived, terminalEventReceived) || other.terminalEventReceived == terminalEventReceived));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,runId,status,lastSeq,const DeepCollectionEquality().hash(messages),error,terminalEventReceived);

@override
String toString() {
  return 'ReasonAIRuntimeState(runId: $runId, status: $status, lastSeq: $lastSeq, messages: $messages, error: $error, terminalEventReceived: $terminalEventReceived)';
}


}

/// @nodoc
abstract mixin class $ReasonAIRuntimeStateCopyWith<$Res>  {
  factory $ReasonAIRuntimeStateCopyWith(ReasonAIRuntimeState value, $Res Function(ReasonAIRuntimeState) _then) = _$ReasonAIRuntimeStateCopyWithImpl;
@useResult
$Res call({
 String? runId, ReasonAIRunStatus status, int lastSeq, List<ReasonAIRuntimeMessage> messages, ReasonAIRunError? error, bool terminalEventReceived
});


$ReasonAIRunErrorCopyWith<$Res>? get error;

}
/// @nodoc
class _$ReasonAIRuntimeStateCopyWithImpl<$Res>
    implements $ReasonAIRuntimeStateCopyWith<$Res> {
  _$ReasonAIRuntimeStateCopyWithImpl(this._self, this._then);

  final ReasonAIRuntimeState _self;
  final $Res Function(ReasonAIRuntimeState) _then;

/// Create a copy of ReasonAIRuntimeState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? runId = freezed,Object? status = null,Object? lastSeq = null,Object? messages = null,Object? error = freezed,Object? terminalEventReceived = null,}) {
  return _then(_self.copyWith(
runId: freezed == runId ? _self.runId : runId // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as ReasonAIRunStatus,lastSeq: null == lastSeq ? _self.lastSeq : lastSeq // ignore: cast_nullable_to_non_nullable
as int,messages: null == messages ? _self.messages : messages // ignore: cast_nullable_to_non_nullable
as List<ReasonAIRuntimeMessage>,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as ReasonAIRunError?,terminalEventReceived: null == terminalEventReceived ? _self.terminalEventReceived : terminalEventReceived // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}
/// Create a copy of ReasonAIRuntimeState
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ReasonAIRunErrorCopyWith<$Res>? get error {
    if (_self.error == null) {
    return null;
  }

  return $ReasonAIRunErrorCopyWith<$Res>(_self.error!, (value) {
    return _then(_self.copyWith(error: value));
  });
}
}


/// Adds pattern-matching-related methods to [ReasonAIRuntimeState].
extension ReasonAIRuntimeStatePatterns on ReasonAIRuntimeState {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ReasonAIRuntimeState value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ReasonAIRuntimeState() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ReasonAIRuntimeState value)  $default,){
final _that = this;
switch (_that) {
case _ReasonAIRuntimeState():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ReasonAIRuntimeState value)?  $default,){
final _that = this;
switch (_that) {
case _ReasonAIRuntimeState() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? runId,  ReasonAIRunStatus status,  int lastSeq,  List<ReasonAIRuntimeMessage> messages,  ReasonAIRunError? error,  bool terminalEventReceived)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ReasonAIRuntimeState() when $default != null:
return $default(_that.runId,_that.status,_that.lastSeq,_that.messages,_that.error,_that.terminalEventReceived);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? runId,  ReasonAIRunStatus status,  int lastSeq,  List<ReasonAIRuntimeMessage> messages,  ReasonAIRunError? error,  bool terminalEventReceived)  $default,) {final _that = this;
switch (_that) {
case _ReasonAIRuntimeState():
return $default(_that.runId,_that.status,_that.lastSeq,_that.messages,_that.error,_that.terminalEventReceived);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? runId,  ReasonAIRunStatus status,  int lastSeq,  List<ReasonAIRuntimeMessage> messages,  ReasonAIRunError? error,  bool terminalEventReceived)?  $default,) {final _that = this;
switch (_that) {
case _ReasonAIRuntimeState() when $default != null:
return $default(_that.runId,_that.status,_that.lastSeq,_that.messages,_that.error,_that.terminalEventReceived);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ReasonAIRuntimeState implements ReasonAIRuntimeState {
  const _ReasonAIRuntimeState({this.runId, this.status = ReasonAIRunStatus.idle, this.lastSeq = 0, final  List<ReasonAIRuntimeMessage> messages = const [], this.error, this.terminalEventReceived = false}): _messages = messages;
  factory _ReasonAIRuntimeState.fromJson(Map<String, dynamic> json) => _$ReasonAIRuntimeStateFromJson(json);

@override final  String? runId;
@override@JsonKey() final  ReasonAIRunStatus status;
@override@JsonKey() final  int lastSeq;
 final  List<ReasonAIRuntimeMessage> _messages;
@override@JsonKey() List<ReasonAIRuntimeMessage> get messages {
  if (_messages is EqualUnmodifiableListView) return _messages;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_messages);
}

@override final  ReasonAIRunError? error;
@override@JsonKey() final  bool terminalEventReceived;

/// Create a copy of ReasonAIRuntimeState
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ReasonAIRuntimeStateCopyWith<_ReasonAIRuntimeState> get copyWith => __$ReasonAIRuntimeStateCopyWithImpl<_ReasonAIRuntimeState>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ReasonAIRuntimeStateToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ReasonAIRuntimeState&&(identical(other.runId, runId) || other.runId == runId)&&(identical(other.status, status) || other.status == status)&&(identical(other.lastSeq, lastSeq) || other.lastSeq == lastSeq)&&const DeepCollectionEquality().equals(other._messages, _messages)&&(identical(other.error, error) || other.error == error)&&(identical(other.terminalEventReceived, terminalEventReceived) || other.terminalEventReceived == terminalEventReceived));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,runId,status,lastSeq,const DeepCollectionEquality().hash(_messages),error,terminalEventReceived);

@override
String toString() {
  return 'ReasonAIRuntimeState(runId: $runId, status: $status, lastSeq: $lastSeq, messages: $messages, error: $error, terminalEventReceived: $terminalEventReceived)';
}


}

/// @nodoc
abstract mixin class _$ReasonAIRuntimeStateCopyWith<$Res> implements $ReasonAIRuntimeStateCopyWith<$Res> {
  factory _$ReasonAIRuntimeStateCopyWith(_ReasonAIRuntimeState value, $Res Function(_ReasonAIRuntimeState) _then) = __$ReasonAIRuntimeStateCopyWithImpl;
@override @useResult
$Res call({
 String? runId, ReasonAIRunStatus status, int lastSeq, List<ReasonAIRuntimeMessage> messages, ReasonAIRunError? error, bool terminalEventReceived
});


@override $ReasonAIRunErrorCopyWith<$Res>? get error;

}
/// @nodoc
class __$ReasonAIRuntimeStateCopyWithImpl<$Res>
    implements _$ReasonAIRuntimeStateCopyWith<$Res> {
  __$ReasonAIRuntimeStateCopyWithImpl(this._self, this._then);

  final _ReasonAIRuntimeState _self;
  final $Res Function(_ReasonAIRuntimeState) _then;

/// Create a copy of ReasonAIRuntimeState
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? runId = freezed,Object? status = null,Object? lastSeq = null,Object? messages = null,Object? error = freezed,Object? terminalEventReceived = null,}) {
  return _then(_ReasonAIRuntimeState(
runId: freezed == runId ? _self.runId : runId // ignore: cast_nullable_to_non_nullable
as String?,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as ReasonAIRunStatus,lastSeq: null == lastSeq ? _self.lastSeq : lastSeq // ignore: cast_nullable_to_non_nullable
as int,messages: null == messages ? _self._messages : messages // ignore: cast_nullable_to_non_nullable
as List<ReasonAIRuntimeMessage>,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as ReasonAIRunError?,terminalEventReceived: null == terminalEventReceived ? _self.terminalEventReceived : terminalEventReceived // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}

/// Create a copy of ReasonAIRuntimeState
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ReasonAIRunErrorCopyWith<$Res>? get error {
    if (_self.error == null) {
    return null;
  }

  return $ReasonAIRunErrorCopyWith<$Res>(_self.error!, (value) {
    return _then(_self.copyWith(error: value));
  });
}
}

// dart format on
