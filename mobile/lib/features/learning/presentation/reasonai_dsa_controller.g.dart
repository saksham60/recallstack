// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reasonai_dsa_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(ReasonAIDSAController)
final reasonAIDSAControllerProvider = ReasonAIDSAControllerFamily._();

final class ReasonAIDSAControllerProvider
    extends $NotifierProvider<ReasonAIDSAController, ReasonAIRuntimeState> {
  ReasonAIDSAControllerProvider._({
    required ReasonAIDSAControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'reasonAIDSAControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$reasonAIDSAControllerHash();

  @override
  String toString() {
    return r'reasonAIDSAControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  ReasonAIDSAController create() => ReasonAIDSAController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ReasonAIRuntimeState value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ReasonAIRuntimeState>(value),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ReasonAIDSAControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$reasonAIDSAControllerHash() =>
    r'2a310b6bd593650a3fcb9f16b7c5101688ce9b3d';

final class ReasonAIDSAControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          ReasonAIDSAController,
          ReasonAIRuntimeState,
          ReasonAIRuntimeState,
          ReasonAIRuntimeState,
          String
        > {
  ReasonAIDSAControllerFamily._()
    : super(
        retry: null,
        name: r'reasonAIDSAControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  ReasonAIDSAControllerProvider call(String contentId) =>
      ReasonAIDSAControllerProvider._(argument: contentId, from: this);

  @override
  String toString() => r'reasonAIDSAControllerProvider';
}

abstract class _$ReasonAIDSAController extends $Notifier<ReasonAIRuntimeState> {
  late final _$args = ref.$arg as String;
  String get contentId => _$args;

  ReasonAIRuntimeState build(String contentId);
  @$mustCallSuper
  @override
  void runBuild() {
    final ref = this.ref as $Ref<ReasonAIRuntimeState, ReasonAIRuntimeState>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<ReasonAIRuntimeState, ReasonAIRuntimeState>,
              ReasonAIRuntimeState,
              Object?,
              Object?
            >;
    element.handleCreate(ref, () => build(_$args));
  }
}
